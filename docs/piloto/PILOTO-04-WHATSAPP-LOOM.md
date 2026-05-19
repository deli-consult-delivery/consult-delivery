# PILOTO Onda 04 — WhatsApp Aprovação + Loom → Relatório

**Duração estimada:** 2 semanas
**Pré-requisitos:**
- Ondas 01, 02, 03 mergeadas
- Evolution API configurada (já existe)
- Loja-GPT funcional
- Pelo menos 1 cliente real concordou em testar aprovação via WhatsApp

---

## 🎯 Objetivo da Onda

Fechar o ciclo: análise (Loom transcript) vira relatório vira tarefas vira aprovação WhatsApp vira execução.

## 📦 O que entrega no fim desta onda

- [ ] Tabela `analises` (análise de loja, baseada em Loom)
- [ ] Task `analise-gerar-relatorio` (Loom transcript → tarefas estruturadas)
- [ ] Endpoint para receber webhook Evolution com respostas do cliente
- [ ] Parser de respostas WhatsApp ("OK tarefa 5", "aprovar bloco 2")
- [ ] Tela `/lojas/:id` aba "Análises" funcional
- [ ] Modal "Nova análise" com upload de transcrição
- [ ] Botão "Enviar pra cliente via WhatsApp" gera mensagem interativa
- [ ] Smoke test E2E real com cliente

## 📐 Schemas SQL

### Migration 01 — Tabela `analises`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  
  -- Origem
  loom_url text,
  transcricao text NOT NULL,
  tipo text CHECK (tipo IN ('inicial','periodica','urgente')) DEFAULT 'inicial',
  
  -- Processamento IA
  status text CHECK (status IN ('rascunho','processando','processada','enviada_cliente','aprovada_total','aprovada_parcial','rejeitada')) DEFAULT 'rascunho',
  agent_run_id uuid REFERENCES agent_runs(id),
  
  -- Outputs
  relatorio_markdown text,
  resumo_executivo text,
  total_tarefas_geradas integer DEFAULT 0,
  
  -- Envio
  enviada_em timestamptz,
  enviada_via text CHECK (enviada_via IN ('whatsapp','email','plataforma')),
  message_id_evolution text,
  
  -- Audit
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_analises_loja ON analises(loja_id, created_at DESC);

ALTER TABLE analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Análises do tenant"
  ON analises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = analises.loja_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Editar análises: admins + atribuídos"
  ON analises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      JOIN roles r ON r.id = ur.role_id
      WHERE l.id = analises.loja_id
        AND ur.user_id = auth.uid()
        AND r.slug IN ('admin','consultor_senior')
    )
    OR EXISTS (
      SELECT 1 FROM loja_consultores lc
      WHERE lc.loja_id = analises.loja_id
        AND lc.user_id = auth.uid()
        AND lc.ativo = true
    )
  );

COMMIT;
```

### Migration 02 — Adicionar referência em `tarefas_loja`

```sql
BEGIN;

-- Já existe campo analise_id na Onda 02, agora adicionar FK
ALTER TABLE tarefas_loja
  ADD CONSTRAINT fk_tarefas_analise
  FOREIGN KEY (analise_id) REFERENCES analises(id) ON DELETE SET NULL;

CREATE INDEX idx_tarefas_analise ON tarefas_loja(analise_id);

COMMIT;
```

### Migration 03 — Tabela `whatsapp_aprovacao_sessions`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_aprovacao_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id uuid NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  loja_id uuid NOT NULL REFERENCES lojas(id),
  
  numero_destino text NOT NULL,
  evolution_instance text NOT NULL,
  
  status text CHECK (status IN ('ativa','concluida','expirada','cancelada')) DEFAULT 'ativa',
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_was_loja ON whatsapp_aprovacao_sessions(loja_id);
CREATE INDEX idx_was_numero_ativa ON whatsapp_aprovacao_sessions(numero_destino) WHERE status = 'ativa';

ALTER TABLE whatsapp_aprovacao_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessões do tenant"
  ON whatsapp_aprovacao_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = whatsapp_aprovacao_sessions.loja_id
        AND ur.user_id = auth.uid()
    )
  );

COMMIT;
```

---

## 🤖 PROMPT PRA CLAUDE CODE

**Pré-requisitos:**
- Ondas 01-03 mergeadas
- Branch: `feature/piloto-04-whatsapp-loom`

**Cola este prompt:**

