import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Helper único de leitura de radar_metricas (EAV) — Fase 1 do épico
// "Dashboard iFood". Centraliza o dedup que estava copiado em 4 lugares
// (RadarReal.jsx, agente-analise.ts, analise-loja/processar.ts,
// diagnostico-semanal.ts) ANTES de qualquer mudança na gravação.
//
// Sem `periodo` → comportamento idêntico ao legado: "mais recente por
// métrica por created_at", dedup-first sobre as últimas `limit` linhas.
// Com `periodo` (ativado na Fase 4) → filtra data_ref no servidor ANTES
// do limit e desempata por data_ref desc (snapshot do período pedido).
// ============================================================

const SELECT_PADRAO = "metrica, valor, valor_texto, created_at, loja_id";

export type Periodo = { inicio?: string | null; fim?: string | null };

export type LerMetricasOpts = {
  tenantId: string;
  // Filtro de loja:
  //   string    → métricas dessa loja (.eq no servidor)
  //   null      → SOMENTE métricas sem loja vinculada (loja_id IS NULL)
  //   undefined → sem filtro de loja (tenant inteiro)
  lojaId?: string | null;
  // Legado: quando lojaId é uma loja específica, também inclui as linhas
  // tenant-wide (loja_id IS NULL), filtrando no cliente DEPOIS do limit —
  // preserva byte-a-byte o fallback `!m.loja_id` de agente-analise/analise-loja
  // (limit aplicado ANTES do filtro de loja).
  incluirSemLoja?: boolean;
  // Janela temporal por data_ref (Fase 4). Filtra no servidor antes do limit.
  periodo?: Periodo;
  // Colunas do select (default cobre agente-analise/analise-loja).
  select?: string;
  // Teto de linhas lidas antes do dedup.
  limit?: number;
};

// Retorna um mapa { metrica → linha mais recente }, idêntico ao que cada
// call-site montava inline.
export async function lerMetricas(
  sb: SupabaseClient,
  opts: LerMetricasOpts,
): Promise<Record<string, any>> {
  const {
    tenantId,
    lojaId,
    incluirSemLoja = false,
    periodo,
    select = SELECT_PADRAO,
    limit = 400,
  } = opts;

  let q = sb.from("radar_metricas").select(select).eq("tenant_id", tenantId);

  // Filtro de loja no servidor — exceto no modo legado de fallback, que
  // mantém o filtro no cliente para preservar o conjunto exato de `limit`
  // linhas lido hoje (limit aplicado ANTES do filtro de loja).
  if (!incluirSemLoja) {
    if (lojaId === null) q = q.is("loja_id", null);
    else if (lojaId !== undefined) q = q.eq("loja_id", lojaId);
  }

  // Janela temporal (Fase 4) — filtra data_ref no servidor antes do limit.
  const temPeriodo = !!(periodo && (periodo.inicio || periodo.fim));
  if (periodo?.inicio) q = q.gte("data_ref", periodo.inicio);
  if (periodo?.fim) q = q.lte("data_ref", periodo.fim);

  // Sem período: dedup pelo mais recente por created_at (legado).
  // Com período: mais recente por data_ref na janela (desempate created_at).
  const ordenado = temPeriodo
    ? q
        .order("data_ref", { ascending: false })
        .order("created_at", { ascending: false })
    : q.order("created_at", { ascending: false });

  const { data, error } = await ordenado.limit(limit);
  if (error) throw error;

  let rows = (data ?? []) as any[];
  if (incluirSemLoja && lojaId) {
    rows = rows.filter((m) => !m.loja_id || m.loja_id === lojaId);
  }

  const mapa: Record<string, any> = {};
  for (const r of rows) {
    if (!mapa[r.metrica]) mapa[r.metrica] = r;
  }
  return mapa;
}
