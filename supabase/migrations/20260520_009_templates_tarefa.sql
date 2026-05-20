-- ============================================================
-- PILOTO Onda 02 — Migration 05 (arquivo: 20260520_009)
-- Data: 2026-05-20
-- Autor: Wandson via Claude Code
-- Motivo: Criar tabela templates_tarefa e fazer seed com os 25
--         templates do padrão Uraka Burger (6 blocos: identidade,
--         cardápio, operação, avaliações, marketing, suporte).
--         Templates permitem gerar o pipeline completo de uma loja
--         com 1 clique, sem digitar manualmente cada tarefa.
--         O seed é idempotente: usa WHERE NOT EXISTS por título+bloco,
--         evitando duplicatas em re-runs sem DROP destrutivo.
-- Risco: BAIXO — tabela nova + INSERT condicional.
--        Seed toca apenas tenant slug='consult'.
-- Reversão:
--   DELETE FROM templates_tarefa WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'consult');
--   DROP TABLE IF EXISTS templates_tarefa;
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA
-- ============================================================

CREATE TABLE IF NOT EXISTS templates_tarefa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  bloco       text    NOT NULL,
  ordem       integer NOT NULL,
  titulo      text    NOT NULL,
  situacao_padrao         text,
  o_que_sera_feito_padrao text,
  por_que_importa         text,
  prioridade  text DEFAULT 'estrutural',

  ativo       boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE templates_tarefa IS
  'Templates de tarefas pré-configurados por tenant. '
  'Ao clicar "Gerar tarefas do template" na loja, o Bridge Server '
  'copia estes templates para tarefas_loja com loja_id definido. '
  'Padrão inicial: 25 templates Uraka Burger em 6 blocos.';

COMMENT ON COLUMN templates_tarefa.bloco IS
  'Bloco de trabalho: identidade | cardapio | operacao | '
  'avaliacoes | marketing | suporte.';
COMMENT ON COLUMN templates_tarefa.ordem IS
  'Posição do template dentro do bloco — define ordem_no_bloco ao gerar tarefas.';
COMMENT ON COLUMN templates_tarefa.situacao_padrao IS
  'Texto padrão de situação copiado para a tarefa gerada. '
  'Consultor pode editar após geração.';
COMMENT ON COLUMN templates_tarefa.o_que_sera_feito_padrao IS
  'Texto padrão de ação copiado para a tarefa gerada.';
COMMENT ON COLUMN templates_tarefa.ativo IS
  'Se false, o template não é incluído na geração automática. '
  'Soft delete: não apaga o registro.';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Consulta principal: todos os templates ativos de um tenant, por bloco
CREATE INDEX IF NOT EXISTS idx_templates_tenant_bloco
  ON templates_tarefa(tenant_id, bloco, ordem)
  WHERE ativo = true;

-- Listagem admin de templates (inclui inativos)
CREATE INDEX IF NOT EXISTS idx_templates_tenant
  ON templates_tarefa(tenant_id, bloco, ordem);

