# PILOTO Onda 02 — Pipeline de Tarefas por Loja

**Duração estimada:** 1-2 semanas
**Pré-requisitos:**
- Onda 01 mergeada (`feature/piloto-01-fundacao` na main)
- Tabela `lojas` populada com 2+ lojas reais
- 2+ consultores atribuídos
- Smoke test da Onda 01 confirmou tudo funcionando

---

## 🎯 Objetivo da Onda

Substituir o ClickUp paralelo. Cada loja tem um pipeline de tarefas organizadas em blocos (Identidade, Cardápio, Operação, Avaliações, Marketing, Suporte), com workflow de aprovação cliente, upload de prints, comentários e histórico completo.

## 📦 O que entrega no fim desta onda

- [ ] 4 migrations Supabase (tarefas_loja, tarefa_aprovacoes, tarefa_prints, tarefa_comentarios)
- [ ] Templates de tarefas pré-definidos (padrão Uraka Burger — 25 tarefas em 6 blocos)
- [ ] 10-12 endpoints Bridge Server
- [ ] Tela `/lojas/:id` aba "Tarefas" funcional
- [ ] Modal de tarefa com prints, comentários, histórico
- [ ] Geração de relatório PDF/markdown formatado pro cliente
- [ ] Smoke test E2E: criar análise → gerar tarefas → enviar relatório → simular aprovação → marcar concluída

## 📐 Schemas SQL

### Migration 01 — Tabela `tarefas_loja`

```sql
-- Cabeçalho: PILOTO Onda 02 — Pipeline de tarefas por loja
-- Data: 2026-05-XX | Risco: baixo (nova tabela)
-- Reversão: DROP TABLE tarefas_loja CASCADE;

BEGIN;

CREATE TABLE IF NOT EXISTS tarefas_loja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  analise_id uuid, -- referência opcional pra Onda 04 (analises)
  
  -- Categorização
  bloco text NOT NULL CHECK (bloco IN (
    'identidade','cardapio','operacao','avaliacoes','marketing','suporte'
  )),
  ordem_no_bloco integer NOT NULL DEFAULT 0,
  
  -- Conteúdo
  titulo text NOT NULL,
  situacao text NOT NULL,
  o_que_sera_feito text NOT NULL,
  por_que_importa text,
  
  -- Estado
  status text NOT NULL CHECK (status IN (
    'rascunho',           -- consultor escrevendo
    'aguardando_envio',   -- pronta, esperando ser enviada pro cliente
    'aguardando_aprovacao', -- enviada, cliente vê
    'aprovada',           -- cliente aprovou
    'rejeitada',          -- cliente rejeitou
    'em_execucao',        -- consultor trabalhando
    'aguardando_validacao', -- consultor terminou, cliente confere
    'concluida',          -- finalizada
    'cancelada'
  )) DEFAULT 'rascunho',
  
  prioridade text CHECK (prioridade IN (
    'quick_win','estrutural','material_cliente'
  )) DEFAULT 'estrutural',
  
  -- Datas
  prazo_estimado date,
  aprovada_em timestamptz,
  executada_em timestamptz,
  concluida_em timestamptz,
  
  -- Atribuição
  responsavel_id uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  
  -- Metadados
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tarefas_loja ON tarefas_loja(loja_id);
CREATE INDEX idx_tarefas_status ON tarefas_loja(status);
CREATE INDEX idx_tarefas_bloco ON tarefas_loja(loja_id, bloco, ordem_no_bloco);
CREATE INDEX idx_tarefas_responsavel ON tarefas_loja(responsavel_id);

ALTER TABLE tarefas_loja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tarefas visíveis pra tenant"
  ON tarefas_loja FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = tarefas_loja.loja_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Editar tarefas: admins + consultor atribuído"
  ON tarefas_loja FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      JOIN roles r ON r.id = ur.role_id
      WHERE l.id = tarefas_loja.loja_id
        AND ur.user_id = auth.uid()
        AND r.slug IN ('admin','consultor_senior')
    )
    OR EXISTS (
      SELECT 1 FROM loja_consultores lc
      WHERE lc.loja_id = tarefas_loja.loja_id
        AND lc.user_id = auth.uid()
        AND lc.ativo = true
    )
  );

CREATE TRIGGER tarefas_loja_updated_at
  BEFORE UPDATE ON tarefas_loja
  FOR EACH ROW
  EXECUTE FUNCTION update_lojas_updated_at();

COMMIT;
```

