// ============================================================
// Helper único de leitura de radar_metricas (EAV) — Fase 1 do épico
// "Dashboard iFood". Espelha trigger/_shared/radar-metricas.ts para o
// frontend (Console v2). Centraliza o dedup antes copiado em 4 lugares.
//
// Sem `periodo` → comportamento legado (mais recente por created_at).
// Com `periodo` (ativado na Fase 4) → filtra data_ref no servidor ANTES
// do limit e desempata por data_ref desc (snapshot do período pedido).
// ============================================================

const SELECT_PADRAO = 'metrica, valor, valor_texto, created_at, loja_id';

// Retorna um mapa { metrica → linha mais recente }.
export async function lerMetricas(sb, {
  tenantId,
  // string → essa loja; null → loja_id IS NULL; undefined → tenant inteiro.
  lojaId,
  // Legado: inclui linhas tenant-wide (loja_id null) junto da loja, filtradas
  // no cliente DEPOIS do limit (preserva o fallback `!m.loja_id`).
  incluirSemLoja = false,
  // Janela temporal por data_ref (Fase 4).
  periodo,
  select = SELECT_PADRAO,
  limit = 400,
} = {}) {
  // O filtro client-side de loja (modo legado `incluirSemLoja`) lê m.loja_id;
  // sem a coluna no select, m.loja_id é undefined em toda linha e `!m.loja_id`
  // deixaria tudo passar — vazamento silencioso entre lojas (anti-padrão P1).
  // Garante a coluna quando esse filtro for rodar. No-op nos call-sites atuais.
  const selectEfetivo =
    incluirSemLoja && lojaId && !/\bloja_id\b/.test(select)
      ? `${select}, loja_id`
      : select;

  let q = sb.from('radar_metricas').select(selectEfetivo).eq('tenant_id', tenantId);

  if (!incluirSemLoja) {
    if (lojaId === null) q = q.is('loja_id', null);
    else if (lojaId !== undefined) q = q.eq('loja_id', lojaId);
  }

  const temPeriodo = !!(periodo && (periodo.inicio || periodo.fim));
  if (periodo?.inicio) q = q.gte('data_ref', periodo.inicio);
  if (periodo?.fim) q = q.lte('data_ref', periodo.fim);

  const ordenado = temPeriodo
    ? q.order('data_ref', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false });

  const { data, error } = await ordenado.limit(limit);
  if (error) throw error;

  let rows = data ?? [];
  if (incluirSemLoja && lojaId) rows = rows.filter((m) => !m.loja_id || m.loja_id === lojaId);

  const mapa = {};
  for (const r of rows) if (!mapa[r.metrica]) mapa[r.metrica] = r;
  return mapa;
}
