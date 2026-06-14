-- =============================================================
-- RADAR — fundação temporal de radar_metricas (aditivo, idempotente, reversível)
-- Fase 0 do épico "Dashboard iFood — extração máxima".
--
-- Problema: radar_metricas é EAV sem grão temporal. O dedup atual ("última
-- ocorrência por métrica por created_at") ignora o período do relatório — com
-- histórico (vários meses subidos) passa a mostrar o ÚLTIMO UPLOAD, não o
-- período pedido, e o limit(400) das leituras pode truncar.
--
-- Solução: 2 colunas de grão (data_ref + granularidade) + índice de dedup
-- temporal. O parser (trigger/radar/processar-fontes.ts) passa a preencher
-- ambos no insert; o dedup migra para (metrica, data_ref desc).
--
-- NÃO torna as colunas NOT NULL: print sem período cai em 'periodo'/created_at.
-- Tudo IF NOT EXISTS / WHERE-guarded → no-op em re-run, reprodutível em ambiente novo.
-- =============================================================

-- ---------- colunas de grão temporal ----------
alter table public.radar_metricas
  add column if not exists granularidade text
    check (granularidade in ('dia','semana','mes','periodo'));

alter table public.radar_metricas
  add column if not exists data_ref date;

-- ---------- índice de dedup temporal ----------
-- Suporta o novo "mais recente por (tenant, loja, métrica) dentro do período"
-- filtrando data_ref no servidor ANTES do limit. Mantém o índice antigo
-- (radar_metricas_tenant_metrica_idx) intacto — este é aditivo.
create index if not exists radar_metricas_dedup_idx
  on public.radar_metricas (tenant_id, loja_id, metrica, data_ref desc, created_at desc);

-- ---------- backfill idempotente ----------
-- Linhas existentes: data_ref = fim do período (ou data de criação se sem período);
-- granularidade = 'periodo' (default seguro p/ dados agregados já gravados).
-- WHERE data_ref is null → roda só uma vez; re-run é no-op.
update public.radar_metricas
   set data_ref      = coalesce(periodo_fim, created_at::date),
       granularidade = coalesce(granularidade, 'periodo')
 where data_ref is null;
