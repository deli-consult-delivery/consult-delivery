import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

async function withOverloadedRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 529 && attempt < maxAttempts) {
        const delay = attempt * 15_000;
        logger.warn(`Anthropic overloaded (529) — aguardando ${delay / 1000}s antes de tentar novamente`, { attempt });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withOverloadedRetry: unreachable");
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:        z.string().uuid().optional(),
  triggered_by:     z.string().uuid().optional(),
  custom_theme:     z.string().optional(),
  custom_brief:     z.string().optional(),
  force_new:        z.boolean().optional(),
  weekday_override: z.number().int().min(0).max(6).optional(),
  formats:          z.enum(["feed", "story", "both"]).optional(),
});

const ClaudeOutputSchema = z.object({
  dalle_prompt:  z.string(),
  text_on_image: z.string(),
  caption:       z.string(),
  theme:         z.string(),
});

const OutputSchema = z.object({
  caption:           z.string(),
  img_group_url:     z.string().url().optional(),
  img_portrait_url:  z.string().url().optional(),
  theme:             z.string(),
  date:              z.string(),
  formats:           z.enum(["feed", "story", "both"]).optional(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ─── Temas por dia da semana ──────────────────────────────────────────────────

const DAILY_THEME: Record<number, string> = {
  1: "balanço do dia de segunda — missão cumprida",
  2: "fechamento da terça — operação concluída",
  3: "quarta encerrada — meio da semana vencido",
  4: "quinta finalizada — chegando na reta final",
  5: "sexta encerrada — fim de semana merecido",
  6: "sábado ao meio-dia — equipe de plantão descansando",
};

const DAY_NAMES: Record<number, string> = {
  0: "Domingo",    1: "Segunda-feira", 2: "Terça-feira",
  3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado",
};

// ─── Tom por dia da semana ────────────────────────────────────────────────────

const CLOSING_TONE: Record<number, { mood: string; elements: string; lighting: string }> = {
  1: {
    mood:     "mission accomplished — first day done, rhythm established",
    elements: "delivery rider parking motorcycle after last run, delivery bag resting, city lights turning on at dusk",
    lighting: "warm golden hour glow from horizon, orange and amber tones, long shadows",
  },
  2: {
    mood:     "consistent execution — another day of steady delivery completed",
    elements: "delivery scooter silhouette against city skyline at twilight, delivery boxes stacked neatly, route map with completed pins",
    lighting: "purple-orange dusk sky, city lights beginning to appear, warm vignette",
  },
  3: {
    mood:     "halfway there — midweek milestone conquered",
    elements: "motoboy isometric 3D in city at dusk, thermal bag closed and resting, half-week progress visual",
    lighting: "cinematic blue-hour lighting, city transitioning from day to night",
  },
  4: {
    mood:     "almost at the finish line — strong close heading into the weekend",
    elements: "delivery rider heading home at sunset, city skyline silhouette, nearly-full delivery schedule completed",
    lighting: "deep orange sunset rays, warm backlight on rider, dramatic shadows",
  },
  5: {
    mood:     "week conquered — strong close, weekend earned",
    elements: "delivery bag with checkmark overlay, city at golden hour, motoboy raising arm in victory",
    lighting: "vibrant warm sunset with orange light trails, celebratory atmosphere",
  },
  6: {
    mood:     "saturday wrap — half-day well done, rest is well earned",
    elements: "empty delivery scooter parked on quiet midday street, delivery bag set down, clock showing noon",
    lighting: "bright noon light softened by gentle overcast, peaceful calm atmosphere",
  },
};

// ─── Estilos visuais — 4 rotativos ───────────────────────────────────────────

interface VisualStyle {
  id:            string;
  name:          string;
  bgDesc:        string;
  headlineColor: "white" | "dark";
}

const VISUAL_STYLE_LIBRARY: VisualStyle[] = [
  {
    id:            "A",
    name:          "Pôr do Sol Urbano",
    bgDesc:        "warm gradient background: deep orange #D4540A at bottom-left bleeding into dark charcoal #1A1A1A at top-right, city skyline silhouette in dark silhouette at bottom horizon, NO circuit boards, NO PCB patterns, NO neon signs",
    headlineColor: "white",
  },
  {
    id:            "B",
    name:          "Noite Chegando",
    bgDesc:        "deep navy-to-black gradient #080C1A at top blending to #0D0D0D at bottom, distant city building lights as tiny warm dots, minimal and cinematic, NO circuit boards, NO PCB patterns",
    headlineColor: "white",
  },
  {
    id:            "C",
    name:          "Minimalista Quente",
    bgDesc:        "clean warm off-white #FAF7F2 or cream background, large negative space, flat minimalist design, only orange #f97316 and dark #1A1A1A as accents — NO dark backgrounds, NO heavy gradients",
    headlineColor: "dark",
  },
  {
    id:            "D",
    name:          "Flat Entardecer",
    bgDesc:        "rich dark background #161820 with vibrant flat-vector or isometric 3D illustrated composition, warm dusk color palette (orange, amber, deep red), cohesive and colorful — city street at dusk",
    headlineColor: "white",
  },
];

function selectVisualStyle(weekday: number, dateStr: string): VisualStyle {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const jan1    = new Date(y, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  const idx = (weekday + weekNum) % VISUAL_STYLE_LIBRARY.length;
  return VISUAL_STYLE_LIBRARY[idx];
}

// ─── Helper: data no fuso de São Paulo ───────────────────────────────────────

function getSPDate() {
  const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
  const nowSP = new Date(Date.now() + SP_OFFSET_MS);
  const dateStr = nowSP.toISOString().split("T")[0];
  const weekday = nowSP.getUTCDay();
  return {
    dateStr,
    weekday,
    dayName: DAY_NAMES[weekday],
    isSat:   weekday === 6,
  };
}

// ─── Helper: gerar imagem via OpenRouter (Recraft V4.1 Utility) ──────────────

async function generateImage(prompt: string, format: "group" | "portrait"): Promise<string> {
  const size = format === "group" ? "1820x1024" : "1024x1820";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY não configurado no Trigger.dev");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info("encerramento: recraft request", { format, size, attempt, promptLen: prompt.length });
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer":  "https://app.consultdelivery.com.br",
          "X-Title":       "Consult Delivery Encerramento",
        },
        body: JSON.stringify({
          model:    "recraft/recraft-v4.1-utility",
          messages: [{ role: "user", content: prompt }],
          size,
          n:        1,
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

      type MsgWithImages = { content: unknown; images?: Array<{ image_url?: { url: string } }> };
      const msg = (data.choices as Array<{ message: MsgWithImages }> | undefined)?.[0]?.message;
      if (msg?.images?.[0]?.image_url?.url) return msg.images[0].image_url.url;
      if (typeof msg?.content === "string" && (msg.content as string).trim()) return (msg.content as string).trim();

      type ImgItem = { url?: string; b64_json?: string };
      const imgData = (data.data as Array<ImgItem> | undefined)?.[0];
      if (imgData?.url) return imgData.url;
      if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

      throw new Error(`OpenRouter não retornou imagem. Preview: ${rawText.slice(0, 400)}`);
    } catch (err) {
      logger.warn(`encerramento: tentativa ${attempt}/3 geração falhou`, {
        format, size, error: (err as Error).message,
      });
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error("generateImage: esgotou retentativas");
}

// ─── Helper: parse de dimensões inline ───────────────────────────────────────

function parseImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    if (buf.length < 24) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
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

  const dims = parseImageDimensions(buffer);
  logger.info("encerramento: recraft response dims", {
    format: expectedFormat,
    dims,
    bytes:  buffer.length,
    storagePath,
  });
  if (dims) {
    const isPortrait  = dims.height > dims.width;
    const wantsPortrait = expectedFormat === "portrait";
    if (wantsPortrait && !isPortrait) {
      logger.warn("encerramento: portrait retornou orientação errada — continuando", { dims });
    } else if (!wantsPortrait && isPortrait) {
      logger.warn("encerramento: group retornou orientação errada — continuando", { dims });
    }
  }

  const sb = getSupabase();
  const { error } = await sb.storage.from("public").upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Supabase Storage upload falhou: ${error.message}`);
  const { data: { publicUrl } } = sb.storage.from("public").getPublicUrl(storagePath);
  logger.info("encerramento: supabase upload result", { storagePath, dims, bytes: buffer.length });
  return publicUrl;
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

async function executar(input: Input, runId: string): Promise<Output> {
  const spDate  = getSPDate();
  const weekday = input.weekday_override ?? spDate.weekday;
  const dayName = DAY_NAMES[weekday] ?? spDate.dayName;
  const isSat   = weekday === 6;
  const dateStr = spDate.dateStr;

  const isManual = !!(input.custom_theme || input.custom_brief || input.force_new || input.weekday_override !== undefined);
  const formats  = input.formats ?? "both";

  const sb = getSupabase();

  // 1. Idempotência (pula se geração manual)
  if (!isManual) {
    const { data: existing } = await sb
      .from("agent_runs")
      .select("output")
      .eq("agent_id", "encerramento")
      .eq("status", "success")
      .gte("created_at", new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (existing?.output && (existing.output as Record<string, unknown>).date === dateStr) {
      logger.info("encerramento: run de hoje já existe, retornando cache", { dateStr });
      return OutputSchema.parse(existing.output);
    }
  }

  // Domingo não está no calendário
  if (weekday === 0 && !input.custom_theme) {
    throw new Error("Domingo não está no calendário do Encerramento (seg–sáb)");
  }

  const autoTheme   = DAILY_THEME[weekday] ?? "encerramento do expediente";
  const theme       = input.custom_theme?.trim() || autoTheme;
  const closingTone = CLOSING_TONE[weekday] ?? CLOSING_TONE[5];
  const visualStyle = selectVisualStyle(weekday, dateStr);

  logger.info("encerramento-gerar-imagem iniciado", { dateStr, dayName, theme, isManual });

  const anthropic = new Anthropic();

  const returnLine = isSat
    ? "🕘 Segunda-feira voltamos às 09h | Emergências via WhatsApp"
    : "🕘 Voltamos amanhã às 09h | Emergências via WhatsApp";

  const briefLine = input.custom_brief?.trim()
    ? `\nContexto adicional: ${input.custom_brief.trim()}`
    : "";

  const customBriefInstruction = input.custom_brief?.trim()
    ? `PRIORITY SCENE: ${input.custom_brief.trim()} — if person, depict as flat-vector or isometric 3D, never photorealistic.`
    : "";

  const headlineColorRule = visualStyle.headlineColor === "dark"
    ? `bold dark #1A1A1A or orange #f97316 condensed headline text`
    : `bold white #FFFFFF condensed headline text`;

  const greetingLine = isSat ? "Bom fim de semana!" : "Boa noite!";

  const claudeResp = await withOverloadedRetry(() => anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1400,
    system: `Você é o Superagente de Imagens de Encerramento de Expediente da Consult Delivery — consultoria de delivery do Wandson Silva. Gere diariamente: prompt de imagem (Recraft) + headline + legenda WhatsApp para o encerramento do dia de trabalho.

═══ ESTILOS VISUAIS ═══
O estilo do dia é indicado no input. Siga RIGOROSAMENTE o estilo indicado — não misture estilos.

Estilo A — PÔR DO SOL URBANO: gradiente quente laranja→escuro, silhueta de cidade no horizonte. Sensação de fim do dia de trabalho. Headline branca.

Estilo B — NOITE CHEGANDO: fundo marinho profundo, luzes da cidade ao longe, atmosfera serena. Headline branca.

Estilo C — MINIMALISTA QUENTE: fundo creme ou off-white, composição limpa, acentos laranja e escuro. Headline preta/laranja. SEM fundo escuro.

Estilo D — FLAT ENTARDECER: fundo escuro rico com ilustração flat-vector ou isométrica 3D, paleta quente (laranja, âmbar, vermelho profundo), rua ao entardecer. Headline branca.

═══ ELEMENTOS VISUAIS — TOM DE ENCERRAMENTO ═══
Elementos adequados: motoboy estacionando/descansando, bag térmica fechada e pousada, rua ao entardecer, cidade com luzes acendendo, relógio marcando fim do expediente, checkmark de missão cumprida, skyline ao pôr do sol, rota de entrega com todos os pins marcados.

NÃO usar: sol nascente, café da manhã, elementos de início do dia, ton enérgico/matinal.
NÃO usar: circuit board patterns, PCB dots, neon signs, fotografia realista de alimentos.

═══ LOGO CONSULT DELIVERY (OBRIGATÓRIO) ═══
Canto inferior direito: foguete laranja #f97316 + chamas brancas + texto "Consult Delivery" condensado bold branco (~10% da largura total). Sem caixa ao redor (Estilo C: pode ter fundo laranja pequeno para contraste).

═══ LEGENDA WHATSAPP (PT-BR — máx 4 linhas, tom de encerramento) ═══
Linha 1: "${greetingLine}" + [1 emoji] + frase calorosa de encerramento relacionada ao tema (máx 10 palavras)
Linha 2: frase mostrando que a Consult Delivery cumpriu mais um dia ao lado da operação do cliente (máx 12 palavras)
[linha em branco]
Linha 3: horário de retorno (ex: "${returnLine}")
SEM links, SEM @, SEM hashtag, SEM CTA de compra

Retorne SOMENTE JSON válido, sem texto extra.`,
    messages: [{
      role:    "user",
      content: `Dia: ${dayName}
Tema: ${theme}
Data: ${dateStr}
Estilo visual do dia: Estilo ${visualStyle.id} — ${visualStyle.name}
Horário de retorno: ${returnLine}${briefLine}
Tom do dia: ${closingTone.mood}
Elementos sugeridos: ${closingTone.elements}
Iluminação: ${closingTone.lighting}

Gere JSON com exatamente 4 campos:

1. "dalle_prompt" (em INGLÊS — para gerador Recraft V4.1):
   Siga RIGOROSAMENTE o Estilo ${visualStyle.id}. Estrutura obrigatória:
   - Background: ${visualStyle.bgDesc}
   - Lighting: ${closingTone.lighting} adapted to Style ${visualStyle.id}
   ${customBriefInstruction ? `- ${customBriefInstruction}` : `- Scene elements: ${closingTone.elements} — convey end of workday, rest, mission accomplished`}
   - NO people faces (flat-vector or isometric 3D illustration only if people are needed)
   - Logo (MANDATORY): bottom-right corner — orange rocket #f97316 with white flame trails beside bold white text "Consult Delivery" in condensed sans-serif, ~10% canvas width, no box/background
   - Headline text on image: ${headlineColorRule} (Title Case, max 7 words, no glow, no italic): related to "${theme}"
   - NO circuit boards, NO PCB patterns, NO electronic circuit dots, NO microchip grid, NO real food photography, NO balloons, NO confetti, NO neon signs, NO anime/manga, NO watercolor
   - DO NOT mention pixel dimensions or aspect ratio in this prompt

2. "text_on_image" (PT-BR, máx 7 palavras, Title Case): headline curta sobre encerramento do dia relacionada a "${theme}"

3. "caption" (PT-BR — máx 4 linhas, tom de encerramento):
   Linha 1: "${greetingLine}" + [1 emoji] + frase calorosa de encerramento sobre "${theme}" (máx 10 palavras)
   Linha 2: frase mostrando que a Consult Delivery cumpriu mais um dia ao lado da operação do cliente (máx 12 palavras)
   [linha em branco]
   Linha 3: "${returnLine}"
   — sem links, @, hashtag, CTA de compra

4. "theme": tema resumido em PT-BR

Retorne: {"dalle_prompt":"...","text_on_image":"...","caption":"...","theme":"..."}`,
    }],
  }));

  const rawText = claudeResp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude não retornou JSON válido");

  const claudeOut = ClaudeOutputSchema.parse(JSON.parse(jsonMatch[0]));

  logger.info("encerramento: conteúdo gerado pelo Claude", {
    theme:       claudeOut.theme,
    textOnImage: claudeOut.text_on_image,
  });

  const pathId              = runId.slice(-8);
  const groupStoragePath    = `encerramento/${dateStr}-${pathId}-feed-1820x1024.webp`;
  const portraitStoragePath = `encerramento/${dateStr}-${pathId}-story-1024x1820.webp`;

  const textSuffix = `Bold white condensed headline text center-stage (Title Case, no glow, no italic): "${claudeOut.text_on_image}". Bottom-right corner: Consult Delivery logo — orange rocket #f97316 with white flame trails beside bold white text "Consult Delivery" in condensed sans-serif, ~10% canvas width, no box/background around logo.`;

  const feedLayoutCue     = `HORIZONTAL LANDSCAPE 16:9 composition: main visual elements fill center and right side, wide panoramic layout, headline text zone on the left third.`;
  const portraitLayoutCue = `VERTICAL PORTRAIT 9:16 composition: TALL narrow vertical format, headline text fills the TOP THIRD of the canvas, main visual scene fills the CENTER and BOTTOM two-thirds, narrow column layout optimized for mobile Story viewing.`;

  const feedPrompt     = `${claudeOut.dalle_prompt}. ${feedLayoutCue} ${textSuffix}`;
  const portraitPrompt = `${claudeOut.dalle_prompt}. ${portraitLayoutCue} ${textSuffix}`;

  let imgGroupUrl: string | undefined;
  let imgPortraitUrl: string | undefined;

  if (formats === "feed" || formats === "both") {
    logger.info("encerramento: gerando Feed 16:9 via Recraft V4.1");
    const groupTempUrl = await generateImage(feedPrompt, "group");
    imgGroupUrl = await uploadToStorage(groupTempUrl, groupStoragePath, "group");
  }

  if (formats === "story" || formats === "both") {
    if (formats === "both") {
      try {
        logger.info("encerramento: gerando Story 9:16 via Recraft V4.1");
        const portraitTempUrl = await generateImage(portraitPrompt, "portrait");
        imgPortraitUrl = await uploadToStorage(portraitTempUrl, portraitStoragePath, "portrait");
      } catch (portraitErr) {
        logger.warn("encerramento: story generation failed, continuing with feed only", {
          error: (portraitErr as Error).message,
        });
      }
    } else {
      logger.info("encerramento: gerando Story 9:16 via Recraft V4.1");
      const portraitTempUrl = await generateImage(portraitPrompt, "portrait");
      imgPortraitUrl = await uploadToStorage(portraitTempUrl, portraitStoragePath, "portrait");
    }
  }

  const output: Output = OutputSchema.parse({
    caption:          claudeOut.caption,
    img_group_url:    imgGroupUrl,
    img_portrait_url: imgPortraitUrl,
    theme:            claudeOut.theme,
    date:             dateStr,
    formats,
  });

  await logAgentRun({
    runId,
    agentSlug:   "encerramento",
    tenantId:    input.tenant_id,
    triggeredBy: input.triggered_by,
    input,
    output,
    status:      "success",
  });

  logger.info("encerramento-gerar-imagem concluído", {
    dateStr,
    theme:       output.theme,
    groupUrl:    imgGroupUrl,
    portraitUrl: imgPortraitUrl,
  });

  return output;
}

// ─── Task on-demand ───────────────────────────────────────────────────────────

export const encerramentoGerarImagem = task({
  id:    "encerramento-gerar-imagem",
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});

    try {
      return await executar(input, ctx.run.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("encerramento-gerar-imagem falhou", { error: errorMessage });

      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "encerramento",
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
