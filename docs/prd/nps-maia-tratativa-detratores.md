# PRD — Pesquisa NPS pós-atendimento + Tratativa de Detratores por IA (Agente MAIA)

| Campo | Valor |
|---|---|
| Status | **DRAFT v2** — revisado por 6 lentes adversariais (cd-raven + database-reviewer + security-reviewer + council Skeptic/Pragmatist/Critic) |
| Data | 2026-06-25 |
| Autor | Claude Code (planejamento) · aprovação: Wandson Silva |
| Tipo | PRD (somente planejamento — **sem implementação**) |
| Evolui | `/root/.claude/plans/enchanted-hatching-bubble.md` (Karina Doceria) |
| Tenants alvo | Consult Delivery `9079bd4d-4090-4023-90fb-d79c8ba7e900` (confirmar UUID no BD antes da migration) · Karina Doceria `e9fdaa66-cbe7-4dff-905b-afc4b10219ff` |
| Stack | React 18 + Vite (Console V2 `.cv2-*`) · Supabase `czyanilrverorwenikqw` · Trigger.dev · Bridge Node/Express :3001 · **DataCrazy (API oficial WhatsApp — canal da Karina)** · Evolution API (canal CD, fora do teste atual) · Asaas |
| Canal por tenant | **Karina Doceria → DataCrazy / API oficial do WhatsApp** (CRM dela, módulo de avaliações já integrado e testado) = **tenant de teste**. Consult Delivery → Evolution API = **fora do escopo de teste agora** (futuro: avaliar API oficial). |

> ### Δ v1 → v2 (o que a revisão adversarial mudou)
> 1. **Virada manual-first.** O valor do MVP está no **laço manual** (detectar detrator → alertar grupo → humano trata em SLA). A IA (MAIA) é a **camada 2**, gated, só na F3. **Modo automático saiu do escopo datado** (council unânime + Critic): 1 pessoa não opera IA respondendo cliente irritado sem supervisão.
> 2. **D-1 fechada** a favor de `nps_avaliacoes` como tabela-mestre do fluxo NPS (evita duas fontes de verdade e duplo-disparo).
> 3. **Virada de canal (substitui a premissa Evolution).** O **piloto roda na Karina Doceria por API oficial (DataCrazy)** — o CRM dela já tem o **módulo de avaliações integrado, testado e funcionando** via API; o NPS reusa exatamente esse caminho. **CD/Evolution fica fora do teste atual.** Com isso o **D-6 (ban Meta no número não-oficial) deixa de ser bloqueante do piloto** — passa a valer **só para o eventual rollout na CD via Evolution** (decisão futura).
> 4. **KPIs com viés de autosseleção:** separar **detrator detectado × detrator que respondeu**, reportar sempre **N + taxa de resposta + taxa de silêncio**.
> 5. **Gatilho de fechamento blindado:** idempotência por `origin_conversation_id`, whitelist de `close_reason`, fallback de nulos, tratamento de reabertura.
> 6. **Karina é o tenant de teste, não a CD.** A pesquisa **dispara quando o atendimento é encerrado** (o poller `datacrazy-nps-poller` filtra `finished === true`). O alerta de detrator vai para o **grupo de WhatsApp da Karina**; **se não houver grupo dela disponível, o fallback de teste é o WhatsApp pessoal do Wandson** (contato cadastrado no CRM da Karina). Reparentar os ~70 grupos hoje pertencentes à CD (D-3) deixa de ser bloqueante — o fallback resolve o teste.

---

## 1. Sumário executivo

Implantar **pesquisa de NPS transacional pós-atendimento** no WhatsApp que captura **(a) nome do atendente**, **(b) tempo de atendimento** (abertura → fechamento da conversa) e **(c) nota NPS (0–10)**, e fechar o **laço de tratativa de detratores** (nota 0–6).

**O valor do MVP vem do laço MANUAL, não da IA.** A sequência que entrega resultado já na F2 é: detrator detectado → **alerta no grupo de WhatsApp da operação** → humano abre o caso e trata dentro do SLA (<48h). Isso funciona sem nenhum modelo de linguagem.

**MAIA é a camada 2 (F3), gated.** Quando habilitada por tenant, nasce **só em modo aprovação humana**: gera rascunho de resposta ao cliente → humano aprova/edita/rejeita → sistema envia. **Independente do modo, o alerta no grupo é sempre disparado.** O **modo automático fica FORA do escopo datado** — é decisão futura (D-5), condicionada a piloto com volume real e a uma operação com mais de uma pessoa.

