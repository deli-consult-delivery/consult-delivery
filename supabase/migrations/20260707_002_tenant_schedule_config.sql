-- 20260707_002_tenant_schedule_config.sql
-- TD#44/#57 — scheduler por-tenant (Opção B, ver docs/decisions/scheduler-por-tenant.md).
-- Tabela GENÉRICA de horário configurável por tenant, para features que ainda
-- NÃO têm coluna dedicada (bom_dia_config.hora_semana/hora_sabado já existe e
-- continua sendo a fonte para o PoC de bom-dia — esta tabela é o próximo passo
-- para generalizar o padrão a encerramento, gestor-coleta, cora-regua etc. sem
-- criar 1 coluna hora_* nova por feature).
--
-- NÃO APLICAR sem decisão do Wandson (este PR é proposta + PoC, não cutover).
-- Aditiva, reversível, idempotente.
--
-- Rollback: DROP TABLE IF EXISTS public.tenant_schedule_config;

CREATE TABLE IF NOT EXISTS public.tenant_schedule_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature      text NOT NULL,                    -- 'bom_dia' | 'encerramento' | 'gestor_coleta' | ...
  hora         time NOT NULL DEFAULT '09:00:00', -- horário em BRT (mesma convenção fixa UTC-3 do resto do repo)
  dias_semana  int[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=domingo .. 6=sabado (ISO-like, 0-indexed no JS Date)
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature)
);

COMMENT ON TABLE public.tenant_schedule_config IS
  'TD#44/#57: horário configurável por tenant+feature, lido por um cron fino de fan-out (Opção B) em vez de 1 schedule fixo por tenant no Trigger.dev.';
COMMENT ON COLUMN public.tenant_schedule_config.feature IS
  'Slug da feature agendada (bom_dia, encerramento, gestor_coleta, cora_regua...). Sem enum hardcoded — validar no app.';
COMMENT ON COLUMN public.tenant_schedule_config.dias_semana IS
  'Dias em que a feature roda para este tenant (0=domingo..6=sabado). Default seg-sex.';

ALTER TABLE public.tenant_schedule_config ENABLE ROW LEVEL SECURITY;

-- TO authenticated (não PUBLIC/anon) — mesmo padrão do fix de auditoria RLS
-- em 20260706_013_canais_internos_remove_anon_access.sql: sem cláusula TO,
-- a policy cobriria PUBLIC (anon incluso). Console usa a anon key no bundle
-- público — nenhuma tabela nova deveria nascer alcançável por anon.
CREATE POLICY "tenant_admin_manage_schedule_config" ON public.tenant_schedule_config
  TO authenticated
  USING (public.is_admin_of(tenant_id));

GRANT ALL ON TABLE public.tenant_schedule_config TO authenticated;
GRANT ALL ON TABLE public.tenant_schedule_config TO service_role;