### Migration 02 — Tabela `tarefa_aprovacoes`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS tarefa_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,
  
  acao text NOT NULL CHECK (acao IN (
    'enviada_aprovacao','aprovada','rejeitada','perguntou_duvida',
    'iniciou_execucao','submeteu_validacao','concluiu','reabriu'
  )),
  
  -- Autor da ação (interno ou externo)
  feita_por_tipo text CHECK (feita_por_tipo IN ('consultor','cliente','sistema')),
  feita_por_user_id uuid REFERENCES auth.users(id), -- se interno
  feita_por_cliente_id uuid, -- se externo (referência futura)
  feita_via text CHECK (feita_via IN ('plataforma','whatsapp','email','chat')),
  
  comentario text,
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_aprovacoes_tarefa ON tarefa_aprovacoes(tarefa_id, created_at DESC);

ALTER TABLE tarefa_aprovacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver aprovações da loja"
  ON tarefa_aprovacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tarefas_loja t
      JOIN lojas l ON l.id = t.loja_id
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE t.id = tarefa_aprovacoes.tarefa_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Inserir aprovações: mesma regra de tarefa"
  ON tarefa_aprovacoes FOR INSERT
  WITH CHECK (true); -- validação no Bridge (mais simples)

COMMIT;
```

### Migration 03 — Tabela `tarefa_prints`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS tarefa_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,
  
  storage_path text NOT NULL, -- Supabase Storage path
  url_publica text,            -- URL público (signed)
  
  legenda text,
  tipo text CHECK (tipo IN ('antes','depois','referencia','aprovacao_cliente')),
  
  enviado_por uuid REFERENCES auth.users(id),
  enviado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_prints_tarefa ON tarefa_prints(tarefa_id);

ALTER TABLE tarefa_prints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver prints da loja"
  ON tarefa_prints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tarefas_loja t
      JOIN lojas l ON l.id = t.loja_id
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE t.id = tarefa_prints.tarefa_id
        AND ur.user_id = auth.uid()
    )
  );

COMMIT;
```

### Migration 04 — Tabela `tarefa_comentarios`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS tarefa_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,
  
  autor_id uuid REFERENCES auth.users(id),
  autor_tipo text CHECK (autor_tipo IN ('consultor','cliente','sistema','ia')),
  
  conteudo text NOT NULL,
  
  -- Mídia (opcional, referência tarefa_prints)
  print_id uuid REFERENCES tarefa_prints(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_comentarios_tarefa ON tarefa_comentarios(tarefa_id, created_at DESC);

ALTER TABLE tarefa_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver comentários"
  ON tarefa_comentarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tarefas_loja t
      JOIN lojas l ON l.id = t.loja_id
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE t.id = tarefa_comentarios.tarefa_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Comentar: mesma regra"
  ON tarefa_comentarios FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
  );

COMMIT;
```

### Migration 05 — Seed de templates

```sql
BEGIN;

-- Tabela de templates de tarefas
CREATE TABLE IF NOT EXISTS templates_tarefa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  bloco text NOT NULL,
  ordem integer NOT NULL,
  titulo text NOT NULL,
  situacao_padrao text,
  o_que_sera_feito_padrao text,
  por_que_importa text,
  prioridade text DEFAULT 'estrutural',
  
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed dos 25 templates do padrão Uraka Burger (resumo, expandir com texto completo)
INSERT INTO templates_tarefa (tenant_id, bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, prioridade)
SELECT 
  (SELECT id FROM tenants WHERE slug = 'consult'),
  bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, prioridade
