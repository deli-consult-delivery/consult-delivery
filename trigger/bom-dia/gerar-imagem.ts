import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:    z.string().uuid().optional(),
  triggered_by: z.string().uuid().optional(),
  custom_theme: z.string().optional(), // tema fornecido manualmente pelo usuário
  custom_brief: z.string().optional(), // contexto adicional fornecido pelo usuário
  force_new:    z.boolean().optional(), // ignora idempotência e gera nova arte
});

const ClaudeOutputSchema = z.object({
  dalle_prompt:  z.string(),
  text_on_image: z.string(),
  caption:       z.string(),
  theme:         z.string(),
});

const OutputSchema = z.object({
  caption:           z.string(),
  img_landscape_url: z.string().url().optional(), // legado — runs antigos
  img_group_url:     z.string().url(),            // 16:9 · 1200×630  · Feed (Facebook/Instagram/WhatsApp link)
  img_portrait_url:  z.string().url(),            // 9:16 · 1080×1920 · Stories Instagram + Status WhatsApp
  theme:             z.string(),
  date:              z.string(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ─── Tema por dia da semana ───────────────────────────────────────────────────

const THEMES: Record<number, string> = {
  1: "energia para começar a semana",
  2: "foco e persistência",
  3: "metade da semana – ânimo",
  4: "crescimento e superação",
  5: "celebração da semana",
  6: "reflexão e preparação",
  0: "descanso e recarga",
};

const DAY_NAMES: Record<number, string> = {
  0: "Domingo",    1: "Segunda-feira", 2: "Terça-feira",
  3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado",
};

// ─── Helper: data no fuso de São Paulo (UTC-3, sem DST desde 2020) ───────────

function getSPDate() {
  const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
  const nowSP = new Date(Date.now() + SP_OFFSET_MS);
  const dateStr = nowSP.toISOString().split("T")[0]; // YYYY-MM-DD
  const weekday = nowSP.getUTCDay();
  return {
    dateStr,
    weekday,
    dayName: DAY_NAMES[weekday],
    theme:   THEMES[weekday] ?? "motivação",
    isSat:   weekday === 6,
  };
}

// ─── Helper: gerar imagem via OpenRouter (Recraft V4.1 Utility) ──────────────

async function generateImage(prompt: string, format: "group" | "portrait"): Promise<string> {
  // aspect_ratio é ignorado pelo OpenRouter/Recraft — usar size com px explícito
  // group = landscape 16:9 (1820×1024), portrait = 9:16 (1024×1820)
  const size = format === "group" ? "1820x1024" : "1024x1820";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY não configurado no Trigger.dev");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info("bom-dia: recraft request", { format, size, attempt, promptLength: prompt.length });
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer":  "https://app.consultdelivery.com.br",
          "X-Title":       "Consult Delivery Bom Dia",
        },
        body: JSON.stringify({
          model:    "recraft/recraft-v4.1-utility",
          messages: [{ role: "user", content: prompt }],
          size,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!r.ok) {
        const detail = await r.text();
        throw new Error(`OpenRouter ${r.status}: ${detail.slice(0, 300)}`);
      }

      const rawText = await r.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`OpenRouter retornou resposta não-JSON: ${rawText.slice(0, 300)}`);
      }

      // Recraft retorna imagem em message.images (não em message.content)
      type MsgWithImages = {
        content: unknown;
        images?: Array<{ type: string; image_url?: { url: string } }>;
      };
      const choices = data.choices as Array<{ message: MsgWithImages }> | undefined;
      const msg     = choices?.[0]?.message;

      let url: string | undefined;

      // 1. message.images (Recraft via OpenRouter)
      if (msg?.images?.[0]?.image_url?.url) {
        url = msg.images[0].image_url.url;
      }
      // 2. message.content string
      if (!url && typeof msg?.content === "string" && (msg.content as string).trim()) {
        url = (msg.content as string).trim();
      }
      // 3. message.content array
      if (!url && Array.isArray(msg?.content)) {
        const block = (msg!.content as Array<Record<string, unknown>>).find(b => b.type === "image_url");
        url = (block?.image_url as { url?: string } | undefined)?.url;
      }
      // 4. data[0].url (images API format)
      const imgData = (data.data as Array<{ url?: string }> | undefined)?.[0];
      if (!url && imgData?.url) url = imgData.url;

      if (!url) throw new Error(`OpenRouter não retornou imagem. Preview: ${rawText.slice(0, 400)}`);
      return url;
    } catch (err) {
      logger.warn(`bom-dia: tentativa ${attempt}/3 geração falhou`, {
        format,
        size,
        error: (err as Error).message,
      });
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error("generateImage: esgotou retentativas");
}

// ─── Helper: parse de dimensões inline (sem deps externas) ───────────────────

function parseImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 8) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    if (buf.length < 24) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xFF) break;
      const marker = buf[offset + 1];
      const len    = buf.readUInt16BE(offset + 2);
      if (marker >= 0xC0 && marker <= 0xC3) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      offset += 2 + len;
    }
    return null;
  }
  // WebP VP8X (formato mais comum retornado pelo Recraft)
  if (
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4)  === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunkId = buf.toString("ascii", 12, 16);
    if (chunkId === "VP8X") {
      return {
        width:  (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
      };
    }
    // VP8L (lossless)
    if (chunkId === "VP8L" && buf.length >= 25 && buf[20] === 0x2F) {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1 };
    }
  }
  return null;
}

