# PLANO DE CONTINUIDADE DA PLATAFORMA — Consult Delivery
## Reconciliado com o estado real de 04/07/2026 (Tracker + RESTRUCTURE v1.2 + T3 v1)
### Preparado por Claude (claude.ai) para Wandson Silva | Handoff: Claude Code / Cowork

---

## 0. PREMISSAS (o que o diagnóstico de julho estabeleceu)

1. **RESTRUCTURE v1.2 é lei** e está majoritariamente executado: Fase 0 ✅, CORA/BRENO/SOFIA/VERA ✅,
   Console v2 único ✅, multi-tenant Rota B ✅, loop AI-First (FASES 1-4) ✅ em código.
2. **Agente GESTOR em produção**: coleta diária 22h (Trigger.dev, `GESTOR_COLETA_ATIVA=true`),
   14 lojas validadas, `loja_metricas` com dados reais. Dashboard v1 (`GestorDashboard.jsx`).
3. **Validação Claude-first em curso no Cowork**: skill `coleta-kpis-matinal` coleta o
   Desempenho COMPLETO (7 abas, ~110 métricas/loja) em tabelas `val_*` de staging.
4. **iFood API oficial**: portal de dev + app de teste prontos; CNAE ok. Nenhuma linha de
   integração oficial no repo — tudo é browser (portal-worker). Homologação = app funcional
   + teste técnico com analista (não é pitch).
5. Governança vigente: mandato D5 v2, SQL aprovado antes de aplicar, branch+PR sempre,
   output bruto, doc autoritativo vence memória.

---

## 1. RECONCILIAÇÃO DA COLETA (decisão estruturante — evita dois coletores concorrentes)

**Estado:** GESTOR (plataforma, 22h, 4 KPIs básicos em `loja_metricas`) × Skill Cowork
(validação, sob demanda, 7 abas completas em `val_desempenho_coleta`).

**Proposta (F3 do GESTOR):**
1. A skill continua como **laboratório**: valida dicionário de métricas, seletores, bugs do
   portal (ex.: seletor da Logística que não recarrega) e thresholds do semáforo.
2. Ao fim da validação (1-2 semanas), o **dicionário validado vira spec** e o
   `ifood-portal-worker/run-metricas.js` é expandido para coletar o Desempenho completo
   (as 7 URLs `?period=YESTERDAY` já mapeadas) na coleta oficial (10h00).
3. Persistência de produção: **formato longo em `radar_series`** (fonte/métrica/série já
   existem no RADAR) + resumo em `loja_metricas` (compatibilidade com o Dashboard atual).
4. Tabelas `val_*` são aposentadas após a migração (staging cumpriu o papel).
5. Semáforo da DELI: regras calibradas na validação viram código no orquestrador
   (heartbeats já criam tasks — reusar o caminho `orchestrator-5min.ts`/`client_tasks`).

**Horário (DECISÃO TRAVADA 04/07/2026):** a coleta oficial muda de 22h para **10h00
America/Sao_Paulo** (cron `0 10 * * *`) com filtro **"Ontem"** — o dia iFood fecha às 04h59,
então às 10h o dia anterior está completo e consistente com a validação do Cowork. Na
convergência F3, o cron das 22h é reprogramado para 10h e a rotina matinal manual do Cowork
é aposentada. Atualizar `trigger/gestor/coleta-diaria.ts` (schedule) e a memória
`gestor-login-portal-ifood` com o novo horário.

---

## 2. FRENTE A — HOMOLOGAÇÃO iFOOD (API OFICIAL) — a frente nova de verdade

**Objetivo:** substituir gradualmente a coleta via navegador pela API oficial (estável, sem
sessão/portal), habilitar o produto para revenda e passar na homologação técnica.

### A1. Módulos (leitura primeiro, Order fora do MVP — DECISÃO TRAVADA)
| Módulo | Substitui / habilita | Risco homolog. |
|---|---|---|
| **Merchant** | status da loja (aberta/fechada), interrupções | baixo |
| **Review** | coleta de avaliações (aposenta a via browser) + resposta a avaliações | baixo |
| **Financial/Sales** | faturamento, conciliação, repasses | baixo-médio |
| **Catalog/Item** | itens pausados, cardápio | baixo-médio |
| Order/Events | pedidos em tempo real (polling 30s) | ALTO — Fase 2+, só se virar gestor de pedidos |

### A2. Arquitetura (respeita a stack: sem serviço novo)
```
Trigger.dev (cron/tasks)  ─┐
                           ├→ bridge-server/lib/ifood-api.js (client oficial: OAuth2,
Console v2 (telas)  ───────┘   rate-limit, retry, refresh de token só ao expirar)
                                 ↓
                    Supabase: ifood_merchants (existe) + reviews + loja_metricas/radar_series
```
- Credenciais no Infisical; token cacheado; NUNCA no front.
- Feature flag por loja: `lojas.fonte_dados = 'portal' | 'api'` → migração gradual,
  loja a loja, com dupla-checagem (API × browser) na transição.

### A3. Etapas
1. **Sandbox** (app de teste já existe): client OAuth2 + Merchant + Review no ambiente de teste
2. **Review em produção paralela**: API coleta avaliações da(s) loja(s) piloto e compara com a
   via browser (mesmos dados? → corta o browser para avaliações)
3. **Financial + Catalog**: alimentam `loja_metricas`/`radar_series` (convergindo com a F3 da coleta)
4. **App de produção + homologação técnica** (agendar só com tudo funcional; reprova = 15 dias)
5. **Dossiê em paralelo** (não bloqueia, mas sustenta): fluxo e retenção de dados, LGPD
   (bases legais, direitos do titular, DPO), política de segurança (Infisical, RLS, audit_log,
   RBAC), termos de uso e política de privacidade da plataforma — também servem ao SaaS/white-label

