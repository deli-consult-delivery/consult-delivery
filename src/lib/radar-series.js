// ============================================================
// Helper de leitura da SÉRIE DIÁRIA de verdade (radar_series) — Fase 5 do
// épico "Dashboard iFood". radar_series tem grão fino: 1 linha/métrica/dia,
// só onde a fonte do iFood entrega dado por dia (Operação). Vendas/Cardápio/
// Conciliação NÃO têm série (iFood entrega agregado — fabricar diário seria
// inventar dado, anti-padrão P1). Os nomes de métrica ESPELHAM os agregados
// de radar_metricas → a soma da série bate com o KPI agregado.
//
// `agregar` faz o date_trunc no cliente (dia | semana | mes), permitindo o
// filtro "diário, semanal, mensal" pedido sem ida ao servidor.
// ============================================================

const SELECT_PADRAO = 'metrica, dia, valor, created_at';

// Lê linhas de radar_series filtrando por tenant/loja/métrica e janela (dia).
// metrica: string (uma) | array (várias, via .in) | undefined (todas).
// periodo: { inicio?, fim? } em 'YYYY-MM-DD' (mesma semântica do lerMetricas).
export async function lerSeries(sb, {
  tenantId,
  lojaId,            // string → essa loja; null → loja_id IS NULL; undefined → tenant inteiro
  metrica,
  periodo,
  select = SELECT_PADRAO,
  limit = 4000,
} = {}) {
  let q = sb.from('radar_series').select(select).eq('tenant_id', tenantId);

  if (lojaId === null) q = q.is('loja_id', null);
  else if (lojaId !== undefined) q = q.eq('loja_id', lojaId);

  if (Array.isArray(metrica)) q = q.in('metrica', metrica);
  else if (metrica) q = q.eq('metrica', metrica);

  if (periodo?.inicio) q = q.gte('dia', periodo.inicio);
  if (periodo?.fim) q = q.lte('dia', periodo.fim);

  const { data, error } = await q.order('dia', { ascending: true }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Segunda-feira (ISO) da semana de um dia 'YYYY-MM-DD'. UTC evita drift de fuso.
function inicioSemana(diaISO) {
  const [y, mo, d] = String(diaISO).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = dt.getUTCDay();            // 0=domingo … 6=sábado
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7)); // recua até a segunda
  return dt.toISOString().slice(0, 10);
}

// Agrega a série de UMA métrica por granularidade. Antes do bucket, deduplica
// por dia: se dois relatórios cobrirem o mesmo dia (re-upload sobreposto), o
// mais recente (created_at) vence — mesma semântica de snapshot do radar_metricas,
// evita somar o mesmo dia duas vezes. Soma os dias dentro de cada bucket.
// Retorna [{ chave, valor }] ordenado cronologicamente.
//   'dia'    → chave = 'YYYY-MM-DD' (cada dia é um bucket)
//   'semana' → chave = segunda-feira 'YYYY-MM-DD'
//   'mes'    → chave = 'YYYY-MM'
export function agregar(rows, granularidade = 'dia') {
  // dedup por dia (mais recente vence)
  const porDia = new Map(); // dia -> row
  for (const r of rows ?? []) {
    const prev = porDia.get(r.dia);
    if (!prev || String(r.created_at) > String(prev.created_at)) porDia.set(r.dia, r);
  }

  const bucket = (dia) => {
    if (granularidade === 'mes') return String(dia).slice(0, 7);
    if (granularidade === 'semana') return inicioSemana(dia);
    return String(dia).slice(0, 10);
  };

  const mapa = new Map(); // chave -> { chave, valor }
  for (const r of porDia.values()) {
    const k = bucket(r.dia);
    const cur = mapa.get(k) || { chave: k, valor: 0 };
    cur.valor += Number(r.valor) || 0;
    mapa.set(k, cur);
  }
  return [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}
