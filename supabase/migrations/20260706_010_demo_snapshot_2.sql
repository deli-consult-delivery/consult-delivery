-- 20260706_010_demo_snapshot_2.sql
-- Complementa o snapshot ficticio do cd-demo (20260706_005): 3 tabelas com
-- payoff visivel real nas telas ja habilitadas (auditoria completa por
-- module_key no corpo do PR). TODO dado aqui e INVENTADO do zero.
--
-- Escopo:
--   1) defesa_assinaturas (2 linhas) -- alimenta o alerta "assinatura(s)
--      atrasada(s)" na Visao Geral (useAlertas, ConsoleV2.jsx) -- so aparece
--      p/ tenants com 'cora' na allowlist, que e o caso do cd-demo.
--   2) internal_notifications (4 linhas, broadcast: recipient_user_id NULL)
--      -- alimenta a tela 'notificacoes' (Notificacoes.jsx / listNotifications).
--   3) tenant_agents (3 linhas: deli, cora, lara habilitados) -- curadoria de
--      CATALOGO (quais agentes reais aparecem pro tenant), nao fabricacao de
--      historico -- alimenta as telas 'hub' (DeliHub) e 'config'
--      (AgenteConfig). Nao inclui execucoes/custo (ver justificativa no PR:
--      agent_runs e audit_log ficam de fora, tratados como ledger real).
--
-- Idempotente: guard unico (defesa_assinaturas com payer_nome desta seed ja
-- existe p/ cd-demo?) -- mesmo padrao da 005.
--
-- Rollback (escopado ao tenant, nao toca outros tenants):
--   DELETE FROM public.tenant_agents         WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.internal_notifications WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.defesa_assinaturas     WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'cd-demo';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'tenant cd-demo nao encontrado -- rode a 20260706_001 primeiro';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.defesa_assinaturas
    WHERE tenant_id = v_tenant AND payer_nome = 'Fernanda Lima (fictício)'
  ) THEN
    RETURN; -- ja semeado
  END IF;

  INSERT INTO public.defesa_assinaturas (tenant_id, status, valor_centavos, ciclo, payer_nome, payer_email) VALUES
    (v_tenant, 'ativa',     14700, 'MONTHLY', 'Fernanda Lima (fictício)',  'fernanda.demo@example.com'),
    (v_tenant, 'atrasada',  14700, 'MONTHLY', 'Marcos Andrade (fictício)', 'marcos.demo@example.com');

  INSERT INTO public.internal_notifications (tenant_id, recipient_user_id, kind, agent, title, body) VALUES
    (v_tenant, NULL, 'system',     NULL,    'Bem-vindo ao workspace demo', 'Este é um ambiente de demonstração da Consult Delivery — todos os dados são fictícios.'),
    (v_tenant, NULL, 'deli_alert', 'deli',  'Nova avaliação recebida',     'A Pizzaria Bella Vista recebeu uma avaliação de 2 estrelas — resposta sugerida disponível.'),
    (v_tenant, NULL, 'system',     'cora',  'Assinatura em atraso',        'Marcos Andrade (fictício) está com a mensalidade atrasada.'),
    (v_tenant, NULL, 'system',     NULL,    'Relatório semanal disponível', 'O resumo semanal de operação já está disponível em Visão Geral.');

  INSERT INTO public.tenant_agents (tenant_id, agent_id, enabled) VALUES
    (v_tenant, 'deli', true),
    (v_tenant, 'cora', true),
    (v_tenant, 'lara', true)
  ON CONFLICT (tenant_id, agent_id) DO UPDATE SET enabled = true;
END $$;