```
# PILOTO Onda 04 — WHATSAPP APROVAÇÃO + LOOM → RELATÓRIO

## OBJETIVO
Fechar o ciclo completo de consultoria. Fluxo:
1. Consultor cola transcrição Loom → IA gera relatório + 25 tarefas
2. Consultor revisa, envia pro cliente via WhatsApp
3. Cliente aprova/rejeita item a item ou em bloco via mensagem
4. Sistema parseia respostas e atualiza status das tarefas automaticamente
5. Notifica consultor pra começar execução

## CONTEXTO
- Doc autoritativo: docs/piloto/PILOTO-04-WHATSAPP-LOOM.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- Branch: feature/piloto-04-whatsapp-loom
- Onda 02 já tem aprovação manual; Onda 04 automatiza via WhatsApp

## INFRAESTRUTURA NECESSÁRIA
- Evolution API configurada e funcionando (já está, é usada no chat)
- Webhook Evolution recebendo mensagens (já está)
- Bridge Server pode adicionar handler novo no webhook existente

## TAREFAS

### Tarefa 1 — Reconhecimento
- Confirma Ondas 01-03 mergeadas
- Lê código atual do webhook Evolution
- Identifica onde plugar handler novo
- ME PERGUNTAR antes de seguir

### Tarefa 2 — 3 migrations (use @cd-migration-creator)
2.1. analises
2.2. ALTER tarefas_loja (FK pra analises)
2.3. whatsapp_aprovacao_sessions

### Tarefa 3 — Task analise-gerar-relatorio (use @cd-task-creator)

Input Zod:
{ analise_id: uuid, loja_id: uuid }

run() faz:
1. const client = new Anthropic(); // dentro!
2. Busca análise + transcrição
3. Busca contexto da loja
4. Busca templates_tarefa do tenant
5. Prompt:
   "Você recebe transcrição de análise de delivery iFood. 
   Estruture em 6 blocos (Identidade/Cardápio/Operação/Avaliações/Marketing/Suporte).
   Pra cada ponto identificado, gere uma tarefa com:
   - bloco, ordem, título, situação, o_que_sera_feito, prioridade
   Use os templates fornecidos como referência (pode adaptar).
   Output: { resumo_executivo, tarefas: [...] }"
6. Insere tarefas em tarefas_loja com status='rascunho', analise_id=...
7. Atualiza analise.relatorio_markdown
8. Atualiza analise.total_tarefas_geradas
9. logAgentRun

### Tarefa 4 — Aba "Análises" do workspace

Substituir placeholder Onda 01.

Layout:
- Botão "Nova análise"
- Lista de análises com status, total_tarefas, data

Modal "Nova análise":
- Loom URL (text, opcional)
- Tipo (radio: inicial / periódica / urgente)
- Transcrição (textarea grande)
- Botão "Processar com IA"

Após processar:
- Mostra resumo executivo
- Mostra preview das tarefas geradas
- Botão "Aceitar e criar tarefas"
- Botão "Refazer com ajuste"

Após aceitar:
- Vai pra aba Tarefas com as tarefas criadas em status rascunho

### Tarefa 5 — Botão "Enviar pra cliente via WhatsApp"

Na aba Análises:
- Botão "Enviar análise pra cliente"
- Modal de confirmação:
  - Mostra preview da mensagem
  - Input do número de destino (auto-preenche se cliente tem)
  - Botão "Enviar agora"

Backend:
- Cria whatsapp_aprovacao_sessions
- Monta mensagem formatada (markdown convertido pra texto WhatsApp):
  "Análise da [LOJA NOME]
  
  Olá [Cliente]! Conforme combinado, segue a relação completa de ajustes:
  
  📋 BLOCO 1 — IDENTIDADE
  
  Tarefa 1: [título]
  Situação: [...]
  
  ...
  
  Pra aprovar, responda:
  - 'OK 1' (aprova tarefa 1)
  - 'OK bloco 1' (aprova bloco inteiro)
  - 'OK tudo' (aprova todas)
  - 'NAO 3' (rejeita tarefa 3)
  - 'DUVIDA 4: [pergunta]' (envia pergunta)
  - 'OK 1, 3, 5' (aprova múltiplas)
  
  Aguardo retorno."
- Envia via Evolution API
- Marca tarefas com status='aguardando_aprovacao'
- Marca analise.status='enviada_cliente'

### Tarefa 6 — Webhook handler de respostas

Em bridge-server/webhooks/evolution.js (ou similar):

Adicionar handler para mensagens DE clientes COM whatsapp_aprovacao_session ativa:

1. Verifica se número tem sessão ativa em whatsapp_aprovacao_sessions
2. Se sim, parseia conteúdo:
   - Regex pra "OK X" → aprova tarefa X
   - Regex pra "OK bloco Y" → aprova todas tarefas do bloco Y
   - Regex pra "OK tudo" → aprova todas
   - Regex pra "NAO X" → rejeita tarefa X
   - Regex pra "DUVIDA X:" → cria comentário tarefa
3. Pra cada match, atualiza tarefa via API existente (Onda 02)
4. Insere em tarefa_aprovacoes com feita_via='whatsapp'
5. Responde no WhatsApp:
   "Recebi! Tarefa 5 aprovada. Vou iniciar execução."
6. Notifica consultor (in-app notification)

Edge cases:
- Resposta ambígua: "Não entendi sua resposta. Pode repetir como 'OK 5'?"
- Pergunta livre: registra como comentário, notifica consultor sem mudar status
- Mensagem fora de sessão: ignora (vai pro chat normal)

### Tarefa 7 — Parser de respostas em trigger/_shared/parse-resposta-cliente.ts

Função pura, testável:
parseRespostaCliente(texto: string): {
  aprovacoes: number[],
  bloco_aprovacoes: string[],
  rejeicoes: number[],
  duvidas: { tarefa: number, pergunta: string }[],
  ambiguo: boolean,
  conteudo_original: string
}

Suporta:
- "OK 5"
- "ok 1, 3, 5"
- "Aprovado 2"
- "OK bloco 1"
- "OK tudo"
- "NAO 3"
- "Rejeito 4"
- "DUVIDA 5: como vai ficar a cor?"
- "Tenho duvida na 3"

Cobertura de testes 90%+.

### Tarefa 8 — Tela de monitoramento de sessões

Em /lojas/:id/aba-analises:
- Card "Sessão WhatsApp ativa": expira em X dias
- Lista de interações: mensagens enviadas pelo cliente
- Botão "Forçar encerrar sessão" (admin)

### Tarefa 9 — Notificações

Quando cliente responde via WhatsApp:
- Cria notification pro consultor atribuído à loja
- Aparece no sino do header
- Click leva pra tarefa específica

### Tarefa 10 — Smoke test E2E REAL

⚠️ Este teste envolve CLIENTE REAL. Combinar com cliente antes.

1. Wandson cria loja "Hamburgueria Top Burger" (real)
2. Cola transcrição Loom de análise real
3. Dispara "Processar com IA"
4. Revisa 25 tarefas geradas
5. Ajusta 2-3 tarefas manualmente
6. Clica "Enviar pra cliente via WhatsApp"
7. Cliente recebe no WhatsApp
8. Cliente responde "OK bloco 2" (aprova cardápio inteiro)
9. Sistema processa: 8 tarefas viram 'aprovada'
10. Cliente envia "DUVIDA 13: qual o impacto disso?"
11. Sistema cria comentário e notifica Wandson
12. Cliente envia "OK 13, 14, 15"
13. Sistema processa, atualiza tarefas
14. Cliente envia "NAO 19" (rejeita 1)
15. Sistema marca rejeitada + notifica Wandson
16. Documenta TUDO bruto

## CRITÉRIO DE ACEITE

- [ ] 3 migrations aplicadas
- [ ] Task analise-gerar-relatorio funciona
- [ ] Aba Análises com fluxo completo (criar → processar → revisar → enviar)
- [ ] Webhook Evolution roteia respostas corretamente
- [ ] Parser cobre 5+ formatos de resposta
- [ ] Sessão WhatsApp ativa visível na UI
- [ ] Notificações in-app aparecem
- [ ] Smoke test E2E com cliente real funciona
- [ ] @cd-validator passa
- [ ] Sem regressão (chat ao vivo intacto)

## RESTRIÇÕES
- Evolution API: NUNCA enviar pro número errado
- Sessões expiram em 7 dias (configurável)
- Cliente pode SEMPRE conversar normalmente fora de sessão (chat ao vivo)
- NUNCA ignorar mensagem do cliente: se ambíguo, sempre responder pedindo clareza

## RISCOS
- Cliente confuso com formato → fallback: avisar que pode aprovar pela plataforma também
- Mensagem perdida → reenvio manual
- Cliente aprova fora do formato → consultor aprova manualmente na plataforma

Começar Tarefa 1. ME PERGUNTAR ao terminar cada uma.
```