O banco **já possui** a maior parte da estrutura (`nps_avaliacoes`, `avaliacao_config`, `agent_drafts`, `conversations`, `whatsapp_groups`). A entrega **estende** (ALTER ADD COLUMN aditivo/reversível) — **não recria**.

**Fase de teste obrigatória na Karina Doceria** (canal oficial DataCrazy), reusando o **módulo de avaliações já integrado e testado** no CRM dela. Disparo ao **encerrar o atendimento**; mensagens de teste podem ir para o **WhatsApp pessoal do Wandson** (contato cadastrado no CRM da Karina) antes de qualquer disparo a cliente real. A CD (Evolution) só entra depois, em decisão separada.

---

## 2. Contexto e problema

- **Hoje:** existem tabelas de avaliação (CSAT `atendimento_avaliacoes` 1–5, NPS `nps_avaliacoes` 0–10) com colunas de tratativa, mas **sem captura padronizada de NPS pós-atendimento amarrando atendente + duração**, e **sem laço fechado de detrator** (ninguém é acionado em SLA quando a nota é baixa).
- **Dor:** detrator passa despercebido; não há reação rápida (service recovery); não se mede quem atendeu nem quanto tempo levou; decisão de melhoria é por "achismo".
- **Oportunidade:** NPS transacional + closed-loop reduz churn (service recovery paradox) e gera sinal operacional (atendente × duração × nota) para coaching. **A IA acelera a redação da resposta — não é o que cria o valor.**

### O que o banco já tem (descoberto — fonte da verdade)
| Objeto | Já existe | Relevância |
|---|---|---|
| `nps_avaliacoes` | ✅ | **Tabela-mestre do fluxo NPS (D-1).** NPS 0–10: `contact_identifier/nome`, `origin_conversation_id`, `nota`, `tratativa_*`, `public_token`. **Falta** atendente + tempo |
| `atendimento_avaliacoes` | ✅ | CSAT 1–5 (escala incompatível). **Fora do fluxo NPS** — não disparar junto, evita duplo-envio ao mesmo contato |
| `avaliacao_config` | ✅ | Config por tenant: `csat/nps_auto_envio`, templates, `nps_cooldown_dias`, `nome_empresa`. **Falta** bloco de detrator/MAIA/HSM. **Karina:** é aqui que mora a config do canal **DataCrazy** (credencial/flag da API oficial — confirmar coluna no BD antes da migration); presença da credencial = tenant no canal oficial |
| `agent_drafts` | ✅ | `agent_name`, `channel`, `autonomy_level`, `status`, `content`, `reviewer_id`, `metadata` → **motor do modo aprovação de MAIA** |
| `conversations` | ✅ | `started_at`, `finished_at`, `closed_at`, `close_reason`, `assigned_to`, `attending_agent_id` → **tempo de atendimento no canal CD/Evolution**. No canal **Karina/DataCrazy** o tempo vem do **objeto de conversa da API oficial** (abertura/fechamento), congelado em snapshot |
| `whatsapp_groups` | ✅ | Identificado por `evolution_jid`, `tenant_id`, `ativo`, `monitorar_inatividade`. Os ~70 grupos atuais são do tenant CD. **Piloto Karina:** alerta de detrator → grupo da Karina **se existir**; **senão, fallback de teste = WhatsApp pessoal do Wandson** (contato no CRM da Karina). Reparentar grupos (D-3) **deixa de ser bloqueante** |
| `tenant_agents` | ✅ | Habilitação de agente por tenant. **MAIA ainda não existe** aqui |

---

## 3. KPIs e métricas (com guarda contra viés)

> **Princípio (Skeptic + Critic):** NPS pós-atendimento sofre **viés de autosseleção** — quem responde tende a ser o muito satisfeito ou o muito irritado. Com baixa taxa de resposta o número vira **ruído**. Por isso **todo KPI de NPS é reportado com N e taxa de resposta**, e **"detrator detectado" ≠ "detrator que respondeu"**.

| Métrica | Definição | Meta inicial |
|---|---|---|
| Taxa de resposta | `respondidas / enviadas` | ≥ 20% (validar baseline real antes de cobrar meta) |
| **Taxa de silêncio** | `sem_resposta / enviadas` | monitorar (sinal de fadiga/risco de spam) |
| NPS | `%promotores − %detratores` **sempre com N e taxa de resposta ao lado** | só reportar com N ≥ 30 |
| Detratores **detectados** | nota 0–6 recebidas | — |
| Detratores **tratados em SLA** | tratativa concluída < 48h | ≥ 80% |
| TMA (duração) | mediana de `duracao_minutos` por atendente | baseline → coaching |
| % avaliações com atendente | `atendente preenchido / total` | ≥ 90% (mede qualidade do snapshot) |