-- ============================================================
-- 3. RLS — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE templates_tarefa ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant vê os templates
DO $$ BEGIN
  CREATE POLICY "Ver templates do proprio tenant"
    ON templates_tarefa FOR SELECT
    USING (
      tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- INSERT/UPDATE/DELETE: somente admin ou consultor_senior do tenant
DO $$ BEGIN
  CREATE POLICY "Gerenciar templates: admins e consultores_senior"
    ON templates_tarefa FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM tenant_members tm
        JOIN user_roles ur ON ur.user_id   = tm.user_id
        JOIN roles r       ON r.id         = ur.role_id
                          AND r.tenant_id  = tm.tenant_id
        WHERE tm.tenant_id  = templates_tarefa.tenant_id
          AND tm.user_id    = auth.uid()
          AND r.name        IN ('admin', 'consultor_senior')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM tenant_members tm
        JOIN user_roles ur ON ur.user_id   = tm.user_id
        JOIN roles r       ON r.id         = ur.role_id
                          AND r.tenant_id  = tm.tenant_id
        WHERE tm.tenant_id  = templates_tarefa.tenant_id
          AND tm.user_id    = auth.uid()
          AND r.name        IN ('admin', 'consultor_senior')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- ============================================================
-- 4. SEED — 25 TEMPLATES PADRÃO URAKA BURGER
--    Idempotente: WHERE NOT EXISTS por (tenant_id, bloco, titulo)
--    Não usa DELETE/TRUNCATE — seguro para re-run em produção.
-- ============================================================

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'consult';

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant slug=consult não encontrado. Seed de templates ignorado.';
    RETURN;
  END IF;

  -- --------------------------------------------------------
  -- BLOCO 1 — IDENTIDADE E POSICIONAMENTO (3 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'identidade', 1,
    'Definir posicionamento estratégico (volume x premium)',
    'A loja precisa decidir entre estratégia de volume (mais pedidos, ticket menor) ou premium (menos pedidos, ticket maior). Sem essa definição, as ações de cardápio e marketing ficam desalinhadas.',
    'Revisão de precificação, ofertas e comunicação para alinhar a estratégia atual da loja com a fase de crescimento desejada.',
    'Sem posicionamento claro, a loja perde eficiência em mídia paga e deixa de capturar o público certo. Definir agora evita retrabalho em cardápio e campanhas.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'identidade' AND titulo = 'Definir posicionamento estratégico (volume x premium)'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'identidade', 2,
    'Ajuste no fundo da logomarca',
    'A logomarca atual possui fundo que reduz contraste e chamatividade dentro da plataforma iFood, especialmente em modo claro.',
    'Ajuste no fundo da logo para aumentar visibilidade e destaque nos resultados de busca e telas de listagem do iFood.',
    'Logomarca com fundo inadequado diminui CTR na listagem. Correção rápida com impacto imediato em cliques.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'identidade' AND titulo = 'Ajuste no fundo da logomarca'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'identidade', 3,
    'Acréscimo de palavras-chave ao nome da loja',
    'O nome atual da loja no iFood não contém palavras-chave relevantes para buscas orgânicas dos consumidores.',
    'Adicionar palavras-chave estratégicas ao nome da loja para capturar ranqueamento orgânico em buscas por tipo de produto.',
    'O nome da loja é o principal fator de ranqueamento em buscas no iFood. Ajuste simples, impacto imediato em descoberta orgânica.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'identidade' AND titulo = 'Acréscimo de palavras-chave ao nome da loja'
  );

  -- --------------------------------------------------------
  -- BLOCO 2 — CARDÁPIO (9 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 1,
    'Nova capa do cardápio',
    'A capa atual do cardápio não destaca o produto principal e não segue as boas práticas de imagem do iFood (proporção, resolução, foco no produto).',
    'Criação de nova capa com foco no produto principal, alta resolução e composição chamativa conforme as diretrizes do iFood.',
    'A capa é a primeira imagem que o cliente vê. Uma capa de qualidade aumenta a taxa de abertura da loja nos resultados de busca.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Nova capa do cardápio'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 2,
    'Reorganização da estrutura do cardápio',
    'O cardápio atual não está organizado para conversão: produtos mais vendidos não estão em destaque, categorias não seguem hierarquia de interesse.',
    'Reestruturação completa: mais vendidos em destaque, categorias reorganizadas por popularidade e ticket, nomes de categoria revisados.',
    'A estrutura do cardápio guia a jornada do cliente. Cardápio bem organizado aumenta ticket médio e reduz abandono.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Reorganização da estrutura do cardápio'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 3,
    'Inclusão das fotos faltantes nos produtos',
    'Vários produtos estão sem foto. Produtos sem imagem não entram em listas de destaque do iFood e têm taxa de conversão significativamente menor.',
    'Inclusão de fotos profissionais ou tratadas em todos os produtos sem imagem, seguindo padrão do iFood.',
    'Produtos sem foto são ignorados pelo algoritmo do iFood em listas personalizadas. Fotos aumentam conversão em até 3x.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Inclusão das fotos faltantes nos produtos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 4,
    'Otimização dos nomes dos produtos para ranqueamento',
    'Os nomes dos produtos não exploram palavras-chave buscadas pelos consumidores, perdendo posicionamento em buscas específicas.',
    'Revisão dos nomes dos produtos com acréscimo de palavras-chave estratégicas sem perder legibilidade.',
    'Nomes de produto são indexados pelo iFood. Otimização aumenta aparecimento em buscas por ingrediente, sabor ou tipo de prato.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Otimização dos nomes dos produtos para ranqueamento'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 5,
    'Estruturação de complementos',
    'Produtos sem complementos limitam o ticket médio e não permitem cross-sell. Complementos ausentes ou mal estruturados reduzem receita por pedido.',
    'Configuração padronizada de complementos em todos os produtos elegíveis: adicionais, opções de tamanho, bebidas e sobremesas relacionadas.',
    'Complementos bem configurados aumentam ticket médio em 20-40%. É uma das alavancas de maior ROI sem custo adicional.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Estruturação de complementos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 6,
    'Ajuste do pedido mínimo',
    'O pedido mínimo atual está acima do ideal para o bairro/praça da loja, fazendo com que a loja fique fora de listas importantes do iFood.',
    'Redefinição do pedido mínimo para o valor que permite entrar nas principais listas de destaque da praça.',
    'Pedido mínimo alto exclui a loja de listas como "Entrega grátis" e "Mais rápidos". Ajuste simples com impacto imediato em visibilidade.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Ajuste do pedido mínimo'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 7,
    'Criação de combos estratégicos',
    'A loja não possui combos estruturados para cross-sell ou aproveitamento sazonal, perdendo oportunidade de aumentar ticket médio e volume.',
    'Montagem de combos cross-sell (produto principal + acompanhamento + bebida) e combos sazonais alinhados a datas comemorativas.',
    'Combos aumentam ticket médio e reduzem sensação de preço alto. Sazonalidade gera urgência de compra e mantém o cardápio vivo.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Criação de combos estratégicos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 8,
    'Habilitar agendamento de pedidos',
    'A funcionalidade de agendamento de pedidos está desativada, impedindo que clientes façam pedidos para horários futuros.',
    'Ativação do agendamento de pedidos nas configurações da loja no iFood.',
    'Agendamento aumenta volume de pedidos no horário de pico e reduz risco de cancelamento por loja fechada. Melhora experiência do cliente.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Habilitar agendamento de pedidos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'cardapio', 9,
    'Envio do cardápio físico para análise de precificação',
    'A consultoria não possui o cardápio físico ou delivery próprio da loja para comparar com os preços praticados no iFood.',
    'Cliente envia cardápio físico (foto ou PDF) para análise comparativa de preços e identificação de oportunidades de margem.',
    'Diferença de preço entre físico e iFood impacta margem e percepção de valor. Análise permite ajustes precisos sem reduzir faturamento.',
    'material_cliente'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'cardapio' AND titulo = 'Envio do cardápio físico para análise de precificação'
  );

  -- --------------------------------------------------------
  -- BLOCO 3 — OPERAÇÃO (5 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'operacao', 1,
    'Redução do tempo médio de preparo',
    'O tempo médio de preparo cadastrado no iFood está acima da média da praça, prejudicando o posicionamento no algoritmo e a satisfação do cliente.',
    'Orientação operacional para revisão de processos internos e ajuste do tempo de preparo cadastrado para o valor real otimizado.',
    'Tempo de preparo alto empurra a loja para baixo nos rankings de velocidade. Redução melhora NPS e posição no algoritmo.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'operacao' AND titulo = 'Redução do tempo médio de preparo'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'operacao', 2,
    'Aumento do tempo de loja aberta',
    'A loja fecha cedo ou abre tarde, perdendo janelas de alto volume de pedidos. Tempo aberto abaixo da média penaliza relevância no algoritmo.',
    'Análise das janelas de maior demanda na praça e orientação para ampliar horário de funcionamento nos períodos mais rentáveis.',
    'O algoritmo do iFood favorece lojas que ficam abertas por mais horas. Cada hora adicional em horário de pico pode representar 15-30% mais pedidos.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'operacao' AND titulo = 'Aumento do tempo de loja aberta'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'operacao', 3,
    'Controle de cancelamentos',
    'A taxa de cancelamento está acima do limite exigido para o selo Super Restaurante, impactando posicionamento e elegibilidade a programas iFood.',
    'Implantação de rotina de pausa preventiva de itens em falta e treinamento da equipe para reduzir cancelamentos por produto indisponível.',
    'Taxa de cancelamento acima de 2% impede o Super Restaurante e prejudica o score do algoritmo. Controle preventivo é mais eficaz que reativo.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'operacao' AND titulo = 'Controle de cancelamentos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'operacao', 4,
    'Atendimento ágil ao chat do iFood',
    'Mensagens no chat do iFood ficam sem resposta por longos períodos, gerando chamados e avaliações negativas desnecessários.',
    'Implantação de rotina de monitoramento do chat com meta de resposta em até 5 minutos durante horário de funcionamento.',
    'Chat sem resposta se transforma em chamado automático do iFood, prejudicando score e gerando cobrança de taxa. Resposta ágil reduz conflitos.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'operacao' AND titulo = 'Atendimento ágil ao chat do iFood'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'operacao', 5,
    'Tempo de espera do motoboy',
    'Motoboys frequentemente esperam o pedido ficar pronto, gerando penalizações de entrega e notas baixas de logística.',
    'Orientação para ajuste do fluxo interno para que o pedido esteja pronto antes ou no mesmo momento da chegada do motoboy.',
    'Motoboy esperando gera penalização de "tempo de espera" no painel do iFood, aumenta custo de entrega e reduz disponibilidade do entregador.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'operacao' AND titulo = 'Tempo de espera do motoboy'
  );

  -- --------------------------------------------------------
  -- BLOCO 4 — AVALIAÇÕES (3 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'avaliacoes', 1,
    'Estratégia ativa de captação de avaliações',
    'A loja não possui estratégia ativa para solicitar avaliações. Volume atual de avaliações está abaixo do necessário para o Super Restaurante.',
    'Implantação de estratégia de captação: bilhete de agradecimento na embalagem + brinde de fidelidade + script de solicitação pós-entrega.',
    'Avaliações são critério direto do Super Restaurante e influenciam o algoritmo de ranqueamento. Meta: 10+ avaliações por semana.',
    'quick_win'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'avaliacoes' AND titulo = 'Estratégia ativa de captação de avaliações'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'avaliacoes', 2,
    'Rotina de resposta às avaliações',
    'Avaliações (positivas e negativas) ficam sem resposta. O iFood e os clientes percebem ausência de engajamento da loja.',
    'A consultoria assume resposta às avaliações 2x por semana, com templates personalizados para cada tipo de feedback.',
    'Responder avaliações sinaliza engajamento ao algoritmo e recupera clientes insatisfeitos. Avaliações respondidas têm peso maior no score.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'avaliacoes' AND titulo = 'Rotina de resposta às avaliações'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'avaliacoes', 3,
    'Plano de conquista do Super Restaurante',
    'A loja ainda não possui o selo Super Restaurante. Critérios atuais de nota, cancelamento e tempo aberto estão sendo monitorados.',
    'Acompanhamento semanal dos critérios do Super Restaurante com relatório de evolução e ações corretivas quando necessário.',
    'O selo Super Restaurante aumenta visibilidade orgânica em até 30% e é exibido em destaque na listagem. Critérios são alcançáveis com foco.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'avaliacoes' AND titulo = 'Plano de conquista do Super Restaurante'
  );

  -- --------------------------------------------------------
  -- BLOCO 5 — MARKETING (3 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'marketing', 1,
    'Reestruturação das alavancas de mídia atuais',
    'O mix atual de alavancas de mídia paga (cupons, destaque, taxa zero) pode estar gerando custo elevado sem retorno proporcional.',
    'Revisão e reestruturação das alavancas ativas para maximizar eficiência: pausar as de baixo ROI, intensificar as de alto impacto.',
    'Alavancas mal configuradas consomem budget sem gerar pedidos. Revisão periódica é essencial para manter CAC controlado.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'marketing' AND titulo = 'Reestruturação das alavancas de mídia atuais'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'marketing', 2,
    'Habilitação do Vale-Refeição como forma de pagamento',
    'A loja não aceita Vale-Refeição (VR, Ticket, Sodexo, Alelo), excluindo uma fatia relevante do público e reduzindo visibilidade em filtros.',
    'Credenciamento nos principais VR (Ticket, Sodexo, Alelo, VR Refeição) e ativação nas configurações de pagamento do iFood.',
    'VR amplia o público alcançável e aumenta visibilidade no filtro "Aceita benefícios". Processo de credenciamento demora — iniciar logo.',
    'material_cliente'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'marketing' AND titulo = 'Habilitação do Vale-Refeição como forma de pagamento'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'marketing', 3,
    'Plano de Item Patrocinado',
    'A loja ainda não utiliza Item Patrocinado. O recurso estará disponível após atingir o nível 2 de maturidade no iFood.',
    'Preparação antecipada da estratégia de Item Patrocinado: identificar produtos mais vendidos para patrocinar, definir budget inicial.',
    'Item Patrocinado posiciona produtos específicos no topo das buscas relevantes. Preparar a estratégia antes da liberação evita perda de janela.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'marketing' AND titulo = 'Plano de Item Patrocinado'
  );

  -- --------------------------------------------------------
  -- BLOCO 6 — SUPORTE (2 templates)
  -- --------------------------------------------------------

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'suporte', 1,
    'Solicitação de reembolso em cancelamentos',
    'A loja não está solicitando reembolso sistemático nas ocorrências de cancelamento com culpa do iFood ou do entregador.',
    'A consultoria assume a abertura de solicitação de reembolso a cada cancelamento elegível, recuperando receita perdida.',
    'Não solicitar reembolso é deixar dinheiro na mesa. Cada cancelamento com culpa externa tem direito de ressarcimento — valor acumula.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'suporte' AND titulo = 'Solicitação de reembolso em cancelamentos'
  );

  INSERT INTO templates_tarefa
    (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, por_que_importa, prioridade)
  SELECT
    v_tenant_id,
    'suporte', 2,
    'Próximas análises da consultoria',
    'A loja está no início da consultoria. Análises periódicas garantem acompanhamento contínuo e ajuste de estratégia.',
    'Agendamento de análises periódicas pré-definidas: análise completa mensal + check semanal de métricas críticas.',
    'Suporte contínuo e proativo retém o cliente e demonstra valor ao longo do tempo. Análises periódicas são o produto central da consultoria.',
    'estrutural'
  WHERE NOT EXISTS (
    SELECT 1 FROM templates_tarefa
    WHERE tenant_id = v_tenant_id AND bloco = 'suporte' AND titulo = 'Próximas análises da consultoria'
  );

  RAISE NOTICE 'Seed de templates_tarefa concluído para tenant_id=%', v_tenant_id;
END$$;

COMMIT;
