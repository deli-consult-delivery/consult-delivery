-- MIGRATION: Seed deli_triggers para semáforo DELI Verde/Amarelo/Vermelho
-- S2-G05 | 2026-05-25

INSERT INTO deli_triggers (tenant_id, name, descricao, event_type, autonomy_level, enabled, condition_jsonb, proposed_action_jsonb)
VALUES
  (
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900',
    'cliente_sumiu_7d',
    'Cliente sem nenhuma atividade na timeline há 7+ dias',
    'schedule',
    'verde',
    true,
    '{"source_table": "client_timeline", "event_type": "schedule", "checks": [{"field": "dias_sem_contato", "op": "gte", "value": 7}]}',
    '{"type": "update_client_timeline", "title": "Cliente sumiu (7d)", "description": "Registra evento de inatividade na timeline e notifica equipe internamente"}'
  ),
  (
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900',
    'mensagem_recebida',
    'Nova mensagem inbound recebida de cliente nos últimos 5 min',
    'schedule',
    'verde',
    true,
    '{"source_table": "messages", "event_type": "schedule", "checks": [{"field": "direction", "op": "eq", "value": "inbound"}]}',
    '{"type": "update_client_timeline", "title": "Mensagem recebida", "description": "Atualiza timeline do cliente com registro de novo contato"}'
  ),
  (
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900',
    'metrica_caiu_20pct',
    'Queda de 20%+ em métrica crítica ou loja sem dados recentes de métricas',
    'schedule',
    'amarelo',
    true,
    '{"source_table": "loja_metricas_snapshot", "event_type": "schedule", "checks": [{"field": "variacao_pct", "op": "lte", "value": -20}]}',
    '{"type": "create_agent_draft", "title": "Alerta: métrica caiu 20%+ ou sem dados", "description": "Cria draft para consultor revisar e propor ação corretiva"}'
  ),
  (
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900',
    'config_critical_change',
    'Mudança crítica de configuração detectada no audit_log nos últimos 5 min',
    'schedule',
    'vermelho',
    true,
    '{"source_table": "audit_log", "event_type": "schedule", "checks": [{"field": "action", "op": "in", "value": ["UPDATE", "DELETE"]}, {"field": "resource", "op": "contains", "value": "config"}]}',
    '{"type": "require_explicit_approval", "title": "Mudança crítica de configuração", "description": "Requer aprovação explícita de Wandson antes de prosseguir — VERMELHO"}'
  );
