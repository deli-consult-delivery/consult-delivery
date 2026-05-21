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

// ─── Mapa de tons por dia da semana ──────────────────────────────────────────

const DAILY_TONE: Record<number, { mood: string; elements: string; lighting: string }> = {
  0: {
    mood:     "celebration — the week was conquered, next cycle starts strong",
    elements: "delivery rider raising helmet in victory, delivery boxes stacked with confetti-like motion lines, upward arrows",
    lighting: "festive general glow, triumphant light particles",
  },
  1: {
    mood:     "Monday morning energy — rhythm and discipline to start the week",
    elements: "delivery rider on motorcycle in motion blur through city street, thermal delivery bag in foreground, upward arrows",
    lighting: "diagonal red light rays from the left side cutting across the composition",
  },
  2: {
    mood:     "focused and consistent — maintaining rhythm through disciplined execution",
    elements: "isometric city block with delivery scooter on route, red pin markers on street map, delivery box stack",
    lighting: "central red glow, dark deep background, tight vignette",
  },
  3: {
    mood:     "midweek evolution — halfway through, stronger than the start",
    elements: "motoboy isometric 3D on electric scooter mid-delivery, thermal bag logo visible, urban building silhouettes in background",
    lighting: "subtle blue-tinted radial glow with red accent points (only day with secondary accent)",
  },
  4: {
    mood:     "refinement and growth — small adjustments leading to big results",
    elements: "delivery route map with multiple pins and dashed paths, restaurant storefront isometric, growing bar chart overlay",
    lighting: "red spotlight from above, high contrast dramatic shadows",
  },
  5: {
    mood:     "discipline becomes results — strong close, opening a better next week",
    elements: "delivery rider silhouette speeding through city street at dusk, horizontal motion light trails, delivery boxes with wings (motion effect)",
    lighting: "vibrant horizontal red light trails across the composition",
  },
  6: {
    mood:     "strategic reflection — analyzing what worked, planning what comes next",
    elements: "bird-eye view isometric city map with delivery routes, small moto icons on route, growth arrow overlay",
    lighting: "soft illumination, less saturated, contemplative atmosphere",
  },
};

// ─── Biblioteca de frases por dia da semana ──────────────────────────────────

type PhrasePair = { main: string; sub?: string };

const PHRASE_LIBRARY: Record<number, PhrasePair[]> = {
  0: [
    { main: "Seu delivery venceu mais uma semana" },
    { main: "Semana fechada, próxima já chega forte" },
    { main: "Comemora hoje, amanhã o ciclo recomeça" },
  ],
  1: [
    { main: "Organize cedo, venda com ritmo",          sub: "Segunda-feira: energia para começar a semana" },
    { main: "Comece com clareza, termine com lucro" },
    { main: "Plano na mão, motoboy na rua" },
    { main: "Semana forte no delivery" },
    { main: "Primeira virada da semana começa agora" },
  ],
  2: [
    { main: "Foco hoje, resultado constante" },
    { main: "Disciplina vira resultado no delivery" },
    { main: "Constância é o segredo do pedido recorrente" },
    { main: "Cada turno é uma chance de melhorar" },
  ],
  3: [
    { main: "Quarta firme, delivery em evolução" },
    { main: "Ânimo no meio, delivery no topo" },
    { main: "Metade da semana, dobro da intenção" },
    { main: "Ritmo de quarta é ritmo de quem cresce" },
  ],
  4: [
    { main: "Cresça em cada ajuste",                   sub: "Quinta de evolução no delivery" },
    { main: "Pequenos ajustes, grandes pedidos" },
    { main: "Refine hoje, fature amanhã" },
    { main: "Cresça um pedido por vez" },
  ],
  5: [
    { main: "Sexta de virada, fim de semana de meta" },
    { main: "Fechamento forte abre semana melhor" },
    { main: "Disciplina vira resultado no delivery" },
  ],
  6: [
    { main: "Revisar hoje, vender melhor",              sub: "Revisar o ciclo, preparar o próximo" },
    { main: "Analise o que rodou, planeje o que vem" },
    { main: "O melhor delivery começa no caderno" },
  ],
};