FROM (VALUES
  -- BLOCO 1 — IDENTIDADE E POSICIONAMENTO
  ('identidade', 1, 'Definir posicionamento estratégico (volume x premium)', 'A loja precisa decidir entre estratégia de volume ou premium.', 'Revisão de precificação, ofertas e comunicação para alinhar a fase atual da loja.', 'estrutural'),
  ('identidade', 2, 'Ajuste no fundo da logomarca', 'Logo atual pode reduzir chamatividade dentro da plataforma.', 'Ajuste no fundo da logo para mais visibilidade.', 'quick_win'),
  ('identidade', 3, 'Acréscimo de palavras-chave ao nome da loja', 'Nome atual perde ranqueamento em buscas.', 'Adicionar palavras-chave pra capturar ranqueamento.', 'quick_win'),
  
  -- BLOCO 2 — CARDÁPIO
  ('cardapio', 1, 'Nova capa do cardápio', 'Capa atual não destaca produto.', 'Criação de capa nova e chamativa.', 'quick_win'),
  ('cardapio', 2, 'Reorganização da estrutura do cardápio', 'Cardápio não está organizado para conversão.', 'Reestruturação completa com mais vendidos em destaque.', 'quick_win'),
  ('cardapio', 3, 'Inclusão das fotos faltantes nos produtos', 'Produtos sem foto não entram em listas de destaque.', 'Inclusão das fotos faltantes.', 'quick_win'),
  ('cardapio', 4, 'Otimização dos nomes dos produtos para ranqueamento', 'Nomes não exploram palavras-chave.', 'Acréscimo de palavras-chave estratégicas.', 'quick_win'),
  ('cardapio', 5, 'Estruturação de complementos', 'Produtos sem complementos limitam ticket médio.', 'Configuração padronizada de complementos.', 'quick_win'),
  ('cardapio', 6, 'Ajuste do pedido mínimo', 'Pedido mínimo atual desenquadra de listas.', 'Redefinição para entrar em listas importantes.', 'quick_win'),
  ('cardapio', 7, 'Criação de combos estratégicos', 'Loja não tem combos estruturados.', 'Montagem de combos cross-sell + sazonais.', 'estrutural'),
  ('cardapio', 8, 'Habilitar agendamento de pedidos', 'Agendamento desativado.', 'Ativação do agendamento.', 'quick_win'),
  ('cardapio', 9, 'Envio do cardápio físico para análise de precificação', 'Precisa validar preços do físico vs iFood.', 'Envio do cardápio físico pra análise.', 'material_cliente'),
  
  -- BLOCO 3 — OPERAÇÃO
  ('operacao', 1, 'Redução do tempo médio de preparo', 'Tempo atual alto afeta algoritmo.', 'Orientação operacional pra reduzir tempo.', 'quick_win'),
  ('operacao', 2, 'Aumento do tempo de loja aberta', 'Baixo tempo aberto penaliza relevância.', 'Rotinas pra manter loja aberta no horário programado.', 'quick_win'),
  ('operacao', 3, 'Controle de cancelamentos', 'Taxa alta impede Super Restaurante.', 'Rotina de pausa de itens em falta.', 'quick_win'),
  ('operacao', 4, 'Atendimento ágil ao chat do iFood', 'Chat sem resposta vira chamado.', 'Rotina de monitoramento de chat.', 'estrutural'),
  ('operacao', 5, 'Tempo de espera do motoboy', 'Motoboy esperando gera penalização.', 'Pedido pronto antes do motoboy chegar.', 'estrutural'),
  
  -- BLOCO 4 — AVALIAÇÕES
  ('avaliacoes', 1, 'Estratégia ativa de captação de avaliações', 'Faltam avaliações pra Super Restaurante.', 'Bilhete + brinde + script de captação.', 'quick_win'),
  ('avaliacoes', 2, 'Rotina de resposta às avaliações', 'Respostas mostram engajamento.', 'Consultoria responde 2x por semana.', 'estrutural'),
  ('avaliacoes', 3, 'Plano de conquista do Super Restaurante', 'Selo aumenta visibilidade.', 'Acompanhamento semanal dos critérios.', 'estrutural'),
  
  -- BLOCO 5 — MARKETING
  ('marketing', 1, 'Reestruturação das alavancas de mídia atuais', 'Mix atual pode estar caro.', 'Revisão das alavancas pra eficiência.', 'estrutural'),
  ('marketing', 2, 'Habilitação do Vale-Refeição como forma de pagamento', 'VR amplia visibilidade.', 'Credenciar Ticket, Sodexo, Alelo, VR.', 'material_cliente'),
  ('marketing', 3, 'Plano de Item Patrocinado', 'Anúncios após nível 2.', 'Preparar estratégia antecipada.', 'estrutural'),
  
  -- BLOCO 6 — SUPORTE
  ('suporte', 1, 'Solicitação de reembolso em cancelamentos', 'Não solicitar = perder reembolso.', 'Consultoria abre solicitação a cada cancelamento.', 'estrutural'),
  ('suporte', 2, 'Próximas análises da consultoria', 'Suporte contínuo.', 'Análises periódicas pré-agendadas.', 'estrutural')
) AS templates(bloco, ordem, titulo, situacao_padrao, o_que_sera_feito_padrao, prioridade);

