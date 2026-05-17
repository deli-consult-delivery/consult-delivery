import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:        z.string().uuid().optional(),
  triggered_by:     z.string().uuid().optional(),
  custom_theme:     z.string().optional(),  // tema fornecido manualmente
  custom_brief:     z.string().optional(),  // contexto adicional
  force_new:        z.boolean().optional(), // ignora idempotência
  weekday_override: z.number().int().min(0).max(6).optional(), // dia da semana selecionado no formulário (0=Dom..6=Sáb)
  formats:          z.enum(["feed", "story", "both"]).optional(), // quais formatos gerar (padrão: both)
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
  img_group_url:     z.string().url().optional(), // 16:9 · 1800×630  · Feed
  img_portrait_url:  z.string().url().optional(), // 9:16 · 1024×1820 · Stories Instagram + Status WhatsApp
  theme:             z.string(),
  date:              z.string(),
  formats:           z.enum(["feed", "story", "both"]).optional(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ─── Calendários editoriais ───────────────────────────────────────────────────

type WeeklyCalendar = { id: string; themes: Record<number, string> };

const CALENDARS: WeeklyCalendar[] = [
  {
    id: "A",
    themes: {
      1: "planejamento da semana",
      2: "cardápio e ficha técnica",
      3: "atendimento e tempo de entrega",
      4: "marketing e campanhas",
      5: "análise de números",
      6: "time, processo e descanso",
    },
  },
  {
    id: "B",
    themes: {
      1: "atrair (visibilidade no iFood)",
      2: "converter (cardápio que vende)",
      3: "encantar (experiência de entrega)",
      4: "reter (fidelização e CRM)",
      5: "faturar (ticket médio e upsell)",
      6: "refletir e ajustar",
    },
  },
  {
    id: "C",
    themes: {
      1: "produto (cardápio e ficha técnica)",
      2: "preço (margem, taxa, ticket)",
      3: "praça (iFood, próprio, WhatsApp)",
      4: "promoção (anúncio, cupom, gatilho)",
      5: "pessoas (equipe, atendimento, motoboy)",
      6: "pausa estratégica",
    },
  },
  {
    id: "D",
    themes: {
      1: "mentalidade de crescimento",
      2: "disciplina operacional",
      3: "coragem pra mudar o que não funciona",
      4: "visão de futuro (tendências)",
      5: "gratidão e resultados",
      6: "descanso ativo",
    },
  },
  {
    id: "E",
    themes: {
      1: "o que aprendi semana passada",
      2: "um erro comum no delivery",
      3: "um acerto que vale copiar",
      4: "uma tendência que está chegando",
      5: "um número que diz a verdade",
      6: "uma pergunta pra refletir",
    },
  },
  {
    id: "F",
    themes: {
      1: "defina a meta da semana",
      2: "revise seu cardápio",
      3: "olhe seu PMV e taxa de cancelamento",
      4: "teste uma novidade no app",
      5: "reconheça quem vendeu mais",
      6: "tire o dia pra cuidar de você",
    },
  },
];

function getCalendar(calendarId: string | undefined, dateStr: string): WeeklyCalendar {
  if (calendarId && calendarId !== "auto") {
    return CALENDARS.find(c => c.id === calendarId) ?? CALENDARS[0];
  }
  // Auto: rotate by ISO week number
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const jan1 = new Date(y, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  return CALENDARS[weekNum % CALENDARS.length];
}

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
    isSat:   weekday === 6,
  };
}

// ─── Helper: gerar imagem via OpenRouter (Recraft V4.1 Utility) ──────────────

type MsgContent = string | Array<Record<string, unknown>>;

