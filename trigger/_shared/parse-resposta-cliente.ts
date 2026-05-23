// Parser puro de respostas de cliente via WhatsApp para aprovação de tarefas.
// Sem dependências externas — função pura e testável de forma isolada.

export interface ParsedResposta {
  aprovacoes: number[];
  bloco_aprovacoes: string[];
  aprovar_tudo: boolean;
  rejeicoes: number[];
  duvidas: { tarefa: number; pergunta: string }[];
  ambiguo: boolean;
  conteudo_original: string;
}

// Remove diacríticos e normaliza slug: lowercase, sem acentos, espaço → underscore
function toSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// Extrai lista de números de uma string como "1, 3, 5" ou "1,3,5"
function parseNumList(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .map((t) => parseInt(t, 10))
    .filter((n) => !isNaN(n) && n > 0);
}

export function parseRespostaCliente(texto: string): ParsedResposta {
  const base: ParsedResposta = {
    aprovacoes: [],
    bloco_aprovacoes: [],
    aprovar_tudo: false,
    rejeicoes: [],
    duvidas: [],
    ambiguo: false,
    conteudo_original: texto,
  };

  const t = texto.trim();
  if (!t) {
    return { ...base, ambiguo: true };
  }

  const norm = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  let matched = false;

  // ── OK tudo ────────────────────────────────────────────────────────────────
  if (/\bok\s+tudo\b/.test(norm)) {
    base.aprovar_tudo = true;
    matched = true;
  }

  // ── OK bloco <nome|número> ─────────────────────────────────────────────────
  const blocoRegex = /\bok\s+bloco\s+([^\s,;]+)/gi;
  for (const m of norm.matchAll(blocoRegex)) {
    base.bloco_aprovacoes.push(toSlug(m[1]));
    matched = true;
  }

  // ── OK <números> ou Aprovado <número> ──────────────────────────────────────
  // Só se não capturado como "OK tudo" ou "OK bloco"
  const okNumRegex = /\b(?:ok|aprovado)\s+([\d][\d\s,]*)/gi;
  for (const m of norm.matchAll(okNumRegex)) {
    // Garante que não é "ok tudo" ou "ok bloco"
    const rest = m[1].trim();
    if (/^tudo$/.test(rest)) continue;
    const nums = parseNumList(rest);
    if (nums.length > 0) {
      base.aprovacoes.push(...nums);
      matched = true;
    }
  }

  // ── OK <slug sem números> (bloco por nome) — ex: "OK cardapio" ────────────
  // Captura "ok <palavra_sem_números>" que não é "tudo" e não é número
  const okSlugRegex = /\bok\s+([a-zÀ-ɏ][a-zÀ-ɏ\s]*?)(?:\s*$|[,;])/gi;
  for (const m of texto.matchAll(okSlugRegex)) {
    const raw = m[1].trim();
    const normRaw = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (normRaw === "tudo" || normRaw.startsWith("bloco")) continue;
    if (/^\d[\d\s,]*$/.test(normRaw)) continue; // já capturado como número
    const slug = toSlug(raw);
    if (slug && !base.bloco_aprovacoes.includes(slug)) {
      base.bloco_aprovacoes.push(slug);
      matched = true;
    }
  }

  // ── NAO / Nao / Não / Rejeito <número> ────────────────────────────────────
  const naoRegex = /\b(?:nao|rejeito|rejeitado)\s+([\d][\d\s,]*)/gi;
  for (const m of norm.matchAll(naoRegex)) {
    const nums = parseNumList(m[1]);
    if (nums.length > 0) {
      base.rejeicoes.push(...nums);
      matched = true;
    }
  }

  // ── DUVIDA <número>: <pergunta> ────────────────────────────────────────────
  const duvidaExplicit = /\bduvida\s+(\d+)\s*[:—-]\s*(.+)/gi;
  for (const m of norm.matchAll(duvidaExplicit)) {
    const tarefa = parseInt(m[1], 10);
    const pergunta = m[2].trim();
    if (!isNaN(tarefa)) {
      base.duvidas.push({ tarefa, pergunta });
      matched = true;
    }
  }

  // ── "Tenho duvida na <número>" ─────────────────────────────────────────────
  const duvidaNa = /\bduvida\s+(?:na|no|em)?\s*(\d+)/gi;
  for (const m of norm.matchAll(duvidaNa)) {
    const tarefa = parseInt(m[1], 10);
    if (!isNaN(tarefa)) {
      // Evita duplicar com padrão anterior
      if (!base.duvidas.some((d) => d.tarefa === tarefa)) {
        base.duvidas.push({ tarefa, pergunta: "" });
        matched = true;
      }
    }
  }

  if (!matched) {
    base.ambiguo = true;
  }

  return base;
}
