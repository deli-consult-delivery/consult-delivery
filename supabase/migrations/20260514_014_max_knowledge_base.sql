-- MAX · Base de Conhecimento
-- Tabela de artigos para o agente MAX (consultor técnico)
CREATE TABLE IF NOT EXISTS public.max_knowledge_base (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  system_name  text        NOT NULL,
  title        text        NOT NULL,
  content      text        NOT NULL,
  tags         text[]      NOT NULL DEFAULT '{}',
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS max_kb_tenant_idx ON public.max_knowledge_base (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS max_kb_system_idx ON public.max_knowledge_base (system_name);
CREATE INDEX IF NOT EXISTS max_kb_tags_idx   ON public.max_knowledge_base USING GIN(tags);

ALTER TABLE public.max_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Artigos globais (tenant_id IS NULL) + artigos do tenant do usuário logado
CREATE POLICY "max_kb_select" ON public.max_knowledge_base FOR SELECT USING (
  tenant_id IS NULL
  OR tenant_id = (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1
  )
);

-- Apenas admin/owner pode escrever
CREATE POLICY "max_kb_write" ON public.max_knowledge_base
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner', 'deli_owner')
    LIMIT 1
  )
);

-- ── Seed: artigos globais iniciais (tenant_id = NULL) ─────────────────────────

INSERT INTO public.max_knowledge_base (tenant_id, system_name, title, content, tags) VALUES

-- iFood
(NULL, 'ifood', 'Loja pausada ou offline no iFood',
'**Problema:** A loja aparece como pausada, fechada ou offline no iFood.

**Causas comuns:**
1. Horário de funcionamento não configurado corretamente
2. Interrupção manual acidental (botão "Pausar loja")
3. Excesso de cancelamentos recentes (penalidade automática)
4. Conta em débito (faturas em atraso)
5. Documentação vencida no cadastro

**Como verificar:**
- Acesse restaurant.ifood.com.br → "Configurações" → "Horários de funcionamento"
- Verifique alertas na aba "Financeiro"
- Verifique "Configurações" → "Status da loja" (modo férias/pausa)

**Solução rápida:**
- Se pausada manualmente: "Status da loja" → "Abrir loja"
- Se penalidade por cancelamentos: aguarde o período ou contate suporte iFood
- Suporte: chat em restaurant.ifood.com.br ou 0800 707 0535',
ARRAY['ifood', 'loja pausada', 'offline', 'abrir loja', 'fechada']),

(NULL, 'ifood', 'Pedidos não chegando / plataforma sem pedidos',
'**Problema:** A loja está aberta mas não recebe pedidos ou eles não aparecem no app.

**Verificações:**
1. Confirme que a loja está ABERTA em restaurant.ifood.com.br
2. Verifique o dispositivo que recebe pedidos:
   - App iFood para Restaurantes aberto e logado?
   - Notificações do app ativadas?
   - Internet funcionando? Reconecte ao Wi-Fi
3. Reinicie o app iFood para Restaurantes
4. Verifique se há itens ou promoções com estoque zerado bloqueando pedidos

**Teste:** Peça para alguém fazer um pedido de teste na loja.

**Se persistir:**
- Desinstale e reinstale o app iFood para Restaurantes
- Contato suporte: restaurant.ifood.com.br ou 0800 707 0535',
ARRAY['ifood', 'pedidos', 'sem pedidos', 'não recebe', 'app']),

(NULL, 'ifood', 'Como alterar cardápio, preços e fotos no iFood',
'**Alterar preços:**
1. Acesse restaurant.ifood.com.br
2. Menu lateral → "Cardápio" → clique no produto → "Editar"
3. Altere o preço → "Salvar"
4. Mudanças ficam online em até 30 minutos

**Adicionar/alterar fotos:**
1. Cardápio → produto → "Editar" → seção "Imagem"
2. Envie JPG ou PNG (mín. 500x500px, máx. 2MB)
3. Fotos profissionais aumentam vendas em até 30%

**Pausar um item temporariamente:**
1. Na lista do cardápio, clique no toggle ao lado do produto
2. O item fica indisponível imediatamente

**Dica:** Faça alterações fora do horário de pico para evitar inconsistências.',
ARRAY['ifood', 'cardápio', 'preços', 'fotos', 'editar', 'produtos']),