Anti-padrão proibido: publicar "NPS = X" sem N e sem taxa de resposta. Um NPS de 5 respostas não é um NPS.

---

## 4. Benchmarking de mercado (referências)

> **Nota de leitura crítica (Pragmatist):** as plataformas enterprise abaixo operam sobre **canais oficiais / templates aprovados (HSM)** e times dedicados. O paralelo é de *paradigma*, não de stack — não dá para copiar o volume de disparo delas num número não-oficial.

| Plataforma | O que faz bem | O que CD adota |
|---|---|---|
| Medallia / Qualtrics | Closed-loop (inner/outer loop), alerta de detrator com SLA, causa-raiz | Laço fechado com SLA + alerta no grupo |
| Track.co (BR) | NPS transacional por WhatsApp, régua, dashboards PT-BR | NPS transacional pós-atendimento via WhatsApp |
| Zendesk / Intercom CSAT | Disparo pós-fechamento de ticket, vínculo com atendente | Gatilho no fechamento da conversa + snapshot do atendente |
| Reclame Aqui / playbooks de recovery | Resposta rápida e empática a detrator | MAIA modo aprovação (rascunho empático) |
| SurveyMonkey/Delighted | Cooldown anti-fadiga, opt-out | `nps_cooldown_dias` + `contact_optout` |

---

## 5. Personas

- **Wandson (CEO/operador):** quer ver detrator na hora no grupo e tratar rápido; opera sozinho → **não pode depender de IA autônoma**.
- **Atendente (humano/agente):** é medido por nota × duração; precisa de feedback justo (snapshot correto de quem atendeu).
- **Cliente final:** responde 1 toque (0–10); se detrator, recebe contato humano/assistido rápido; pode dar **opt-out (STOP/CANCELAR)**.
- **MAIA (agente IA, novo):** redige rascunho de recovery; **nunca envia sem aprovação no MVP**.

---

## 6. Escopo

**No MVP (F0–F5):**
- Captura NPS pós-atendimento com atendente + duração (snapshot).
- Disparo via WhatsApp (HSM aprovado) com cooldown e opt-out.
- Página pública de resposta (token forte).
- **Alerta de detrator no grupo (núcleo do valor).**
- Caso de tratativa manual closed-loop com SLA.
- MAIA **modo aprovação** (gated, F3, piloto com 5–10 detratores reais).
- Dashboard + relatório semanal.
- **Piloto em produção no tenant Karina Doceria via DataCrazy (API oficial).** O CRM da Karina já tem o módulo de avaliações integrado e testado — o NPS reusa esse caminho. Alerta de detrator → grupo da Karina **se existir**; **senão, fallback de teste = WhatsApp pessoal do Wandson** (contato no CRM da Karina).

**Fora do escopo datado (futuro, exige decisão):**
- **MAIA modo automático** (D-5) — depende de piloto + operação multi-pessoa.
- **Rollout na CD via Evolution API** — depende de resolver canal/política de volume (D-6). Canal não-oficial fora do escopo do piloto Karina.
- Multicanal além de WhatsApp.

---

## 7. Requisitos funcionais

### RF1 — Captura NPS com atendente + duração (snapshot)
No fechamento da conversa, gravar em `nps_avaliacoes`: `atendente_nome`, `assigned_to`, `agent_id`, `atendimento_inicio_at` (= `conversations.started_at`), `atendimento_fim_at` (= `closed_at`/`finished_at`), `duracao_minutos`, `qtd_mensagens`. **Snapshot no momento da avaliação** (não FK viva — atendente pode mudar depois). **Nulos não bloqueiam** o registro (se não houver atendente identificado, grava NULL e segue).

### RF2 — Gatilho de disparo no fechamento (idempotente)
Ao `conversations` mudar para fechado, enfileirar 1 disparo NPS **se e somente se**: `close_reason ∈` whitelist (D-4), ainda não existe avaliação para aquele `origin_conversation_id` (**índice único**), o contato não está em `contact_optout`, e o cooldown (`nps_cooldown_dias`) não foi violado. **Reabertura de conversa não re-dispara.** **Pré-requisito técnico: template HSM aprovado** (RF não pode disparar texto livre fora da janela de 24h).