COMMIT;
```

---

## 🤖 PROMPT PRA COLAR NO CLAUDE CODE

**Pré-requisitos:**
- Onda 01 mergeada
- Branch nova: `git checkout -b feature/piloto-02-pipeline-tarefas`

**Cola este prompt:**

```
# PILOTO Onda 02 — PIPELINE DE TAREFAS POR LOJA

## OBJETIVO
Substituir ClickUp paralelo. Implementar pipeline de tarefas por loja com:
- Templates pré-definidos (padrão Uraka Burger - 25 tarefas em 6 blocos)
- Workflow de aprovação (consultor → cliente → execução → validação)
- Upload de prints
- Comentários e histórico
- Geração de relatório formatado pro cliente

## CONTEXTO
- Doc autoritativo: docs/piloto/PILOTO-02-PIPELINE-TAREFAS.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- Branch: feature/piloto-02-pipeline-tarefas
- Onda 01 (Fundação) mergeada — lojas existem, RBAC consultor existe
- Decisões: aprovação cliente via chat ao vivo nesta onda (WhatsApp interativo só Onda 04)

## REGRAS NÃO-NEGOCIÁVEIS
(idênticas à Onda 01)

## TAREFAS

### Tarefa 1 — Reconhecimento
Confirma estado pós-Onda 01:
- Tabela lojas tem dados
- loja_consultores tem atribuições
- Papéis consultor e consultor_senior existem
- Workspace /lojas/:id renderiza
ME PERGUNTAR antes de seguir.

### Tarefa 2 — 5 migrations (use @cd-migration-creator)
Conforme PILOTO-02-PIPELINE-TAREFAS.md:
2.1. tarefas_loja
2.2. tarefa_aprovacoes
2.3. tarefa_prints
2.4. tarefa_comentarios
2.5. templates_tarefa + seed com 25 templates Uraka Burger

### Tarefa 3 — Endpoints Bridge

3.1.  GET    /api/lojas/:id/tarefas?bloco=&status=&prioridade=
3.2.  GET    /api/tarefas/:id (com aprovações + prints + comentários)
3.3.  POST   /api/lojas/:id/tarefas (criar manual)
3.4.  POST   /api/lojas/:id/tarefas/from-templates (gerar 25 do template)
3.5.  PATCH  /api/tarefas/:id
3.6.  POST   /api/tarefas/:id/enviar-aprovacao
3.7.  POST   /api/tarefas/:id/aprovar (interno OU recebe webhook futuro)
3.8.  POST   /api/tarefas/:id/rejeitar
3.9.  POST   /api/tarefas/:id/iniciar-execucao
3.10. POST   /api/tarefas/:id/submeter-validacao
3.11. POST   /api/tarefas/:id/concluir
3.12. POST   /api/tarefas/:id/comentarios
3.13. POST   /api/tarefas/:id/prints (upload Supabase Storage)
3.14. GET    /api/lojas/:id/relatorio?formato=markdown|html|pdf

Cada endpoint: JWT, RBAC, Zod, audit log, retorno consistente.

### Tarefa 4 — Tela /lojas/:id Aba Tarefas
Substituir placeholder da Onda 01.

Layout:
- Header da aba com botões:
  - "Gerar tarefas do template" (modal de confirmação)
  - "Nova tarefa manual"
  - "Enviar relatório pro cliente"
- Filtros: bloco (chips), status, prioridade
- View modes: lista | kanban
- Kanban: colunas por status, drag-and-drop pra mover

Cards mostram:
- Bloco + ordem (badge)
- Título
- Prioridade (badge colorido)
- Responsável (avatar)
- Status com cor
- Indicador de prints e comentários
- Última atualização (relativo)

### Tarefa 5 — Modal de tarefa (visualizar + editar)

Tabs internas:
- **Detalhes**: campos editáveis (título, situação, o que será feito, etc)
- **Histórico**: timeline de tarefa_aprovacoes
- **Prints**: galeria com upload
- **Comentários**: thread com input no fim