async function generateImage(content: MsgContent, format: "group" | "portrait"): Promise<string> {
  // aspect_ratio é ignorado pelo OpenRouter/Recraft — usar size com px explícito
  // group = Feed 1800×630, portrait = 9:16 Story 1024×1820
  const size = format === "group" ? "1920x1080" : "1080x1920";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY não configurado no Trigger.dev");

  const contentLen = typeof content === "string" ? content.length : JSON.stringify(content).length;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info("bom-dia: recraft request", { format, size, attempt, contentLen });
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
          messages: [{ role: "user", content }],
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
        contentLen,
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
    const isPortrait    = dims.height > dims.width;
    const isSquare      = dims.height === dims.width;
    const wantsPortrait = expectedFormat === "portrait";
    if (wantsPortrait && !isPortrait) {
      // Recraft ignorou size — aceitar assim mesmo (evita derrubar o run)
      logger.warn("bom-dia: portrait retornou orientação errada — continuando", {
        dims, size: wantsPortrait ? "1024x1820" : "1820x1024", isSquare,
      });
    } else if (!wantsPortrait && isPortrait) {
      logger.warn("bom-dia: group retornou orientação errada — continuando", { dims });
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
  const spDate = getSPDate();
  // weekday_override permite ao formulário sobrescrever o dia detectado automaticamente
  const weekday = input.weekday_override ?? spDate.weekday;
  const dayName = DAY_NAMES[weekday] ?? spDate.dayName;
  const isSat   = weekday === 6;
  const dateStr = spDate.dateStr;

  const isManual = !!(input.custom_theme || input.custom_brief || input.force_new || input.weekday_override !== undefined);
  const formats  = input.formats ?? "both";

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

  // 2. Ler memória, instruções e calendário do agente salvas pelo usuário
  let agentMemory = "";
  let agentInstructions = "";
  let calendarId = "auto";
  if (input.tenant_id) {
    const { data: cfgRow } = await sb
      .from("tenant_agent_config")
      .select("config")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "bom-dia")
      .maybeSingle();
    const cfg = cfgRow?.config as Record<string, string> | null;
    agentMemory       = cfg?.memory       ?? "";
    agentInstructions = cfg?.instructions ?? "";
    calendarId        = cfg?.calendar_id  ?? "auto";
  }

  // Tema efetivo: custom_theme tem prioridade sobre o calendário selecionado
  const autoTheme = getCalendar(calendarId, dateStr).themes[weekday] ?? "motivação";
  const theme     = input.custom_theme?.trim() || autoTheme;

  logger.info("bom-dia-gerar-imagem iniciado", { dateStr, dayName, theme, calendarId, isManual });

  // 2b. Ler feedbacks recentes para orientar a geração
  let feedbackContext = "";
  if (input.tenant_id) {
    const { data: feedbacks } = await sb
      .from("bom_dia_feedback")
      .select("vote, comment")
      .eq("tenant_id", input.tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (feedbacks && feedbacks.length > 0) {
      const positivos = feedbacks.filter((f) => f.vote === "thumbs_up").length;
      const negativos = feedbacks.filter((f) => f.vote === "thumbs_down").length;
      const criticas = feedbacks
        .filter((f) => f.vote === "thumbs_down" && f.comment)
        .map((f) => `"${f.comment}"`)
        .join(", ");
      const elogios = feedbacks
        .filter((f) => f.vote === "thumbs_up" && f.comment)
        .map((f) => `"${f.comment}"`)
        .join(", ");

      feedbackContext = `\n\nFeedback acumulado das últimas ${feedbacks.length} postagens avaliadas: ${positivos} positivo(s) 👍, ${negativos} negativo(s) 👎.`;
      if (criticas) feedbackContext += ` Críticas recebidas: ${criticas} — aplique essas correções diretamente na arte.`;
      if (elogios)  feedbackContext += ` Elogios recebidos: ${elogios} — mantenha esses elementos.`;
      feedbackContext += negativos > positivos
        ? " Varie mais a composição, elementos visuais e estilo para melhorar."
        : " Continue no estilo atual — está sendo bem recebido.";
    }
  }

  const memoryBlock = agentMemory.trim()
    ? `\n\nMemória do agente (instruções salvas pelo usuário):\n${agentMemory.trim()}`
    : "";

  const instructionsBlock = agentInstructions.trim()
    ? `\n\nInstruções personalizadas:\n${agentInstructions.trim()}`
    : "";

  // 3. Claude gera prompt DALL-E + legenda completa
  const anthropic = new Anthropic();

  const hoursLine = isSat
    ? "🕗 Atendimento Consult Delivery: 08:00–12:00"
    : "🕘 Atendimento Consult Delivery: 09:00–12:00 | 13:00–18:00 (intervalo de almoço das 12:00 às 13:00)";

  const briefLine = input.custom_brief?.trim()
    ? `\nContexto adicional (PRIORIDADE — guia a criatividade): ${input.custom_brief.trim()}`
    : "";

  const claudeResp = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1200,
    system: `Você é o Superagente de Imagens de Bom Dia da Consult Delivery — consultoria de delivery do Wandson Silva. Seg–Sáb às 09h, gere o pacote diário: prompt de imagem + headline + legenda + tema.

═══ ESTILO VISUAL — REGRAS RÍGIDAS ═══
Paleta EXCLUSIVA (use SOMENTE estas cores):
  #0D0D0D (fundo dominante ~70%) · #050505 (sombras profundas) · #B70C00 (vermelho marca)
  #8A0900 (vermelho escuro gradiente) · #FFFFFF (branco) · #6E6E6E (cinza neutro)
PROIBIDO: azul, amarelo, verde, laranja, roxo, dourado, pastel, neon, glitch, gradientes coloridos.

Fundo: preto puro #0D0D0D + degradê radial vermelho #B70C00 (~55% opacidade) vindo do CANTO INFERIOR ESQUERDO.
Elementos técnicos obrigatórios (sutis):
  • 6–12 linhas finas de wi-fi/sinal (branco/vermelho semi-transparente, 20–40% opac.) cruzando o TOPO
  • 4–8 trilhas de "circuito impresso" em vermelho saindo do CANTO INFERIOR ESQUERDO, com nós brancos nos cruzamentos (30–60% opac.)

═══ CENA ISOMÉTRICA 3D (OBRIGATÓRIA) ═══
Renderização estilo Cinema 4D/Blender, ângulo ~30°, iluminação dramática vermelha de baixo-esquerda.
Elementos canônicos — use 4–6 destes por arte:
  • Tablet preto: dashboard de pedidos (gráficos de barra, valores R$, setas crescimento vermelhas)
  • Celular preto: app de delivery (card de pedido, botão vermelho de ação)
  • Caixa de papelão preta: foguete Consult Delivery estampado em branco/vermelho
  • Caderno espiral: checklist manuscrita (caneta preta + círculos/destaques vermelhos)
  • Engrenagem cinza pequena (representa automação/processo)
  • Pasta/clipboard preta · Notebook entreaberto com gráficos (segundo plano)
PROIBIDO na cena: pessoas, mãos, rostos, mascotes, comida real (pizza/hambúrguer/sushi/etc.),
bandeiras, balões, confetes, sparkles. Sem texto inventado dentro dos dispositivos (apenas barras/ícones).

═══ TIPOGRAFIA ═══
Headline: font condensada bold sem serifa (Oswald/Inter ExtraBold), branca #FFFFFF, Title Case.
Sublinha: font regular, cinza #6E6E6E ou branco 80%.
SEM emoji no design. SEM itálico. SEM glow. SEM contorno duplo.

═══ COMPOSIÇÃO E LOGO (OBRIGATÓRIO) ═══
TODA arte deve incluir o logotipo da Consult Delivery no canto inferior direito:
  • Foguete estilizado em vermelho #B70C00 com chamas brancas, fundo transparente (sem caixa)
  • Texto "Consult Delivery" em fonte condensada bold branca ao lado do foguete
  • Tamanho: ~10% da largura total — visível mas discreto

STORY 9:16 (vertical): headline no topo-esquerdo · cena isométrica na parte inferior · logo Consult Delivery (foguete vermelho + texto branco) no canto inferior direito.
FEED 16:9 (landscape): cena isométrica à esquerda · headline+sublinha à direita · logo Consult Delivery (foguete vermelho + texto branco) no canto inferior direito.

═══ LEGENDA WHATSAPP (4 blocos, PT-BR) ═══
Estrutura FIXA — 4 blocos separados por linha em branco:
  Bloco 1: [1 emoji temático: 🧭/🚀/🎯/⚡/⏰/📊] Bom dia da equipe Consult Delivery!
  Bloco 2: 2–3 frases conectando o tema à realidade do dono de delivery (pedidos, ticket médio, cardápio, iFood, equipe). Termina com palavra-chave do tema.
  Bloco 3: "🕗 Atendimento Consult Delivery: [horário exato]"
  Bloco 4: Convite de disponibilidade. SEM links, @, telefone, hashtags, CTAs de compra.

Retorne SOMENTE JSON válido, sem texto extra.${memoryBlock}${instructionsBlock}${feedbackContext}`,
    messages: [{
      role:    "user",
      content: `Dia: ${dayName}
Tema: ${theme}
Data: ${dateStr}
Horário: ${hoursLine}${briefLine}

Gere JSON com exatamente 4 campos:

1. "dalle_prompt" (em INGLÊS — para gerador de imagem Recraft V4.1):
   Descreva a cena completa seguindo o estilo obrigatório:
   - Dark black background #0D0D0D with dramatic red radial light-leak #B70C00 from bottom-left corner blending into ~40% of canvas
   - Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), dramatic red rim light from bottom-left, deep black shadows #050505 on opposite side
   - 4–6 isometric mockups from approved list: [matte black tablet displaying delivery order dashboard with red bar charts and R$ values | black smartphone with delivery app showing red CTA button and order card | matte black cardboard delivery box with white/red rocket logo stamp | spiral notebook with handwritten checklist and red circle highlights | small gray metallic gear | black document clipboard/folder]
   - Subtle wi-fi/signal wave lines crossing the top (white and red, 20–40% opacity, curved, thin ~1px)
   - Circuit trace paths from bottom-left corner, small white node dots at intersections (red, 30–60% opacity)
   - Bottom-right corner: Consult Delivery logo — a red rocket #B70C00 with white flame details beside bold white text "Consult Delivery" in condensed sans-serif, logo ~10% of canvas width, no box or background around it
   - Bold white condensed sans-serif headline text area related to: "${theme}"
   - Color palette STRICTLY: #0D0D0D, #050505, #B70C00, #8A0900, #FFFFFF, #6E6E6E — NO other colors
   - NO people, hands, faces, mascots, real food, balloons, flags, confetti, neon, anime, cartoon, watercolor
   - DO NOT mention pixel dimensions or aspect ratio in this prompt

2. "text_on_image" (PT-BR, máx 7 palavras, Title Case): headline curta e impactante para a arte, tema: "${theme}"

3. "caption" (PT-BR, EXATAMENTE 4 blocos separados por linha em branco):
   Bloco 1: [emoji temático único] Bom dia da equipe Consult Delivery!
   Bloco 2: 2–3 frases sobre "${theme}" para donos de delivery
   Bloco 3: ${hoursLine}
   Bloco 4: disponibilidade da equipe (sem links, @, hashtag)

4. "theme": tema resumido em PT-BR

Retorne: {"dalle_prompt":"...","text_on_image":"...","caption":"...","theme":"..."}`,
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

  // Paths únicos por run — evita sobrescrita entre gerações no mesmo dia
  const pathId              = runId.slice(-8);
  const groupStoragePath    = `bom-dia/${dateStr}-${pathId}-feed-1920x1080.webp`;
  const portraitStoragePath = `bom-dia/${dateStr}-${pathId}-story-1080x1920.webp`;

  // 4. Prompts de texto puro — Recraft respeita size com texto (multimodal quebra)
  // Headline e área de logo são adicionados como sufixo ao prompt gerado pelo Claude
  const textSuffix = `Bold white condensed headline text center-stage (Title Case, no glow, no italic): "${claudeOut.text_on_image}". Bottom-right corner: Consult Delivery logo — red rocket #B70C00 with white flame trails beside bold white text "Consult Delivery" in condensed sans-serif, ~10% canvas width, no box/background around logo.`;
  const feedPrompt     = `${claudeOut.dalle_prompt}. Horizontal landscape composition, mockups on left half, headline text area on right half. ${textSuffix}`;
  const portraitPrompt = `${claudeOut.dalle_prompt}. Vertical portrait composition, headline text at top-left, isometric mockups in lower portion. ${textSuffix}`;

  let imgGroupUrl: string | undefined;
  let imgPortraitUrl: string | undefined;

  if (formats === "feed" || formats === "both") {
    logger.info("bom-dia: gerando Feed 1800×630 via Recraft V4.1");
    const groupTempUrl = await generateImage(feedPrompt, "group");
    logger.info("bom-dia: upload Feed para Supabase Storage");
    imgGroupUrl = await uploadToStorage(groupTempUrl, groupStoragePath, "group");
  }

  if (formats === "story" || formats === "both") {
    logger.info("bom-dia: gerando Story 9:16 via Recraft V4.1");
    const portraitTempUrl = await generateImage(portraitPrompt, "portrait");
    logger.info("bom-dia: upload Story para Supabase Storage");
    imgPortraitUrl = await uploadToStorage(portraitTempUrl, portraitStoragePath, "portrait");
  }

  const output: Output = OutputSchema.parse({
    caption:          claudeOut.caption,
    img_group_url:    imgGroupUrl,
    img_portrait_url: imgPortraitUrl,
    theme:            claudeOut.theme,
    date:             dateStr,
    formats,
  });

  // 6. Audit log
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