function selectPhrase(weekday: number, dateStr: string): PhrasePair {
  const phrases = PHRASE_LIBRARY[weekday] ?? PHRASE_LIBRARY[1];
  const [y, m, d] = dateStr.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const jan1    = new Date(y, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  return phrases[weekNum % phrases.length];
}

// ─── Palette library — rotates to prevent visual fatigue ─────────────────────

interface Palette {
  name:        string;
  background:  string; // DALL-E background description
  rimLight:    string; // DALL-E rim light description
  colors:      string; // strict color palette line for DALL-E
}

const PALETTE_LIBRARY: Palette[] = [
  {
    name:       "Consult Red",
    background: "Dark black background #0D0D0D with dramatic red radial light-leak #B70C00 from bottom-left corner blending into ~40% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), dramatic red rim light from bottom-left, deep black shadows #050505 on opposite side",
    colors:     "Color palette STRICTLY: #0D0D0D, #050505, #B70C00, #8A0900, #FFFFFF, #6E6E6E — NO other colors",
  },
  {
    name:       "iFood Coral",
    background: "Very dark charcoal background #111111 with warm coral-red radial glow #EA1D2C from bottom-left blending into ~35% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), coral-red rim light from bottom-left, near-black shadows #080808 on opposite side",
    colors:     "Color palette STRICTLY: #111111, #080808, #EA1D2C, #B01020, #FFFFFF, #707070 — NO other colors",
  },
  {
    name:       "Tech Blue",
    background: "Deep navy background #080C14 with electric blue radial light-leak #1A6FD4 from bottom-left corner blending into ~40% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), electric blue rim light from bottom-left, near-black shadows #04070D on opposite side",
    colors:     "Color palette STRICTLY: #080C14, #04070D, #1A6FD4, #0F4F9E, #FFFFFF, #5A7FAA — NO other colors",
  },
  {
    name:       "Finance Green",
    background: "Dark slate background #0A0F0A with deep emerald radial glow #0D7A45 from bottom-left corner blending into ~35% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), emerald rim light from bottom-left, near-black shadows #050905 on opposite side",
    colors:     "Color palette STRICTLY: #0A0F0A, #050905, #0D7A45, #085C33, #FFFFFF, #4A7A5A — NO other colors",
  },
  {
    name:       "Management Gold",
    background: "Dark charcoal background #0E0C08 with warm amber radial light-leak #C47D00 from bottom-left corner blending into ~38% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), amber-gold rim light from bottom-left, near-black shadows #080600 on opposite side",
    colors:     "Color palette STRICTLY: #0E0C08, #080600, #C47D00, #935C00, #FFFFFF, #7A6A40 — NO other colors",
  },
  {
    name:       "Delivery Purple",
    background: "Very dark background #0C0812 with deep violet radial glow #6B21A8 from bottom-left corner blending into ~40% of canvas",
    rimLight:   "Isometric 3D composition (~30° angle, Cinema 4D/Blender style render), violet rim light from bottom-left, near-black shadows #060408 on opposite side",
    colors:     "Color palette STRICTLY: #0C0812, #060408, #6B21A8, #4E187D, #FFFFFF, #8A60AA — NO other colors",
  },
];

function selectPalette(weekday: number, dateStr: string): Palette {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const jan1    = new Date(y, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  // rotate by week so each week feels different; always red on Mon/first day of cycle
  const idx = (weekday + weekNum) % PALETTE_LIBRARY.length;
  return PALETTE_LIBRARY[idx];
}

// ─── Biblioteca de estilos visuais — rotaciona semanalmente ──────────────────

interface VisualStyle {
  id:            string;
  name:          string;
  bgDesc:        string;
  allowPeople:   boolean;
  headlineColor: "white" | "dark";
}

const VISUAL_STYLE_LIBRARY: VisualStyle[] = [
  {
    id:            "A",
    name:          "Tech Escuro",
    bgDesc:        "deep solid black background #0D0D0D with dramatic red radial light-leak #B70C00 from bottom-left corner (~55% opacity), isometric 3D Cinema 4D/Blender render style, dramatic red rim light from bottom-left, deep black shadows #050505 — NO circuit board patterns, NO PCB dots, NO electronic circuit lines, NO microchip grid",
    allowPeople:   false,
    headlineColor: "white",
  },
  {
    id:            "B",
    name:          "Minimalista Claro",
    bgDesc:        "clean white #FFFFFF or very light gray #F4F4F4 background, large negative space, flat minimalist design, only red #B70C00 and dark #1A1A1A as accents — NO dark backgrounds, NO heavy gradients, NO circuit lines",
    allowPeople:   false,
    headlineColor: "dark",
  },
  {
    id:            "C",
    name:          "Mapa Urbano",
    bgDesc:        "deep night-blue background #08122A with stylized city street map overlay (thin white and light-blue lines at 25–35% opacity), red location pin markers, dashed delivery route lines across the map, subtle city skyline silhouette at bottom horizon",
    allowPeople:   false,
    headlineColor: "white",
  },
  {
    id:            "D",
    name:          "Restaurante Quente",
    bgDesc:        "warm dark background #1A0A00 with amber light #D4630A radiating from above-center like professional kitchen overhead lighting, subtle low-opacity wood grain or brick texture in background",
    allowPeople:   false,
    headlineColor: "white",
  },
  {
    id:            "E",
    name:          "Ilustração com Personagem",
    bgDesc:        "rich dark background (deep navy or graphite #161820) with vibrant flat-vector or isometric 3D illustrated composition, colorful but cohesive palette — this style REQUIRES a central human character",
    allowPeople:   true,
    headlineColor: "white",
  },
];

function selectVisualStyle(weekday: number, dateStr: string): VisualStyle {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const jan1    = new Date(y, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  // Offset differently from palette to avoid always pairing same style+palette
  const idx = (weekday + weekNum * 2 + 1) % VISUAL_STYLE_LIBRARY.length;
  return VISUAL_STYLE_LIBRARY[idx];
}

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
// OpenRouter só expõe /chat/completions — /images/generations retorna 404.
// O size é passado no body (alguns providers repassam ao Recraft).
// Portrait é reforçado via prompt de layout mesmo que size seja ignorado.

async function generateImage(prompt: string, format: "group" | "portrait"): Promise<string> {
  // Recraft sizes: 1820x1024 = landscape 16:9 | 1024x1820 = portrait 9:16
  const size = format === "group" ? "1820x1024" : "1024x1820";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY não configurado no Trigger.dev");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info("bom-dia: recraft request", { format, size, attempt, promptLen: prompt.length });
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

      // Fallback: formato images/generations caso OpenRouter adicione suporte
      type ImgItem = { url?: string; b64_json?: string };
      const imgData = (data.data as Array<ImgItem> | undefined)?.[0];
      if (imgData?.url) return imgData.url;
      if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

      throw new Error(`OpenRouter não retornou imagem. Preview: ${rawText.slice(0, 400)}`);
    } catch (err) {
      logger.warn(`bom-dia: tentativa ${attempt}/3 geração falhou`, {
        format, size, error: (err as Error).message,
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
  const autoTheme      = getCalendar(calendarId, dateStr).themes[weekday] ?? "motivação";
  const theme          = input.custom_theme?.trim() || autoTheme;
  const selectedPhrase = input.custom_theme ? null : selectPhrase(weekday, dateStr);
  const dailyTone      = DAILY_TONE[weekday] ?? DAILY_TONE[1];
  const palette        = selectPalette(weekday, dateStr);
  const visualStyle    = selectVisualStyle(weekday, dateStr);

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

  const customBriefInstruction = input.custom_brief?.trim()
    ? `PRIORITY SCENE (override style defaults): ${input.custom_brief.trim()} — if this describes a person, depict as flat-vector or isometric 3D illustration, never photorealistic.`
    : "";

  const peopleRule = visualStyle.allowPeople
    ? `- Central character (REQUIRED): one illustrated character — flat-vector or isometric 3D ONLY (no photorealistic faces). Options: delivery rider on motorcycle with bag, smiling restaurant owner holding tablet, chef in white coat, or customer receiving order box.`
    : `- NO people, NO hands, NO faces, NO mascots`;

  const headlineColorRule = visualStyle.headlineColor === "dark"
    ? `bold dark #1A1A1A or red #B70C00 condensed headline text`
    : `bold white #FFFFFF condensed headline text`;

  const claudeResp = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1400,
    system: `Você é o Superagente de Imagens de Bom Dia da Consult Delivery — consultoria de delivery do Wandson Silva. Gere diariamente: prompt de imagem (DALL-E/Recraft) + headline + legenda para WhatsApp.

═══ ESTILOS VISUAIS ═══
O estilo do dia é indicado no input. Siga RIGOROSAMENTE o estilo indicado — não misture estilos.

Estilo A — TECH ESCURO: fundo preto #0D0D0D com degradê radial vermelho do canto inferior esquerdo. Cena isométrica 3D estilo Cinema 4D/Blender. Elementos tech + delivery. Headline branca.

Estilo B — MINIMALISTA CLARO: fundo branco #FFFFFF ou cinza claro #F4F4F4, composição limpa com muito espaço negativo. Elementos flat simples. Headline preta #1A1A1A ou vermelha #B70C00. SEM fundo escuro, SEM gradientes pesados.

Estilo C — MAPA URBANO: fundo azul noturno #08122A com mapa de ruas estilizado (linhas finas 25–35% opac), pins vermelhos, rotas tracejadas. Elementos de delivery sobrepostos ao mapa. Headline branca.

Estilo D — RESTAURANTE QUENTE: fundo escuro quente #1A0A00 com luz âmbar #D4630A vinda de cima (cozinha profissional). Elementos de restaurante e food service. Headline branca.

Estilo E — ILUSTRAÇÃO COM PERSONAGEM: fundo escuro rico (marinho ou grafite) com ilustração flat-vector ou isométrica 3D vibrante. OBRIGATÓRIO incluir personagem central ilustrado (motoboy, chef, dono de loja). Headline branca.

═══ BIBLIOTECA DE ELEMENTOS — VARIE, CATEGORIAS COM PRIORIDADE ═══

PRIORIDADE 1 — Delivery & Logística (default da maioria dos dias):
motoboy isométrico 3D em moto/scooter com bag térmica, bag de delivery com logo foguete, caixa de papelão delivery em movimento, rota de entrega com pins vermelhos no mapa, cidade isométrica vista de cima, moto estilizada 3/4, entregador na porta do cliente, scooter elétrica de delivery, rua urbana com sinalização estilizada, mapa de bairro com múltiplas rotas tracejadas

PRIORIDADE 2 — Restaurante & Food Service:
embalagem para viagem estilizada, caixa de hambúrguer flat-vector, saco de papel kraft delivery, caixa de pizza isométrica, bandeja de pedido, chapéu de chef 3D, balcão de atendimento isométrico, cozinha profissional vista isométrica, copo descartável de café, fogão industrial clean, panela com vapor design flat, visor/fachada de restaurante estilizado, sacola de delivery com logo, prato isométrico estilizado

PRIORIDADE 3 — Financeiro & Crescimento:
gráficos de barra crescentes 3D, setas de crescimento com motion trail, moedas empilhadas flat, recibo/ticket digital, cifrão R$ estilizado, funil de conversão

PRIORIDADE 4 — Tecnologia (USAR COM MODERAÇÃO — no máximo 1 item tech por imagem; nunca como elemento principal):
tablet com dashboard de pedidos, celular com app delivery, laptop com métricas

NUNCA combine mais de 1 item de tecnologia por imagem. Prefira sempre elementos físicos de delivery e cidade.

═══ TIPOGRAFIA ═══
Headline: font condensada bold sem serifa (Oswald/Inter ExtraBold), Title Case. Estilo B: preta/vermelha. Demais: branca.
SEM emoji no design. SEM itálico. SEM glow excessivo. SEM contorno duplo.

═══ LOGO CONSULT DELIVERY (OBRIGATÓRIO em TODOS os estilos) ═══
Canto inferior direito: foguete vermelho #B70C00 + chamas brancas + texto "Consult Delivery" condensado bold branco (~10% da largura total). Sem caixa ao redor (Estilo B: pode ter fundo vermelho pequeno para contraste).

═══ LEGENDA WHATSAPP (PT-BR — máx 4 linhas, tom de bom dia ao cliente) ═══
Linha 1: "Bom dia!" + [1 emoji] + frase curta e calorosa desejando bom dia relacionada ao tema (máx 10 palavras)
Linha 2: frase mostrando que a Consult Delivery está à disposição para apoiar a operação do cliente (máx 12 palavras) — NÃO mencione dia da semana
[linha em branco]
Linha 3: horário de atendimento resumido (ex: "🕘 Seg–Sex 09h–18h | Sáb 08h–12h")
SEM links, SEM @, SEM hashtag, SEM CTA de compra

Retorne SOMENTE JSON válido, sem texto extra.${memoryBlock}${instructionsBlock}${feedbackContext}`,
    messages: [{
      role:    "user",
      content: `Dia: ${dayName}
Tema: ${theme}
Data: ${dateStr}
Estilo visual do dia: Estilo ${visualStyle.id} — ${visualStyle.name}
Horário: ${hoursLine}${briefLine}${selectedPhrase ? `\nFrase do dia (headline base — use ou adapte): "${selectedPhrase.main}"${selectedPhrase.sub ? `\nSubtítulo sugerido: "${selectedPhrase.sub}"` : ""}` : ""}
Tom do dia: ${dailyTone.mood}
Elementos sugeridos para o dia: ${dailyTone.elements}
Iluminação do dia: ${dailyTone.lighting}

Gere JSON com exatamente 4 campos:

1. "dalle_prompt" (em INGLÊS — para gerador Recraft V4.1):
   Siga RIGOROSAMENTE o Estilo ${visualStyle.id}. Estrutura obrigatória:
   - Background: ${visualStyle.bgDesc}
   - Lighting: ${dailyTone.lighting} adapted to Style ${visualStyle.id}
   ${customBriefInstruction ? `- ${customBriefInstruction}` : `- Scene elements (PRIORITY ORDER — choose 3–5 items): first pick from Delivery & Logistics (motoboy, moto, city, delivery bag, route map), then Restaurant/Food if theme calls for it, then Financial/Growth; MAXIMUM 1 tech device (tablet/phone/laptop) per image — only if no physical delivery element fits`}
   ${peopleRule}
   - Logo (MANDATORY): bottom-right corner — red rocket #B70C00 with white flame trails beside bold white text "Consult Delivery" in condensed sans-serif, ~10% canvas width, no box/background
   - Headline text on image: ${headlineColorRule} (Title Case, max 7 words, no glow, no italic): related to "${theme}"
   - ${palette.colors}
   - NO circuit boards, NO PCB patterns, NO electronic circuit dots or lines, NO microchip grid — NO real food photography (actual pizza/burger/sushi dishes), NO balloons, NO flags, NO confetti, NO neon signs, NO anime/manga, NO watercolor
   - DO NOT mention pixel dimensions or aspect ratio in this prompt

2. "text_on_image" (PT-BR, máx 7 palavras, Title Case): ${selectedPhrase ? `use ou adapte: "${selectedPhrase.main}"` : `headline curta e impactante para o tema: "${theme}"`}

3. "caption" (PT-BR — máx 4 linhas, tom de bom dia ao cliente):
   Linha 1: "Bom dia!" + [1 emoji] + frase calorosa sobre "${theme}" desejando bom dia (máx 10 palavras)
   Linha 2: frase mostrando que a Consult Delivery está à disposição para apoiar a operação do cliente hoje (máx 12 palavras)
   [linha em branco]
   Linha 3: horário de atendimento — ex: "🕘 Seg–Sex 09h–18h | Sáb 08h–12h"
   — sem links, @, hashtag, CTA de compra, sem mencionar dia da semana

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

  // Format-specific layout cues — critical for Recraft to compose correctly per orientation
  const feedLayoutCue    = `HORIZONTAL LANDSCAPE 16:9 composition: main visual elements fill center and right side, wide panoramic layout, headline text zone on the left third.`;
  const portraitLayoutCue = `VERTICAL PORTRAIT 9:16 composition: TALL narrow vertical format, headline text fills the TOP THIRD of the canvas, main visual scene fills the CENTER and BOTTOM two-thirds, narrow column layout optimized for mobile Story viewing.`;

  const feedPrompt     = `${claudeOut.dalle_prompt}. ${feedLayoutCue} ${textSuffix}`;
  const portraitPrompt = `${claudeOut.dalle_prompt}. ${portraitLayoutCue} ${textSuffix}`;

  let imgGroupUrl: string | undefined;
  let imgPortraitUrl: string | undefined;

  if (formats === "feed" || formats === "both") {
    logger.info("bom-dia: gerando Feed 16:9 via Recraft V4.1");
    const groupTempUrl = await generateImage(feedPrompt, "group");
    logger.info("bom-dia: upload Feed para Supabase Storage");
    imgGroupUrl = await uploadToStorage(groupTempUrl, groupStoragePath, "group");
  }

  if (formats === "story" || formats === "both") {
    if (formats === "both") {
      // Portrait is optional when feed already succeeded — don't fail the whole run
      try {
        logger.info("bom-dia: gerando Story 9:16 via Recraft V4.1");
        const portraitTempUrl = await generateImage(portraitPrompt, "portrait");
        logger.info("bom-dia: upload Story para Supabase Storage");
        imgPortraitUrl = await uploadToStorage(portraitTempUrl, portraitStoragePath, "portrait");
      } catch (portraitErr) {
        logger.warn("bom-dia: story generation failed, continuing with feed only", { error: (portraitErr as Error).message });
      }
    } else {
      logger.info("bom-dia: gerando Story 9:16 via Recraft V4.1");
      const portraitTempUrl = await generateImage(portraitPrompt, "portrait");
      logger.info("bom-dia: upload Story para Supabase Storage");
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