Ações contextuais por status:
- Rascunho: "Enviar pra aprovação"
- Aguardando aprovação: "Marcar aprovada manualmente" (caso cliente respondeu fora)
- Aprovada: "Iniciar execução"
- Em execução: "Submeter validação"
- Aguardando validação: "Marcar concluída"
- Concluída: "Reabrir"

### Tarefa 6 — Geração de relatório
Endpoint /api/lojas/:id/relatorio:

- Busca todas as tarefas
- Agrupa por bloco
- Aplica template padrão (formato Uraka Burger)
- Renderiza em markdown
- Se ?formato=html: converte markdown pra HTML estilizado
- Se ?formato=pdf: gera PDF (use puppeteer ou pdfkit)

Tela: botão "Enviar relatório pro cliente":
- Preview do markdown
- Botão "Copiar markdown"
- Botão "Baixar PDF"
- Botão "Enviar via WhatsApp" (placeholder Onda 04)
- Por enquanto, copia URL/conteúdo manualmente

### Tarefa 7 — Aba Visão geral (atualizar)
Na aba "Visão geral" do workspace:
- Card "Resumo de tarefas": X aprovadas, Y em execução, Z aguardando cliente
- Lista "Próximas ações" (até 5 tarefas mais urgentes)
- Indicador "Última análise": data + link pra análise (Onda 04)

### Tarefa 8 — Documentação
- docs/piloto/PILOTO-02-IMPLEMENTACAO.md
- Atualizar RESTRUCTURE.md

### Tarefa 9 — Smoke test E2E

1. Login Wandson
2. Abre Pizzaria Teste PILOTO
3. Aba Tarefas → "Gerar tarefas do template" → confirma
4. Vê as 25 tarefas em 6 blocos
5. Edita tarefa 2 (logo) → muda título, situação
6. Clica "Enviar pra aprovação" na tarefa 4 (nova capa)
7. Confere histórico mostra "enviada_aprovacao"
8. Como admin, marca "aprovada manualmente"
9. Status muda pra "aprovada"
10. "Iniciar execução" → status em_execucao
11. Upload de 1 print "antes" + 1 "depois"
12. "Submeter validação" → status aguardando_validacao
13. "Marcar concluída"
14. Comentário "Ficou ótimo!"
15. "Gerar relatório" → markdown renderiza com bloco Cardápio + 1 tarefa concluída
16. Baixa PDF do relatório
17. Logout, login como consultor B (não atribuído)
18. Confirma que NÃO vê as tarefas da Pizzaria Teste PILOTO

Documenta tudo bruto.

## CRITÉRIO DE ACEITE

- [ ] 5 migrations aplicadas
- [ ] 14 endpoints funcionando
- [ ] Aba Tarefas com lista + kanban
- [ ] Modal de tarefa funcional com 4 tabs
- [ ] Templates geram 25 tarefas corretamente
- [ ] Workflow completo (rascunho → concluída) testado
- [ ] Upload de prints funciona (Supabase Storage)
- [ ] Relatório markdown e PDF gerados
- [ ] RLS testado (consultor B não vê loja A)
- [ ] @cd-validator passa
- [ ] Sem regressão Onda 01

## RESTRIÇÕES
- Branch dedicada
- Não mexer em Onda 01 features
- Não mexer em V2 anteriores

## USO SUBAGENTS
- @cd-migration-creator: 5 migrations
- @cd-validator: gate final

Começar Tarefa 1. ME PERGUNTAR ao terminar cada uma.
```

## ✅ Critério de aceite (Wandson)

- [ ] Workspace mostra aba Tarefas funcional
- [ ] Templates Uraka Burger gerados em 1 loja teste
- [ ] Workflow completo testado (rascunho → concluída)
- [ ] Upload de print funciona
- [ ] Relatório PDF gerado e visualmente OK
- [ ] @cd-validator passa
- [ ] Sem regressão

## 📊 Estimativa

| Tarefa | Tempo |
|---|---|
| 1. Reconhecimento | 30min |
| 2. 5 migrations | 1 dia |
| 3. 14 endpoints | 2-3 dias |
| 4-5. Tela + modal | 2-3 dias |
| 6. Relatório | 1-2 dias |
| 7. Visão geral | 4h |
| 8. Docs | 2h |
| 9. Smoke test | 4-6h |

**Total: 7-10 dias úteis** (1.5-2 semanas)
