-- 20260706_005_demo_snapshot.sql
-- Snapshot de dados FICTICIOS para o tenant cd-demo (Demo Consult Delivery),
-- so p/ as 16 telas da demo nao abrirem vazias na frente de um prospect.
-- TODO dado aqui e INVENTADO do zero (nomes, avaliacoes, casos, cobrancas) --
-- nao corresponde e nao deriva de nenhum cliente real da base.
--
-- Escopo: 4 lojas fake, 3 clientes fake (p/ o join contratos->customers em
-- src/console/Contratos.jsx), 10 avaliacoes, 3 casos de Defesa Comercial,
-- 3 contratos e 4 cobrancas mock.
--
-- Idempotente: todo o bloco roda atras de um guard unico (loja "Pizzaria
-- Bella Vista" ja existe p/ o tenant cd-demo?) -- rodavel 2x sem duplicar.
-- Esse guard cobre re-execucao normal (nada mudou) ou rollback completo
-- (tudo removido, linha abaixo); NAO cobre curadoria manual que apague so
-- parte do snapshot (ex.: so a loja1 e seus filhos) -- nesse caso, use o
-- rollback completo antes de reaplicar, em vez de contar com o guard.
--
-- Rollback (escopado ao tenant, nao toca outros tenants):
--   DELETE FROM public.cobrancas    WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.contratos    WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.defesa_casos WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.avaliacoes   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.customers    WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');
--   DELETE FROM public.lojas        WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo');

DO $$
DECLARE
  v_tenant uuid;
  v_loja1  uuid := gen_random_uuid();
  v_loja2  uuid := gen_random_uuid();
  v_loja3  uuid := gen_random_uuid();
  v_loja4  uuid := gen_random_uuid();
  v_cust1  uuid := gen_random_uuid();
  v_cust2  uuid := gen_random_uuid();
  v_cust3  uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'cd-demo';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'tenant cd-demo nao encontrado -- rode a 20260706_001 primeiro';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.lojas WHERE tenant_id = v_tenant AND nome = 'Pizzaria Bella Vista') THEN
    RETURN; -- ja semeado
  END IF;

  INSERT INTO public.lojas (id, tenant_id, nome, nicho, segmento, cidade, estado, status, fonte_dados) VALUES
    (v_loja1, v_tenant, 'Pizzaria Bella Vista',  'pizza',      'pizzaria',     'São Paulo',       'SP', 'ativo', 'portal'),
    (v_loja2, v_tenant, 'Hamburgueria do Zé',    'hamburguer', 'hamburgueria', 'Belo Horizonte',  'MG', 'ativo', 'portal'),
    (v_loja3, v_tenant, 'Sushi Sakura Express',  'japonesa',   'japonesa',     'Curitiba',        'PR', 'ativo', 'portal'),
    (v_loja4, v_tenant, 'Açaí da Praia',         'acai',       'acai',         'Florianópolis',   'SC', 'ativo', 'portal');

  INSERT INTO public.customers (id, tenant_id, name, phone) VALUES
    (v_cust1, v_tenant, 'Fernanda Lima (fictício)',  '+5511999990001'),
    (v_cust2, v_tenant, 'Marcos Andrade (fictício)', '+5511999990002'),
    (v_cust3, v_tenant, 'Juliana Rocha (fictício)',  '+5511999990003');

  INSERT INTO public.avaliacoes (tenant_id, loja_id, nota, comentario, nome_cliente, tipo, status) VALUES
    (v_tenant, v_loja1, 5, 'Pizza chegou quentinha e no prazo, adorei!',        'Ana P. (fictício)',     'loja',    'postada'),
    (v_tenant, v_loja1, 2, 'Demorou muito além do combinado.',                  'Carlos R. (fictício)',  'entrega', 'gerada'),
    (v_tenant, v_loja1, 4, 'Sabor ótimo, só a embalagem podia ser melhor.',     'Beatriz S. (fictício)', 'loja',    'aprovada_cliente'),
    (v_tenant, v_loja2, 1, 'Pedido veio errado e frio.',                        'Diego M. (fictício)',   'loja',    'ajuste_pedido'),
    (v_tenant, v_loja2, 5, 'Melhor hambúrguer da região, recomendo!',           'Larissa T. (fictício)', 'loja',    'postada'),
    (v_tenant, v_loja2, 3, 'Bom, mas o preço subiu bastante.',                  'Rafael N. (fictício)',  'loja',    'gerada'),
    (v_tenant, v_loja3, 5, 'Sushi fresco e entrega rápida.',                    'Camila V. (fictício)',  'loja',    'postada'),
    (v_tenant, v_loja3, 4, 'Muito bom, só senti falta de mais opções veganas.', 'Pedro H. (fictício)',   'loja',    'enviada_grupo'),
    (v_tenant, v_loja4, 2, 'Entregador demorou e o açaí derreteu.',             'Sofia L. (fictício)',   'entrega', 'nao_responder'),
    (v_tenant, v_loja4, 5, 'Sempre peço, nunca decepciona!',                    'Gustavo F. (fictício)', 'loja',    'postada');

  INSERT INTO public.defesa_casos (tenant_id, loja_id, canal, tipo, pedido_ref, valor_centavos, motivo, status) VALUES
    (v_tenant, v_loja2, 'ifood', 'cancelamento', 'DEMO-0001', 4590, 'Cliente alegou item não entregue (indevido)', 'aguardando_ok'),
    (v_tenant, v_loja1, 'ifood', 'avaliacao',    'DEMO-0002', 0,    'Nota 1 injusta — pedido chegou no prazo',     'ganho'),
    (v_tenant, v_loja3, 'ifood', 'cancelamento', 'DEMO-0003', 7200, 'Cancelamento após saída para entrega',        'enviado');

  INSERT INTO public.contratos (tenant_id, customer_id, pacote, valor_mensal, status) VALUES
    (v_tenant, v_cust1, 'growth',      1497.00, 'assinado'),
    (v_tenant, v_cust2, 'performance', 997.00,  'enviado'),
    (v_tenant, v_cust3, 'light',       497.00,  'rascunho');

  INSERT INTO public.cobrancas (tenant_id, loja_id, valor, vencimento, status, billing_type, customer_name, customer_phone, description) VALUES
    (v_tenant, v_loja1, 1497.00, CURRENT_DATE + 5,  'pending',  'PIX',    'Fernanda Lima (fictício)',  '+5511999990001', 'Mensalidade Growth — demo'),
    (v_tenant, v_loja2, 997.00,  CURRENT_DATE - 3,  'overdue',  'BOLETO', 'Marcos Andrade (fictício)', '+5511999990002', 'Mensalidade Performance — demo'),
    (v_tenant, v_loja3, 497.00,  CURRENT_DATE - 20, 'received', 'PIX',    'Juliana Rocha (fictício)',  '+5511999990003', 'Mensalidade Light — demo'),
    (v_tenant, NULL,    1497.00, CURRENT_DATE + 15, 'pending',  'PIX',    'Fernanda Lima (fictício)',  '+5511999990001', 'Mensalidade Growth — próximo ciclo (demo)');
END $$;