(NULL, 'ifood', 'Como responder avaliações de clientes no iFood',
'**Por que responder:**
- Mostra profissionalismo ao iFood e futuros clientes
- Avaliações respondidas pesam positivamente no ranqueamento

**Como responder:**
1. restaurant.ifood.com.br → "Avaliações"
2. Selecione a avaliação → "Responder"

**Para avaliações negativas:**
- Peça desculpas sem admitir culpa não verificada
- Ofereça retorno: "Contate-nos pelo WhatsApp [número] para resolvermos"
- Nunca seja agressivo — a resposta é pública
- Exemplo: "Olá [nome], lamentamos a experiência! Entre em contato conosco. Seu feedback é muito importante!"

**Para avaliações positivas:**
- Agradeça de forma personalizada
- Exemplo: "Que alegria, [nome]! Fico feliz que tenha gostado. Até a próxima! 🍕"',
ARRAY['ifood', 'avaliações', 'responder', 'reclamação', 'nota', 'reputação']),

(NULL, 'ifood', 'Cancelamentos no iFood — como reduzir e contestar',
'**Tipos de cancelamento:**
1. Por falta de item: produto esgotado mas disponível no cardápio
2. Por demora: tempo de preparo excedido
3. Por erro de pedido: item errado entregue
4. Por entregador: problemas com a entrega

**Como reduzir:**
- Mantenha cardápio atualizado (itens esgotados = pausados)
- Configure tempo de preparo realista em "Configurações" → "Tempo de preparo"
- Confirme pedidos rapidamente no app (até 3 min para evitar cancelamento automático)

**Como contestar cancelamento indevido:**
1. restaurant.ifood.com.br → "Cancelamentos"
2. Selecione o pedido → "Contestar"
3. Envie evidências (foto do pedido pronto, prints)
4. iFood analisa em até 5 dias úteis

**Atenção:** Taxa de cancelamento > 5% pode resultar em penalização.',
ARRAY['ifood', 'cancelamento', 'contestar', 'taxa cancelamento', 'penalidade']),

-- WhatsApp
(NULL, 'whatsapp', 'Como configurar mensagem de ausência no WhatsApp Business',
'**Configurar mensagem automática de ausência:**
1. Abra o WhatsApp Business
2. Menu "⋮" → "Configurações" → "Ferramentas comerciais"
3. "Mensagem de ausência" → Ativar
4. Configure horário personalizado (dias e horários de atendimento)
5. Mensagem sugerida: "Olá! Nosso atendimento é das Xh às Yh. Retornaremos em breve!"

**Mensagem de saudação (primeiro contato):**
1. Ferramentas comerciais → "Mensagem de saudação"
2. Ative e personalize

**Observação:** Estas configurações são do app WhatsApp Business padrão. O número Evolution API da plataforma Consult Delivery tem configurações separadas.',
ARRAY['whatsapp', 'horário', 'mensagem automática', 'ausência', 'atendimento']),

-- Geral
(NULL, 'geral', 'Como acessar o suporte Consult Delivery',
'**Canais de suporte da Consult Delivery:**
- WhatsApp: número configurado com Eduardo
- E-mail: suporte@consultdelivery.com.br
- Horário: Segunda a Sexta, 9h–18h

**Para urgências fora do horário:**
- WhatsApp com "URGENTE:" no início da mensagem
- O agente MAX está disponível 24/7 para triagem automática

**Ao entrar em contato, informe:**
1. Nome da loja / restaurante
2. Descrição do problema
3. Quando o problema começou
4. Soluções já tentadas

**Acesso à plataforma:** app.consultdelivery.com.br',
ARRAY['suporte', 'contato', 'consult delivery', 'ajuda', 'urgência']);