### RF3 — Página pública de resposta (token forte)
Link com token aleatório (`crypto.randomBytes(32).toString('hex')`), **expira em 72h**, rate-limit 10 req/min por IP, **404 genérico** para token inválido/expirado (sem vazar se existiu), **sem PII na URL**. Registra nota + comentário opcional.

### RF4 — Alerta de detrator no grupo (NÚCLEO DO MVP)
Nota 0–6 → mensagem no grupo configurado (`detrator_wpp_jid`) com: contato, atendente, duração, nota, comentário, link do caso. **Independe da MAIA** — funciona no laço manual. Canal interno (`telegram_interno`/`painel`/grupo da equipe) → vai direto, sem aprovação.

### RF5 — Caso de tratativa closed-loop (manual)
Detrator gera caso com `tratativa_status` (aberto→em_andamento→resolvido), responsável, SLA <48h (teto 72h), histórico. Inner loop (caso individual) + visão para outer loop (causa-raiz por atendente/motivo).

### RF6 — MAIA modo aprovação (camada 2, gated — F3)
Só quando `tenant_agents` habilita MAIA E `maia_autonomy_mode='aprovacao'`. Gera `agent_drafts` (`agent_name='MAIA'`, `channel`, `autonomy_level`, `content`, `nps_avaliacao_id`) → humano aprova/edita/rejeita → sistema envia. **Guardrails de conteúdo:** sem promessa financeira/jurídica, tom empático, sem PII de terceiros, fallback se LLM falhar. **Nunca envia a cliente sem aprovação.**

### RF7 — Dashboard (Console V2)
`src/console/` (.cv2-*): NPS com N e taxa de resposta, fila de detratores, SLA, TMA por atendente, taxa de silêncio. Multi-tenant (RLS).

### RF8 — Relatório semanal
`trigger/multicanal/relatorio-semanal-atendimento.ts` (cron `0 8 * * 1`): resumo por tenant ao grupo interno. Sempre com N e taxa de resposta.

### RF9 — Multi-tenant
Tudo escopado por `tenant_id` + RLS. **Karina Doceria é o tenant do piloto** (canal **DataCrazy**, API oficial): alerta de detrator → grupo da Karina **se existir**; **senão, fallback = WhatsApp do Wandson** (contato no CRM da Karina). **D-3 (reparentar grupos) deixa de ser bloqueante** — o fallback resolve o teste. **CD/Evolution = rollout futuro**, gated por D-6.

---

## 8. Requisitos não-funcionais, legais e de segurança

- **D-6 (BLOQUEANTE só do rollout CD/Evolution — NÃO do piloto Karina):** o número **não-oficial (Evolution API)** é compartilhado com CORA/atendimento/BomDia; disparo de volume pode causar **ban da Meta** que derruba todos os fluxos no mesmo número. **Resolver canal/política de volume antes do rollout CD.** O **piloto Karina não é afetado** — usa o canal **oficial DataCrazy**, isolado dos fluxos da CD.
- **LGPD:** base legal (legítimo interesse) documentada em **LIA/RIPD** (entregável de F0). Opt-out (STOP/CANCELAR) processado ≤24h via `contact_optout`. **Retenção** ~2 anos pós-resposta + **anonimização do comentário** após o prazo.
- **Meta/WhatsApp:** respeitar **janela de 24h** e usar **template HSM aprovado** (`nps_template_hsm_id`) para iniciar conversa. Anti-spam: cooldown + opt-out + limite de volume.
- **Token (RF3):** forte, expira 72h, rate-limit, 404 genérico, sem PII na URL.
- **Secrets:** via Infisical — nunca commitar.
- **Imutabilidade/erro:** padrões CD (lazy getter de env, nunca `throw` no topo do módulo, `logAgentRun`, parar no 1º erro com output bruto).

---

## 9. Modelo de dados (ALTER aditivo/reversível — não recria)