### A4. Critério de aceite da Frente A
- Loja piloto 100% na API (status + avaliações + financeiro + pausados) sem browser
- Divergência API×browser < 1% por 7 dias
- Dossiê revisado pelo Wandson
- Homologação agendada apenas após checklist interno 100%

---

## 3. FRENTE B — ESTRUTURAÇÃO (banco · código · front AI-first)

### B1. Banco — squash em baseline
- 240+ migrations → gerar `00000000000000_baseline.sql` (schema dump do prod) + reset do
  histórico local. Pré-requisitos: backup completo + snapshot + janela sem deploy.
- Regra pós-squash: migrations novas continuam versionadas (princípio 3 do RESTRUCTURE).
- Ganho: onboarding de ambiente/branch em segundos; fim da arqueologia de fixes.

### B2. Front — completar a era Console v2 (não "adotar Tailwind")
- O design system real do produto é `console.css` (claro) + protótipo `console-v2.html`.
  **DECISÃO TRAVADA:** oficializar console.css como DS e atualizar o CLAUDE.md (semana 3).
- Telas LEGADO ainda embarcadas no cv2: portar para o claro sob demanda (padrão sessões 19-25).
- `data.js` (46KB de resíduo mock): remoção final (CRM já migrou p/ dados reais — PR #268).
- Monolitos (>40KB): quebrar SOMENTE quando a feature tocar neles (decisão validada:
  ChatScreen "maduro — não tocar").
- TS gradual: todo módulo novo em TS; conversões oportunistas.

### B3. Higienização de dados (pendências registradas)
- Tabela `lojas`: 1.177 linhas com contatos WhatsApp misturados → separar `contatos` de
  `lojas` reais (migration com aprovação; NÃO destrutiva: mover, não deletar).
- Aplicar limpezas gated pendentes do mandato noturno (DELETEs aguardando revisão).

---

## 4. FRENTE C — TERMINAR TELAS (GAPs + QA de produção)

1. **Auditoria de fechamento dos GAPs 1-8** (T3 v1): sessões 16-17 implementaram GAP-2/5/6/7/8
   e white-label — verificar um a um contra produção (output bruto) e marcar o que resta.
   Foco esperado: GAP-3 (fila ÚNICA de aprovações — hoje 4 superfícies) e GAP-4 (Custos
   agregados de `agent_runs.cost_usd`).
2. **QA de produção guiado por uso**: roteiro por tela do menu cv2 (dado real → ação → estado
   vazio → erro), priorizando o caminho do cliente pagante (Visão/CSAT/NPS — Karina) e o
   caminho de venda (Defesa Comercial R$147, D6).
3. **Pendências "⚠️ do Wandson" acumuladas no Tracker**: consolidar numa lista única e queimar
   (testes visuais, envio real de avaliações, 4 segredos do AI-First, claudedev).

---

## 5. SEQUÊNCIA TRAVADA (estruturação primeiro — decisão Wandson 04/07)

| Semana | Trilha principal | Trilha de manutenção |
|---|---|---|
| 1 | **B1: backup + squash baseline** (runbook + SQL aprovado antes) | C1: auditoria dos GAPs 1-8 |
| 2 | **B3: higienização `lojas`/contatos** (mover, não deletar) | C2: QA telas (rota do cliente pagante) |
| 3 | **B2: data.js out + legados→claro + console.css oficializado no CLAUDE.md** | C3: queimar pendências ⚠️ do Tracker |
| 4 | **A1-A2: client OAuth2 + Merchant/Review no sandbox** | Convergência F3: Desempenho completo na coleta das 10h (spec da skill validada) |
| 5 | **A2-A3: Review em paralelo na loja piloto + Financial/Catalog** | Dossiê iFood (LGPD/segurança/termos) |
| 6 | **A3-A4: migração gradual das 14 lojas (flag por loja) + checklist → agendar homologação** | — |

Paralelo contínuo: validação da coleta no Cowork (Wandson) alimentando a F3 da semana 4.

---

## 6. DECISÕES TRAVADAS (Wandson, 04/07/2026)

1. ✅ **Sequência**: estruturação primeiro (semanas 1-3), API iFood depois (semanas 4-6)
2. ✅ **Coleta oficial**: 10h00 America/Sao_Paulo com filtro "Ontem" (substitui 22h e 09h)
3. ✅ **Módulos iFood MVP**: Merchant + Review + Financial + Catalog (Order fora do MVP)
4. ✅ **Design system**: console.css claro oficializado (atualizar CLAUDE.md na semana 3)
5. ✅ **Janela do squash (B1)**: **domingo, 05/07/2026** — dia sem deploys. Ordem obrigatória:
   backup completo → snapshot → runbook apresentado → **SQL aprovado pelo Wandson** → aplicar
   → validação em banco zerado → rollback documentado no mesmo PR.

---

## 7. HANDOFF

```
Branches:
  wandson/squash-baseline             (Semana 1 — SQL aprovado antes, backup obrigatório)
  wandson/auditoria-gaps-t3           (Semana 1, manutenção — docs + verificação)
  wandson/higienizacao-lojas          (Semana 2)
  feature/ifood-api/sandbox-oauth     (Semana 4)
Protocolo: CLAUDE.md + Tracker (ler antes, atualizar depois) · D5 v2 · output bruto
Primeiro comando sugerido (Claude Code):
  "Leia RESTRUCTURE.md, o Tracker e docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md.
   Execute a semana 1:
   (1) gere o RUNBOOK do squash baseline (backup completo, snapshot, baseline.sql do prod,
   validação em banco zerado, plano de rollback) e me apresente o SQL ANTES de aplicar;
   (2) em paralelo, audite os GAPs 1-8 do T3 contra produção com output bruto."
```
