import { z } from "zod";

// ─── Intenção iFood (ONDA 2) ────────────────────────────────────────────────
//
// O LLM do BRENO emite só a INTENÇÃO em nomes humanos (item_nome), nunca um
// itemId nem chamada de API. A resolução item_nome → itemId (UUID) e a criação
// do draft amarelo acontecem no Bridge (POST /api/ifood/acao), que é o único
// componente que fala com o iFood. Aqui só validamos a intenção e disparamos.
//
// Schema fechado (sem z.record/passthrough): parâmetro vira escrita real no
// iFood, então o trust boundary exige shape explícito (PLANO §5.5).

export const IFOOD_OPERACOES = ["ifood.pausar_item", "ifood.reabrir_item"] as const;
export type IfoodOperacao = (typeof IFOOD_OPERACOES)[number];

/** Intenção iFood emitida pelo LLM, dentro de `tarefa` quando sistema_alvo='ifood'. */
export const IfoodIntentSchema = z.object({
  operacao: z.enum(IFOOD_OPERACOES),
  parametros: z.object({
    item_nome: z.string().min(1),
  }),
});
export type IfoodIntent = z.infer<typeof IfoodIntentSchema>;

export interface CriarDraftIfoodParams {
  tenantId: string;
  intent: IfoodIntent;
}

export interface CriarDraftIfoodResult {
  ok: boolean;
  draftId?: string;
  itemId?: string;
  content?: string;
  /** preenchido quando o item é ambíguo/não-encontrado (422) — humano desambigua */
  motivo?: string;
  candidatos?: { itemId: string; nome: string }[];
  error?: string;
}

/**
 * Dispara a criação do draft amarelo no Bridge para uma intenção iFood.
 *
 * Mesmo mecanismo do executor vendaerp (trigger/agents/executar-tarefa.ts):
 * chamada direta ao Bridge com x-internal-token. O Bridge resolve o item ao
 * vivo, e em caso de sucesso INSERE agent_drafts(autonomy_level='amarelo').
 * NÃO executa a escrita no iFood — isso é o /aprovar (fluxo já existente).
 *
 * Não lança: devolve { ok:false, ... } para o chamador decidir (o BRENO segue
 * o atendimento normal mesmo se o Bridge falhar).
 */
export async function criarDraftIfood(
  params: CriarDraftIfoodParams
): Promise<CriarDraftIfoodResult> {
  const intent = IfoodIntentSchema.parse(params.intent);

  const bridgeUrl = process.env.BRIDGE_URL ?? "http://187.127.25.24:3001";
  const bridgeToken = process.env.INTERNAL_BRIDGE_TOKEN;
  if (!bridgeToken) {
    return { ok: false, error: "INTERNAL_BRIDGE_TOKEN não configurado" };
  }

  try {
    // tenant_id vai na query (caminho interno confiável — routes/ifood.js L67-68).
    const url = `${bridgeUrl}/api/ifood/acao?tenant_id=${encodeURIComponent(params.tenantId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": bridgeToken,
      },
      body: JSON.stringify({
        operacao: intent.operacao,
        parametros: { item_nome: intent.parametros.item_nome },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Sucesso vem aninhado pelo wrapper handle() do Bridge: { ok:true, data:{ draft_id, ... } }.
    // Erros 422/400 são enviados com res.status().json() direto (no topo do raw, sem wrapper).
    const data = (raw.data ?? raw) as Record<string, unknown>;

    if (res.ok && data.draft_id) {
      return {
        ok: true,
        draftId: String(data.draft_id),
        itemId: data.item_id ? String(data.item_id) : undefined,
        content: data.content ? String(data.content) : undefined,
      };
    }

    // 422 = item ambíguo/não-encontrado → candidatos para o humano desambiguar (no topo do raw)
    return {
      ok: false,
      motivo: raw.motivo ? String(raw.motivo) : undefined,
      candidatos: Array.isArray(raw.candidatos)
        ? (raw.candidatos as { itemId: string; nome: string }[])
        : undefined,
      error: raw.error ? String(raw.error) : `Bridge retornou ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