```sql
ALTER TABLE nps_avaliacoes
  ADD COLUMN IF NOT EXISTS atendente_nome        text,
  ADD COLUMN IF NOT EXISTS assigned_to           uuid,
  ADD COLUMN IF NOT EXISTS agent_id              text,
  ADD COLUMN IF NOT EXISTS atendimento_inicio_at timestamptz,
  ADD COLUMN IF NOT EXISTS atendimento_fim_at    timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_minutos       integer,
  ADD COLUMN IF NOT EXISTS qtd_mensagens         integer;
ALTER TABLE nps_avaliacoes
  ADD CONSTRAINT nps_nota_chk    CHECK (nota IS NULL OR nota BETWEEN 0 AND 10) NOT VALID,
  ADD CONSTRAINT nps_duracao_chk CHECK (duracao_minutos IS NULL OR duracao_minutos >= 0) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS nps_uq_origin_conversation
  ON nps_avaliacoes (origin_conversation_id) WHERE origin_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nps_idx_tenant_status    ON nps_avaliacoes (tenant_id, status);
CREATE INDEX IF NOT EXISTS nps_idx_assigned_to      ON nps_avaliacoes (assigned_to);
CREATE INDEX IF NOT EXISTS nps_idx_tratativa_status ON nps_avaliacoes (tenant_id, tratativa_status);

ALTER TABLE avaliacao_config
  ADD COLUMN IF NOT EXISTS detrator_notificar     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS detrator_wpp_jid       text,
  ADD COLUMN IF NOT EXISTS detrator_msg_template  text,
  ADD COLUMN IF NOT EXISTS nps_threshold_detrator smallint DEFAULT 6,
  ADD COLUMN IF NOT EXISTS nps_template_hsm_id    text,
  ADD COLUMN IF NOT EXISTS maia_autonomy_mode     text DEFAULT 'aprovacao',
  ADD COLUMN IF NOT EXISTS maia_sla_horas         integer DEFAULT 48;
ALTER TABLE avaliacao_config
  ADD CONSTRAINT maia_autonomy_chk
    CHECK (maia_autonomy_mode IN ('aprovacao','automatico')) NOT VALID;

ALTER TABLE agent_drafts
  ADD COLUMN IF NOT EXISTS nps_avaliacao_id uuid REFERENCES nps_avaliacoes(id);
CREATE INDEX IF NOT EXISTS drafts_idx_nps_avaliacao ON agent_drafts (nps_avaliacao_id);

CREATE TABLE IF NOT EXISTS contact_optout (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  contact_identifier text NOT NULL,
  canal              text NOT NULL DEFAULT 'whatsapp',
  motivo             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contact_identifier, canal)
);
-- RLS por tenant_id em contact_optout (teste de isolamento obrigatório).
```

Notas: `CHECK ... NOT VALID` não trava linhas legadas; validar depois com `VALIDATE CONSTRAINT`. Índice único parcial garante idempotência do gatilho (RF2).

---

## 10. Arquitetura (alto nível)

```
conversations / atendimento (fechado)
   │  Karina/DataCrazy: poller datacrazy-nps-poller filtra finished === true
   │  gatilho idempotente (whitelist close_reason, sem optout, dentro do cooldown)
   ▼
Trigger.dev: nps-disparo  ──HSM──▶  canal do tenant  ──▶  cliente
   │                          (Karina: DataCrazy/API oficial · CD: Evolution, futuro)
   │ grava snapshot (atendente, duração) em nps_avaliacoes
   ▼
Página pública (token forte) ──nota/comentário──▶ nps_avaliacoes
   │
   ├─ nota 7–10 → fim
   └─ nota 0–6  → RF4 ALERTA (grupo da Karina ou WhatsApp do Wandson) + RF5 caso closed-loop (SLA)
                       │
                       └─ (F3, gated) MAIA modo aprovação → agent_drafts → humano aprova → envia
```

Bridge (:3001) expõe endpoints de página pública/caso; Trigger.dev faz disparo e (F3) geração de rascunho; Supabase é fonte primária (não depende do canal externo para ler estado).

---

## 11. Fases (manual-first)

| Fase | Entrega | Gate de saída |
|---|---|---|
| **F0 — Fundação** | Migrations §9 + `contact_optout` + **LIA/RIPD** + confirmar **canal DataCrazy da Karina** | SQL aplicado (output bruto) + canal DataCrazy da Karina confirmado |
| **F1 — Captura + disparo** | Snapshot atendente/duração + gatilho idempotente + **HSM aprovado** + opt-out | disparo só com HSM; idempotência provada |
| **F2 — Alerta + caso (núcleo)** | RF4 alerta no grupo + RF5 caso manual closed-loop | **teste no grupo da Karina (ou WhatsApp do Wandson como fallback)** ok |
| **F3 — MAIA aprovação (gated)** | RF6 modo aprovação + guardrails | **piloto com 5–10 detratores reais** aprovados por humano |
| **F4 — Dashboard/Relatório** | RF7 + RF8 | KPIs com N + taxa de resposta visíveis |
| **F5 — Piloto em produção (Karina) via DataCrazy** | rollout tenant Karina (canal oficial) | métricas estáveis |
| **Futuro (sem data)** | Rollout CD/Evolution (após D-6) · MAIA automático (após D-5) | decisão explícita do Wandson |

