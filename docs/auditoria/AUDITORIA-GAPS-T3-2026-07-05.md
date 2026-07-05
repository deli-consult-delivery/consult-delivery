# Auditoria — GAPs 1-8 do T3 contra `main` (Semana 1 · C1 do Plano de Continuidade)

Data: 2026-07-05 | Branch: `wandson/auditoria-gaps-t3` | Base: `main` (sha do fetch nesta sessão)

Método: leitura direta do código-fonte de cada tela em `src/console/*.jsx`, confirmação de
import + wiring em `src/console/ConsoleV2.jsx` (switch de telas) e em `src/console/moduleCatalog.js`
(menu real, fonte de verdade), e `git log --oneline --diff-filter=A` para achar o commit/PR de
criação de cada arquivo. **Nenhuma query rodou contra o banco de produção nesta sessão** — os
SELECTs de verificação estão na seção final para a orquestradora rodar via MCP.

---

## Tabela-resumo

| GAP | Veredito | Evidência-chave | O que resta |
|-----|----------|------------------|--------------|
| **GAP-1** — toggle agente/tenant | ✅ **FECHADO** | `PainelAgentes.jsx` (commit `f0ce025`, PR #199), roteado em `moduleCatalog.js:44` (`catalogo`) e `ConsoleV2.jsx:771`. Toggle real: insert/delete em `tenant_agents`. | — |
| **GAP-2** — config completo (modo/provider/custo) | 🔧 **PARCIAL** | `AgenteConfig.jsx` (commit `5ddf970`, PR #216), roteado `moduleCatalog.js:66` (`config`)/`ConsoleV2.jsx:788`. Modo humano/híbrido/IA via `tenant_agent_config.modo_override` ✅. | **Provider**: só leitura (`Provedores` em `CvNovas.jsx:448`, tela read-only de `tenant_provedores`, sem editor). **Limite de custo**: não existe em nenhuma UI nem coluna dedicada — só o jsonb livre `tenant_agent_config.config`/`tenant_agents.config`, não exposto. Duas tabelas de config em paralelo (`tenant_agents.config` vs `tenant_agent_config`) não unificadas. |
| **GAP-3** — fila única de aprovações | 🔧 **PARCIAL** | `AprovacoesUnificadas.jsx` (commit `f00b973`, PR #205), roteado `moduleCatalog.js:17` (`aprovacoes`)/`ConsoleV2.jsx:750`. Funde `agent_drafts` + `defesa_casos` num só painel. | **Sugestões da MIA não entram na fila** (MIA só expõe contagem `sugestoes_geradas` em `MiaAudit.jsx`, sem itens acionáveis). `AgentInbox.jsx` continua **item de menu separado** (`inbox`) — mas é um board de tickets via bridge API (`/agent-tickets`, status open/in_progress/blocked/review), não uma fila de aprovação, então correto ficar fora. As telas antigas `ApprovalsScreen.jsx`/`DraftsPendentesScreen.jsx`/`AgentInboxScreen.jsx`/`SugestaoModal.jsx` (em `src/screens/` e `src/components/`) estão **órfãs** (não importadas em nenhum lugar do Console v2 atual) — candidatas a remoção. |
| **GAP-4** — custos agregados | ✅ **FECHADO** (com ressalva) | `CustosIA.jsx` (commit `537b503`, PR #198), roteado `moduleCatalog.js:73` (`custos`)/`ConsoleV2.jsx:793`. Agrega `agent_runs.cost_usd` por agente e por dia (30d), com alerta de pico (>2x média). | Agregação é **client-side sobre `limit(1000)`** — subestima custo em tenant com >1000 runs/30d. Widget de créditos da sidebar (`ConsoleV2.jsx:668`, `creditosTxt`/`CREDITOS_MES`) ainda conta **execuções brutas**, não foi evoluído para refletir `cost_usd` da tela nova. |
| **GAP-5** — Skills (lista+editor) | 🔧 **PARCIAL** | `Habilidades.jsx` (commit `66f132a`, #217), roteado `moduleCatalog.js:52` (`habilidades`)/`ConsoleV2.jsx:773`. Lê/escreve `agent_skills` (globais `tenant_id IS NULL` + por-tenant). | Só **cria** (insert) — não há update/delete de habilidade existente. "Editor" do GOAL do T3 não está completo (falta editar/apagar). |
| **GAP-6** — Audit log viewer | ✅ **FECHADO** | `AuditLog.jsx` (commit `5ddf970`, #216), roteado `moduleCatalog.js:88` (`auditoria`)/`ConsoleV2.jsx:804`. Lê `audit_log` (quem/quê/quando/IP), filtro por texto de ação. | Filtro é só por texto da coluna `action` — sem filtro por usuário/agente ou intervalo de data (o T3 pedia "filtros", plural). |
| **GAP-7** — UI `user_agent_access` | ✅ **FECHADO** | `AcessoUsuarios.jsx` (commit `5ddf970`, #216), roteado `moduleCatalog.js:87` (`acesso`)/`ConsoleV2.jsx:803`. Grants `can_invoke`/`can_view_history`/`can_approve_drafts` por usuário×agente, upsert em `user_agent_access`. | — |
| **GAP-8** — Templates (mensagens/ofertas) | 🔧 **PARCIAL** | `Templates.jsx` (commit `66f132a`, #217), roteado `moduleCatalog.js:65` (`modelos`)/`ConsoleV2.jsx:787`. Lê/escreve `templates` (tipo `mensagem`/`oferta`). | Mesmo padrão do GAP-5: só **cria**, sem editar/apagar template existente. |

**Placar:** 4 ✅ FECHADO (GAP-1, GAP-4, GAP-6, GAP-7) · 4 🔧 PARCIAL (GAP-2, GAP-3, GAP-5, GAP-8) · 0 ❌ ABERTO.

O T3 v1 (2026-06-06) listava os 8 como gap total; sessões 16-17 (2026-06-08, PRs #215-#218) e a sessão
que criou `AprovacoesUnificadas`/`CustosIA`/`PainelAgentes` fecharam a maior parte. **Nenhum GAP está
0% construído** — a lacuna real hoje é "lista sem editor" (GAP-5/8) e "faltam campos" (GAP-2), não
"tela inexistente".

---

## Evidência bruta por GAP

### GAP-1 — Toggle de habilitação de agentes por tenant
```
$ git log --oneline --diff-filter=A -- src/console/PainelAgentes.jsx
f0ce025 feat(telas/T2): PainelAgentes — GAP-1 toggle + GAP-2 config por agente
```
- `src/console/moduleCatalog.js:44` → `{ id: 'catalogo', ic: 'i-box', label: 'Catálogo' }` (grupo "Agentes IA")
- `src/console/ConsoleV2.jsx:771` → `case 'catalogo': return <PainelAgentes tenantDbId={tenantDbId} />;`
- `src/console/ConsoleV2.jsx:9` → `import PainelAgentes from './PainelAgentes.jsx';`
- Tabelas: `agents` (catálogo global), `tenant_agents` (toggle — `insert`/`delete` em `toggleAgente()`, linha 162-184), `agent_runs` (custo 30d agregado client-side, `PainelAgentes.jsx:130`).
- Toggle real, sem mock: `PainelAgentes.jsx:166` (`.delete().eq('tenant_id',...).eq('agent_id',...)`) e `:171` (`.upsert(...)`).

### GAP-2 — Agente config completo
```
$ git log --oneline --diff-filter=A -- src/console/AgenteConfig.jsx
5ddf970 feat(console): GAP-2/6/7 telas (#216)
```
- `src/console/moduleCatalog.js:66` → `{ id: 'config', ic: 'i-gear', label: 'Config de Agentes' }`
- `src/console/ConsoleV2.jsx:788` → `case 'config': return <AgenteConfig tenantDbId={tenantDbId} />;`
- Tabela: `tenant_agent_config` (schema em `supabase/migrations/20260512_004_create_tenant_agent_config.sql`) — colunas `modo_override` (CHECK `humano|hibrido|ia`), `enabled`, `config jsonb`. **Não existe coluna dedicada para provider nem limite de custo** — só o jsonb livre, não lido/escrito por nenhuma tela.
- `AgenteConfig.jsx:10-14` → 3 botões de modo (Humano/Híbrido/IA) + toggle liga/desliga, `upsert` em `tenant_agent_config` (linha 40-45).
- Complemento parcial em `PainelAgentes.jsx` (`ConfigPanel`, linhas 44-107): permite escolher `custom_model` (lista fixa de 6 modelos hardcoded, não "provider" no sentido de D1 multi-provider) e `custom_max_tokens` — mas isso é gravado em `tenant_agents.config` (jsonb), tabela diferente de `tenant_agent_config`. **Duas tabelas com propósito sobreposto e nenhuma delas modela custo em US$/mês.**
- Tela "Provedores de IA" (`src/console/CvNovas.jsx:448-462`, roteada em `ConsoleV2.jsx:799` como `case 'provedores'`) é **somente leitura** (`Tela` read-only), lê `tenant_provedores` mas não tem formulário de edição — confirma que "provider editável" não está implementado em lugar nenhum.

### GAP-3 — Fila única de aprovações
```
$ git log --oneline --diff-filter=A -- src/console/AprovacoesUnificadas.jsx
f00b973 feat(telas/T4): AprovacoesUnificadas — GAP-3 fila unificada (drafts + defesa)
```
Mergeado via PR #205 (`5207ae0 Merge pull request #205 from .../feat/telas-t4-aprovacoes`).
- `src/console/moduleCatalog.js:17` → `{ id: 'aprovacoes', ic: 'i-check', label: 'Aprovações' }` (grupo "Operação")
- `src/console/ConsoleV2.jsx:750` → `case 'aprovacoes': return <AprovacoesUnificadas tenantDbId={tenantDbId} userId={userId} />;`
- Tabelas: `agent_drafts` (status `pending`/`aguardando_ok`/`rascunho`, linhas 189-196) + `defesa_casos` (status `aguardando_ok`, linhas 197-203) — fetch paralelo (`Promise.all`), merge visual em duas seções.
- **Sugestões MIA não entram**: `grep -i "sugest" src/console/MiaAudit.jsx` só acha `sugestoes_geradas` (contador numérico agregado, `MiaAudit.jsx:66,96,146-147`) — não há itens individuais acionáveis de MIA para aprovar/rejeitar.
- `AgentInbox.jsx` (roteado em `ConsoleV2.jsx:780`, menu `inbox` "Inbox dos Agentes") é um **board de tarefas** (`STATUS_WORKFLOW = ['open','in_progress','blocked','review','resolved','closed']`, `AgentInbox.jsx:24`) — conceito diferente de aprovação, correto continuar separado.
- Telas legadas confirmadas **órfãs** (não aparecem em nenhum import de `src/console/`):
  ```
  $ grep -rl "ApprovalsScreen\|DraftsPendentesScreen\|AgentInboxScreen\|SugestaoModal" src/
  src/screens/DraftsPendentesScreen.jsx
  src/screens/ApprovalsScreen.jsx
  src/screens/AgentInboxScreen.jsx
  src/components/SugestaoModal.jsx
  ```
  (cada um só referencia a si próprio — nenhum é importado por `ConsoleV2.jsx` ou por outro arquivo ativo). `SugestaoModal.jsx` além disso é conceitualmente outra coisa: "sugestão para o desenvolvedor" (feedback de UX), não sugestão de conteúdo da MIA — o nome no T3 induziu a confusão.

### GAP-4 — Custos agregados
```
$ git log --oneline --diff-filter=A -- src/console/CustosIA.jsx
537b503 feat(telas/T1): CustosIA — custos por agente/dia/tenant, 30d, alerta de pico
```
Mergeado via PR #198 (`7998280 Merge pull request #198 from .../feat/telas-t1-custos`). Widget de créditos
da sidebar (`ConsoleV2.jsx:668`, `creditosTxt`/`CREDITOS_MES`) segue contando execuções brutas — não foi
atualizado para consumir `cost_usd` desta tela.
- `src/console/moduleCatalog.js:73` → `{ id: 'custos', ic: 'i-dollar', label: 'Custos de IA' }` (grupo "Dados")
- `src/console/ConsoleV2.jsx:793` → `case 'custos': return <CustosIA tenantDbId={tenantDbId} />;`
- Tabela: `agent_runs` — `select('agent_id, cost_usd, created_at, status')` com `limit(1000)`/30d (`CustosIA.jsx:42-47`), agregação client-side por agente (linhas 76-83) e por dia (linhas 86-98), alerta de pico (`custo > 2x média diária`, linha 97-98).
- KPIs: custo total, execuções, custo médio/run, média diária (linhas 141-161).

### GAP-5 — Skills
```
$ git log --oneline --diff-filter=A -- src/console/Habilidades.jsx
66f132a feat(console): GAP-5 Habilidades + GAP-8 Templates (#217)
```
- `src/console/moduleCatalog.js:52` → `{ id: 'habilidades', ic: 'i-zap', label: 'Habilidades' }` (grupo "Agentes IA")
- `src/console/ConsoleV2.jsx:773` → `case 'habilidades': return <Habilidades tenantDbId={tenantDbId} userId={userId} />;`
- Tabela: `agent_skills` (migration `supabase/migrations/20260608_009_skills_templates.sql`) — `.or('tenant_id.is.null,tenant_id.eq.<tenant>')` (linha 23) separa globais de por-tenant; badge "global"/"sua" (linha 57).
- **Só tem `criar()` (insert, linhas 30-39)** — não há função de update/delete no arquivo (confirmado por leitura integral, 66 linhas). Lista + criação existe; "editor" (editar depois de criado) não.

### GAP-6 — Audit log
```
$ git log --oneline --diff-filter=A -- src/console/AuditLog.jsx
5ddf970 feat(console): GAP-2/6/7 telas (#216)
```
- `src/console/moduleCatalog.js:88` → `{ id: 'auditoria', ic: 'i-scroll', label: 'Auditoria' }` (grupo "Sistema")
- `src/console/ConsoleV2.jsx:804` → `case 'auditoria': return <AuditLog tenantDbId={tenantDbId} />;`
- Tabela: `audit_log` — `select('id, user_id, agent_name, action, resource, ip_address, created_at, metadata')`, filtro `.ilike('action', ...)` (linhas 16-19), `limit(200)`.
- Colunas exibidas: quando, ação, recurso, agente/usuário, IP — bate com o pedido do T3 ("quem/quê/quando/IP"). Filtro é só texto de ação — sem filtro por usuário ou intervalo de datas.

### GAP-7 — Acesso a agentes por usuário
```
$ git log --oneline --diff-filter=A -- src/console/AcessoUsuarios.jsx
5ddf970 feat(console): GAP-2/6/7 telas (#216)
```
- `src/console/moduleCatalog.js:87` → `{ id: 'acesso', ic: 'i-key', label: 'Acesso por usuário' }` (grupo "Sistema")
- `src/console/ConsoleV2.jsx:803` → `case 'acesso': return <AcessoUsuarios tenantDbId={tenantDbId} />;`
- Tabela: `user_agent_access` (`can_invoke`, `can_view_history`, `can_approve_drafts`) — seletor de usuário (`tenant_members`) × grid de agentes habilitados (`tenant_agents`), toggle por célula com `upsert` (linhas 42-54, `onConflict: 'user_id,agent_id'`).

### GAP-8 — Templates
```
$ git log --oneline --diff-filter=A -- src/console/Templates.jsx
66f132a feat(console): GAP-5 Habilidades + GAP-8 Templates (#217)
```
- `src/console/moduleCatalog.js:65` → `{ id: 'modelos', ic: 'i-doc', label: 'Modelos' }` (grupo "Agentes IA")
- `src/console/ConsoleV2.jsx:787` → `case 'modelos': return <Templates tenantDbId={tenantDbId} userId={userId} />;`
- Tabela: `templates` (mesma migration `20260608_009_skills_templates.sql`) — campo `tipo` (`mensagem`/`oferta`, seguindo Brand Guard "oferta" não "promoção", comentário linha 6).
- Mesmo padrão do GAP-5: **só `criar()` (insert, linhas 29-38)** — sem editar/apagar template existente.

---

## Priorização do que resta

Conforme esperado pelo Plano de Continuidade (§4 Frente C), o foco real está em **GAP-3** e **GAP-4** —
mas a auditoria mostra que **GAP-4 já está fechado**. A priorização recomendada, do maior para o menor
impacto:

1. **GAP-3 (parcial → fechar):** decidir se "sugestões da MIA" viram itens acionáveis de verdade (exigiria
   schema novo — MIA hoje só conta, não propõe ação individual) ou se o escopo do GAP-3 deve ser
   redefinido para "drafts + defesa" (já entregue) — reduz o gap para 0 sem código novo, só decisão.
2. **GAP-2 (parcial):** decidir se "provider" e "limite de custo" por agente entram nesta fase ou ficam
   para quando D1 (multi-provider) for implementado de fato — hoje `tenant_provedores` é só decorativo
   (read-only, sem client multi-provider por trás).
3. **GAP-5 e GAP-8 (parcial, mesmo padrão):** adicionar update/delete em `Habilidades.jsx` e
   `Templates.jsx` — menor esforço da lista, é CRUD que falta só o "U" e o "D" (schema e insert já existem).
4. **Limpeza:** remover `src/screens/ApprovalsScreen.jsx`, `DraftsPendentesScreen.jsx`,
   `AgentInboxScreen.jsx`, `src/components/SugestaoModal.jsx` (órfãos, confirmados sem import) — reduz
   confusão em auditorias futuras.

---

## SQL de verificação em produção

Bloco único, read-only, numerado por GAP — para a orquestradora rodar via MCP Supabase e colar o
output bruto de volta neste documento antes do merge.

```sql
-- GAP-1: tenant_agents (toggle habilitado por tenant) tem linhas reais?
select count(*) as total_habilitacoes, count(distinct tenant_id) as tenants_com_agente
from tenant_agents;

-- GAP-2: tenant_agent_config tem overrides de modo gravados?
select modo_override, count(*) as qtd
from tenant_agent_config
group by modo_override
order by qtd desc;

-- GAP-3: fila de aprovação tem volume real (drafts pendentes + defesa aguardando)?
select
  (select count(*) from agent_drafts where status in ('pending','aguardando_ok','rascunho')) as drafts_pendentes,
  (select count(*) from defesa_casos where status = 'aguardando_ok') as defesa_pendente;

-- GAP-4: agent_runs.cost_usd tem dados suficientes para os agregados da tela?
select count(*) as total_runs, count(cost_usd) as runs_com_custo, sum(cost_usd) as custo_total_usd
from agent_runs;

-- GAP-5: agent_skills — quantas globais (tenant_id null) vs por-tenant?
select (tenant_id is null) as e_global, count(*) as qtd
from agent_skills
group by e_global;

-- GAP-6: audit_log tem volume e cobre múltiplos tenants?
select count(*) as total_eventos, count(distinct tenant_id) as tenants_com_log,
       min(created_at) as mais_antigo, max(created_at) as mais_recente
from audit_log;

-- GAP-7: user_agent_access tem grants reais configurados?
select count(*) as total_grants, count(distinct user_id) as usuarios_com_grant,
       sum(can_invoke::int) as podem_invocar, sum(can_approve_drafts::int) as podem_aprovar
from user_agent_access;

-- GAP-8: templates — quantos de cada tipo, por tenant?
select tipo, count(*) as qtd, count(distinct tenant_id) as tenants
from templates
group by tipo;
```