// ─── Helper: download + upload para Supabase Storage ─────────────────────────

async function uploadToStorage(
  imageData:      string,
  storagePath:    string,
  expectedFormat: "group" | "portrait",
): Promise<string> {
  let buffer: Buffer;
  let contentType = "image/webp";

  if (imageData.startsWith("data:")) {
    const commaIdx = imageData.indexOf(",");
    const meta     = imageData.slice(5, commaIdx);
    contentType    = meta.split(";")[0];
    buffer         = Buffer.from(imageData.slice(commaIdx + 1), "base64");
  } else {
    const imgResp = await fetch(imageData, { signal: AbortSignal.timeout(30_000) });
    if (!imgResp.ok) throw new Error(`Falha ao baixar imagem: ${imgResp.status}`);
    buffer = Buffer.from(await imgResp.arrayBuffer());
  }

  // Valida orientação — detecta quando Recraft ignorou o parâmetro size
  const dims = parseImageDimensions(buffer);
  logger.info("bom-dia: recraft response dims", {
    format: expectedFormat,
    dims,
    bytes:  buffer.length,
    storagePath,
  });
  if (dims) {
    const isPortrait   = dims.height > dims.width;
    const wantsPortrait = expectedFormat === "portrait";
    if (wantsPortrait && !isPortrait) {
      throw new Error(
        `Dimensões incorretas para portrait: esperado height>width, recebido ${dims.width}×${dims.height}. ` +
        `Recraft ignorou o parâmetro size="1024x1820".`
      );
    }
    if (!wantsPortrait && isPortrait) {
      throw new Error(
        `Dimensões incorretas para group: esperado width>height, recebido ${dims.width}×${dims.height}. ` +
        `Recraft ignorou o parâmetro size="1820x1024".`
      );
    }
  }

  const sb = getSupabase();

  const { error } = await sb.storage.from("public").upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });

  if (error) throw new Error(`Supabase Storage upload falhou: ${error.message}`);

  const { data: { publicUrl } } = sb.storage.from("public").getPublicUrl(storagePath);
  logger.info("bom-dia: supabase upload result", { storagePath, dims, bytes: buffer.length });
  return publicUrl;
}

// ─── Lógica principal (compartilhada entre on-demand e agendamentos) ──────────

