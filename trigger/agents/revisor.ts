/**
 * Revisor — gate de verificação em 2 camadas ANTES de responder ao cliente.
 *
 * Roda dentro de responder-conclusao.ts, depois de gerar a resposta e ANTES de
 * criar o draft / auto-enviar.
 *
 *   Camada 1 — GROUNDING: o texto da resposta é sustentado por execution_result?
 *              (1 chamada LLM, Kimi via Ollama, padrão bom-dia/breno → llm-client.chat)
 *   Camada 2 — EFEITO REAL: a ação realmente aconteceu no sistema-alvo?
 *              (reconsulta o Bridge read-only e confirma)
 *
 * Fail-closed: qualquer dúvida (LLM ilegível, Bridge fora, token ausente) →
 * NÃO aprova → a tarefa vai para humano. Bloquear resposta legítima manda para
 * revisão humana (seguro); deixar passar alucinação é o que não pode acontecer.
 */

import { chat, type ChatMessage } from "./llm-client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GroundingVerdict {
  grounded: boolean;
  motivo: string;
}

export interface EfeitoRealVerdict {
  confirmed: boolean;
  motivo: string;
}

export interface RevisorVerdict {
  aprovado: boolean;
  grounding: GroundingVerdict;
  efeito_real: EfeitoRealVerdict;
}

/** Injetável para teste — assinatura compatível com llm-client.chat. */
export type ChatFn = (messages: ChatMessage[], forceJson?: boolean) => Promise<{ content: string }>;

// ─── Camada 1: Grounding ────────────────────────────────────────────────────────

const GROUNDING_SYSTEM = `Você é um revisor de qualidade rigoroso de um sistema de atendimento.
Recebe (1) o RESULTADO bruto da execução de uma tarefa em um sistema e (2) a RESPOSTA que será enviada ao cliente.
Sua função: verificar se TODA afirmação factual da resposta é sustentada pelo resultado.
Se a resposta afirma algo que o resultado NÃO comprova (um número, status, valor, ou confirmação de ação), é alucinação.
Se o resultado indica erro/falha mas a resposta sugere que deu certo, é alucinação.
Responda APENAS JSON, sem markdown: {"grounded": true|false, "motivo": "explicação curta"}.
grounded=true somente se a resposta for fiel e conservadora em relação ao resultado.`;

/**
 * Parseia o veredito do LLM. Fail-closed: qualquer coisa ilegível ou ambígua
 * vira grounded:false — preferimos mandar para humano a deixar passar alucinação.
 */
export function parseGroundingVerdict(raw: string): GroundingVerdict {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { grounded: false, motivo: "veredito sem JSON (fail-closed)" };
  try {
    const parsed = JSON.parse(match[0]) as { grounded?: unknown; motivo?: unknown };
    if (typeof parsed.grounded !== "boolean") {
      return { grounded: false, motivo: "campo 'grounded' ausente ou não-booleano (fail-closed)" };
    }
    return {
      grounded: parsed.grounded,
      motivo: typeof parsed.motivo === "string" ? parsed.motivo : "",
    };
  } catch {
    return { grounded: false, motivo: "JSON inválido (fail-closed)" };
  }
}

export async function avaliarGrounding(
  resposta: string,
  executionResult: unknown,
  chatFn: ChatFn = chat,
): Promise<GroundingVerdict> {
  const resultadoTexto = executionResult
    ? JSON.stringify(executionResult, null, 2).slice(0, 2000)
    : "Sem resultado de execução.";

  try {
    const resp = await chatFn([
      { role: "system", content: GROUNDING_SYSTEM },
      { role: "user", content: `RESULTADO:\n${resultadoTexto}\n\nRESPOSTA AO CLIENTE:\n${resposta}` },
    ], true);
    return parseGroundingVerdict(resp.content);
  } catch (err) {
    return { grounded: false, motivo: `erro no revisor LLM: ${(err as Error).message} (fail-closed)` };
  }
}

// ─── Camada 2: Efeito real ──────────────────────────────────────────────────────

export interface EfeitoRealOpts {
  bridgeUrl: string;
  bridgeToken?: string;
  /** Injetável para teste — assinatura compatível com fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Reconsulta o sistema-alvo via Bridge (read-only) para confirmar que o efeito
 * da execução é real. Fail-closed: Bridge fora / token ausente / status !ok → não confirma.
 */
export async function verificarEfeitoReal(
  targetSystem: string,
  executionResult: Record<string, unknown> | null,
  opts: EfeitoRealOpts,
): Promise<EfeitoRealVerdict> {
  // A execução já reportou falha → não há efeito real a confirmar.
  if (executionResult && executionResult.ok === false) {
    return { confirmed: false, motivo: "execução reportou ok:false" };
  }

  // 'nenhum' = resposta baseada em contexto/memória, sem ação externa a reconfirmar.
  if (targetSystem === "nenhum" || !targetSystem) {
    return { confirmed: true, motivo: "sem ação externa (grounding já gateia)" };
  }

  if (targetSystem === "vendaerp") {
    if (!opts.bridgeToken) {
      return { confirmed: false, motivo: "INTERNAL_BRIDGE_TOKEN ausente (fail-closed)" };
    }
    const doFetch = opts.fetchFn ?? fetch;
    try {
      const res = await doFetch(`${opts.bridgeUrl}/api/vendaerp/status`, {
        headers: { "x-internal-token": opts.bridgeToken },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return { confirmed: false, motivo: `Bridge VendaERP HTTP ${res.status} (fail-closed)` };
      }
      const data = (await res.json()) as { ok?: boolean };
      return data.ok
        ? { confirmed: true, motivo: "VendaERP reconsultado, status ok" }
        : { confirmed: false, motivo: "VendaERP reconsultado mas status !ok" };
    } catch (err) {
      return { confirmed: false, motivo: `reconsulta Bridge falhou: ${(err as Error).message} (fail-closed)` };
    }
  }

  // Sistemas ainda sem reconsulta dedicada (ex.: asaas placeholder). Fail-closed:
  // se chegou aqui com ok!=false mas sem verificador, não confirmamos efeito real.
  return { confirmed: false, motivo: `sem verificador de efeito real para '${targetSystem}' (fail-closed)` };
}

// ─── Gate combinado ──────────────────────────────────────────────────────────────

export async function revisar(params: {
  resposta: string;
  executionResult: Record<string, unknown> | null;
  targetSystem: string;
  bridgeUrl: string;
  bridgeToken?: string;
  chatFn?: ChatFn;
  fetchFn?: typeof fetch;
}): Promise<RevisorVerdict> {
  const grounding = await avaliarGrounding(params.resposta, params.executionResult, params.chatFn);
  const efeito_real = await verificarEfeitoReal(params.targetSystem, params.executionResult, {
    bridgeUrl: params.bridgeUrl,
    bridgeToken: params.bridgeToken,
    fetchFn: params.fetchFn,
  });
  return { aprovado: grounding.grounded && efeito_real.confirmed, grounding, efeito_real };
}
