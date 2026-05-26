-- Views versionadas — recon TD#53
-- v_chart_7d e v_dashboard_kpis existiam em produção sem SQL no repo

CREATE OR REPLACE VIEW v_chart_7d AS
 SELECT tenant_id,
    day,
    pedidos_count
   FROM daily_kpis
  WHERE day >= (CURRENT_DATE - '6 days'::interval);

CREATE OR REPLACE VIEW v_dashboard_kpis AS
 SELECT tenant_id,
    day,
    pedidos_count,
    pedidos_delta_pct,
    ticket_medio_cents,
    ticket_delta_pct,
    tarefas_count,
    tarefas_urgentes,
    inadimplencia_cents,
    inadimplencia_clientes
   FROM daily_kpis k
  WHERE day = (( SELECT max(k2.day) AS max
           FROM daily_kpis k2
          WHERE k2.tenant_id = k.tenant_id));