Cada fase: branch própria, output bruto, parar no 1º erro. Nada de tela pulada em silêncio.

---

## 12. Riscos

| Risco | Sev | Mitigação |
|---|---|---|
| Ban da Meta no número não-oficial (derruba CORA/atendimento/BomDia) | **CRÍTICO** | D-6 antes do rollout CD/Evolution (só no rollout CD; piloto Karina usa canal oficial DataCrazy, isolado) |
| NPS vira ruído por baixa resposta | Alto | KPI sempre com N + taxa de resposta; separar detectado×respondido |
| Vazamento entre tenants | Alto | piloto isolado na Karina (RLS + teste de isolamento); alerta → grupo da Karina ou WhatsApp do Wandson (fallback) |
| Gatilho dispara duplicado / em reabertura | Alto | índice único parcial + whitelist close_reason |
| IA responde mal a cliente irritado | Alto | modo aprovação obrigatório; modo automático fora do escopo |
| Snapshot de atendente errado | Médio | gravar no momento da avaliação, nulo não bloqueia |
| LGPD/opt-out | Médio | LIA/RIPD + `contact_optout` ≤24h + retenção/anonimização |

---

## 13. Decisões

| # | Decisão | Status |
|---|---|---|
| D-1 | Tabela-mestre do fluxo NPS = `nps_avaliacoes` (CSAT `atendimento_avaliacoes` fora do fluxo; escalas 0–10 vs 1–5 incompatíveis; evita duplo-disparo) | ✅ **FECHADA** |
| D-2 | Tempo de atendimento via `conversations` (sem Datacrazy) | ✅ **FECHADA** |
| D-3 | Reparentar grupos WhatsApp da Karina (hoje todos são do tenant CD) | 🟡 **não-bloqueante** — fallback de teste = WhatsApp do Wandson (contato no CRM da Karina) |
| D-4 | Whitelist de `close_reason` que dispara NPS | 🔓 aberta — **Wandson** |
| D-5 | Promover MAIA a modo automático | 🔓 aberta — council recomenda **manter aprovação como estado estável** |
| D-6 | Canal/política de volume (número não-oficial) | 🔓 **BLOQUEANTE só do rollout CD/Evolution** (não do piloto Karina/DataCrazy) — **Wandson** |

---

## 14. Critérios de aceite (mensuráveis)

- [ ] Migrations §9 aplicadas (output bruto do SQL).
- [ ] Avaliação grava atendente + duração corretos em ≥90% dos casos (snapshot).
- [ ] Gatilho não duplica (prova: 2 fechamentos da mesma conversa → 1 avaliação).
- [ ] Disparo só ocorre com HSM aprovado e respeitando opt-out + cooldown.
- [ ] Token da página pública: inválido/expirado → 404 genérico; rate-limit ativo.
- [ ] Detrator (0–6) gera alerta no grupo + caso com SLA em <48h.
- [ ] MAIA (F3) nunca envia sem aprovação; piloto com 5–10 detratores reais.
- [ ] Dashboard mostra NPS **com N e taxa de resposta** + taxa de silêncio.
- [ ] Teste no grupo da Karina (ou WhatsApp pessoal do Wandson como fallback) concluído antes de cliente real.
- [ ] Piloto roda na Karina via DataCrazy (API oficial); rollout CD/Evolution só após D-6.

---

## 15. Rastreabilidade da revisão adversarial (6 lentes)

| Lente | Contribuição incorporada |
|---|---|
| **cd-raven** (advogado do diabo) | Gatilho de fechamento blindado (idempotência, whitelist, reabertura); manual-first |
| **database-reviewer** | Índice único parcial, CHECK NOT VALID, snapshot vs FK viva, índices de tenant/status |
| **security-reviewer** | Token forte/expiração/rate-limit/404 genérico; sem PII na URL; RLS em `contact_optout` |
| **Skeptic** (council) | Viés de autosseleção; "o valor não é a IA, é o laço"; D-1 a favor de `nps_avaliacoes` |
| **Pragmatist** (council) | Benchmark enterprise opera em canal oficial/HSM; cortar disparo Karina do MVP |
| **Critic** (council) | Risco de ban (D-6); IA respondendo cliente irritado → modo automático fora do escopo |