async function executar(input: Input, runId: string): Promise<Output> {
  const { dateStr, weekday, dayName, theme: autoTheme, isSat } = getSPDate();

  // Tema efetivo: custom_theme tem prioridade sobre o automático por dia da semana
  const isManual = !!(input.custom_theme || input.custom_brief || input.force_new);
  const theme    = input.custom_theme?.trim() || autoTheme;

  logger.info("bom-dia-gerar-imagem iniciado", { dateStr, dayName, theme, isManual });

  const sb = getSupabase();

  // 1. Idempotência — pula se for geração manual (force_new, tema ou brief customizados)
  if (!isManual) {
    const { data: existing } = await sb
      .from("agent_runs")
      .select("output")
      .eq("agent_id", "bom-dia")
      .eq("status", "success")
      .gte("created_at", new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (existing?.output && (existing.output as Record<string, unknown>).date === dateStr) {
      logger.info("bom-dia: run de hoje já existe, retornando cache", { dateStr });
      return OutputSchema.parse(existing.output);
    }
  } else {
    logger.info("bom-dia: geração manual — idempotência ignorada", {
      force_new:    input.force_new,
      custom_theme: input.custom_theme,
      custom_brief: input.custom_brief,
    });
  }

  // Domingo não está no calendário (exceto se tema customizado fornecido)
  if (weekday === 0 && !input.custom_theme) {
    throw new Error("Domingo não está no calendário do Bom Dia (seg–sáb)");
  }

  // 2. Claude gera prompt DALL-E + legenda completa
  const anthropic = new Anthropic();

  const hoursLine = isSat
    ? "🕗 Atendimento Consult Delivery: 08:00–12:00"
    : "🕘 Atendimento Consult Delivery: 09:00–12:00 | 13:00–18:00 (intervalo de almoço das 12:00 às 13:00)";

  const briefLine = input.custom_brief?.trim()
    ? `\nContexto adicional (PRIORIDADE sobre paleta padrão): ${input.custom_brief.trim()}`
    : "";

  const claudeResp = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `Você é o criador de conteúdo da Consult Delivery, consultoria para negócios de delivery.

Identidade visual Consult Delivery:
- Logo: foguete estilizado vermelho + texto "Consult Delivery" + tagline "Consultoria para Delivery"
- Cores: fundo azul escuro profundo + acentos vermelho/laranja energético
- Estilo: moderno, profissional, vibrante, alto contraste, legível em celular

Regras:
- Texto NA ARTE: sempre em PT-BR, máx 7 palavras, forte e direto, conectado à realidade de delivery
- Legenda: PT-BR, sem hashtags, tom motivacional e próximo
- Prompt DALL-E: sempre em inglês (melhora qualidade)
- Retorne SOMENTE JSON válido, sem texto extra`,
    messages: [{
      role:    "user",
      content: `Dia: ${dayName}
Tema: ${theme}
Data: ${dateStr}
Horários para a legenda: ${hoursLine}${briefLine}

Gere:
1. "dalle_prompt": prompt em inglês detalhado para Recraft — arte motivacional para donos de delivery. OBRIGATÓRIO: dark deep navy blue background (hex #0a1628 ou similar), vibrant red and orange energetic accents exclusively (NO other accent colors), delivery-themed elements (routes, packages, growth arrows, speed lines), Consult Delivery rocket logo bottom-left corner, professional high-contrast composition with space for bold Portuguese text center-stage. A mesma arte será gerada em dois formatos: landscape 16:9 (1200×630, Feed social media) e portrait 9:16 (1080×1920, Stories). NÃO mencione pixel, resolução ou proporção no prompt.
2. "text_on_image": texto curto em PT-BR (máx 7 palavras) para aparecer NA arte — conectado ao tema "${theme}", direto e impactante.
3. "caption": legenda completa em PT-BR para WhatsApp: (a) emoji temático + "Bom dia da equipe Consult Delivery!" + frase motivacional original sobre "${theme}" conectada à rotina de delivery, (b) linha com os horários exatamente como fornecidos acima, (c) frase curta de disponibilidade da equipe. Sem hashtags. Parágrafos curtos.
4. "theme": o tema do dia em PT-BR (resumido, ex: "foco e persistência").

Retorne JSON: {"dalle_prompt":"...","text_on_image":"...","caption":"...","theme":"..."}`,
    }],
  });

  const rawText = claudeResp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude não retornou JSON válido");

  const claudeOut = ClaudeOutputSchema.parse(JSON.parse(jsonMatch[0]));

  logger.info("bom-dia: conteúdo gerado pelo Claude", {
    theme:       claudeOut.theme,
    textOnImage: claudeOut.text_on_image,
  });

  // 3. Gerar duas imagens em paralelo via OpenRouter (Recraft V4.1 Utility)
  // Com custom_brief: brief assume controle criativo, sem override de paleta obrigatória
  const fullPrompt = input.custom_brief?.trim()
    ? `${claudeOut.dalle_prompt}. ${input.custom_brief.trim()}. Prominent bold white/light text center-stage: "${claudeOut.text_on_image}" in Portuguese. Consult Delivery rocket logo bottom-left corner. High contrast, professional composition.`
    : `${claudeOut.dalle_prompt}. Prominent bold white/light text center-stage: "${claudeOut.text_on_image}" in Portuguese. MANDATORY BRAND RULES: background color exactly #0a1628 (deep navy blue) — NO variation allowed, accent colors strictly #B70C00 (red) and #FF6B35 (orange) ONLY — no other hues, Consult Delivery rocket logo bottom-left corner, white text only, maximum contrast. CONSISTENCY RULE: the 16:9 (landscape Feed 1200×630) and 9:16 (portrait Story 1080×1920) versions must use the exact same scene, lighting, color palette, and composition — only the crop/framing differs.`;

  logger.info("bom-dia: gerando 2 formatos (16:9 Feed 1200×630 · 9:16 Story 1080×1920) via Recraft V4.1");

  const [groupTempUrl, portraitTempUrl] = await Promise.all([
    generateImage(fullPrompt, "group"),
    generateImage(fullPrompt, "portrait"),
  ]);

  // 4. Download + upload permanente no Supabase Storage
  logger.info("bom-dia: fazendo upload para Supabase Storage (2 formatos)");

  const [imgGroupUrl, imgPortraitUrl] = await Promise.all([
    uploadToStorage(groupTempUrl,    `bom-dia/${dateStr}-group.webp`,   "group"),
    uploadToStorage(portraitTempUrl, `bom-dia/${dateStr}-portrait.webp`, "portrait"),
  ]);

  const output: Output = OutputSchema.parse({
    caption:          claudeOut.caption,
    img_group_url:    imgGroupUrl,
    img_portrait_url: imgPortraitUrl,
    theme:            claudeOut.theme,
    date:             dateStr,
  });

  // 5. Audit log
  await logAgentRun({
    runId,
    agentSlug:   "bom-dia",
    tenantId:    input.tenant_id,
    triggeredBy: input.triggered_by,
    input,
    output,
    status:      "success",
  });

  logger.info("bom-dia-gerar-imagem concluído", {
    dateStr,
    theme:       output.theme,
    groupUrl:    imgGroupUrl,
    portraitUrl: imgPortraitUrl,
  });

  return output;
}

// ─── Task on-demand ───────────────────────────────────────────────────────────

export const bomDiaGerarImagem = task({
  id:    "bom-dia-gerar-imagem",
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});

    try {
      return await executar(input, ctx.run.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("bom-dia-gerar-imagem falhou", { error: errorMessage });

      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "bom-dia",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:      { error: errorMessage },
        status:      "failed",
      });

      throw error;
    }
  },
});

// ─── Agendamento: Segunda–Sexta às 08:55 SP (11:55 UTC) ──────────────────────

export const bomDiaScheduleWeekday = schedules.task({
  id:    "bom-dia-schedule-weekday",
  cron:  "55 11 * * 1-5",
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async () => {
    logger.info("bom-dia-schedule-weekday: disparando (seg–sex)");
    await bomDiaGerarImagem.trigger({});
  },
});

// ─── Agendamento: Sábado às 07:55 SP (10:55 UTC) ─────────────────────────────

export const bomDiaScheduleSabado = schedules.task({
  id:    "bom-dia-schedule-sabado",
  cron:  "55 10 * * 6",
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async () => {
    logger.info("bom-dia-schedule-sabado: disparando (sáb)");
    await bomDiaGerarImagem.trigger({});
  },
});