## 📊 Estimativa

| Tarefa | Tempo |
|---|---|
| 1. Reconhecimento | 1h |
| 2. 3 migrations | 4h |
| 3. Task IA gerar relatório | 2-3 dias |
| 4. Aba Análises | 2 dias |
| 5. Envio WhatsApp | 1 dia |
| 6. Webhook handler | 1-2 dias |
| 7. Parser respostas | 1 dia (testes!) |
| 8. Monitoramento sessões | 1 dia |
| 9. Notificações | 4h |
| 10. Smoke test real | 1-2 dias |

**Total: 9-13 dias úteis** (2 semanas)

## ⚠️ Riscos críticos desta onda

| Risco | Mitigação |
|---|---|
| Cliente real recebe mensagem errada | Confirmar número 2x antes de enviar |
| Parser falha em resposta natural | Fallback: pergunta clarificação |
| Cliente recusa formato → projeto morre | Fallback aprovação manual mantém pipe ativo |
| Evolution API mudar API | Camada de abstração no Bridge |

---

## ✅ Quando esta onda fechar

PILOTO está COMPLETO. Volta pra V2 original:
1. CORA Tarefa 3-10 (Asaas pronto, dá pra retomar)
2. BRENO + WhatsApp auto (V2-2)
3. SOFIA (precisa ICP)
4. VERA (precisa KPIs)

Ou: começar V3 do PILOTO (integração API iFood, recomendações proativas, dashboard executivo).
