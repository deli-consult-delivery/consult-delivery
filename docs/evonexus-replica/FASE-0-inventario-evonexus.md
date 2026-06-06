# FASE 0 — Inventário Técnico EvoNexus

**Produzido em:** 2026-06-06  
**Branch:** `wandson/evonexus-fase0`  
**Propósito:** Inventário read-only do EvoNexus para subsidiar a FASE 1 (mapeamento multi-tenant) e a decisão fork A vs B em `agents`.  
**Fontes:**
- Lab `/root/cd-evonexus-lab/` (agentes + skills)  
- Container `8ff65637fbfb` (`evo-nexus_dashboard:v0.33.0`) via `docker exec` read-only  
- `docs/inventario-tecnico-evonexus.md` (inventário canônico produzido em 2026-06-03 via leitura direta do container)  
**Disciplina:** read-only. Cada afirmação tem arquivo:linha ou output de comando.

---

## 0. Localização dos Artefatos

```
/root/cd-evonexus-lab/           ← lab de estudo (bind-mount parcial do container)
├── agents/                      ← 40 arquivos .md (agentes core + custom)
├── skills/                      ← ~200 diretórios com SKILL.md
├── plans/                       ← planos de trabalho (delivery, development)
└── docs/
    └── inventario-tecnico-evonexus.md  ← inventário canônico completo (2026-06-03)

Container 8ff65637fbfb (evo-nexus_dashboard:v0.33.0) — host /root/recovery/:
├── dashboard/data/evonexus.db   ← SQLite (21 tabelas)
├── ADWs/runner.py               ← core runner (batch path)
└── dashboard/terminal-server/src/chat-bridge.js  ← chat path
```

**DB:** Não há `.db` no lab — está no container. Esquema levantado via `models.py` na sessão 2026-06-03. Container ainda rodando (`docker ps` confirmado 2026-06-06: `Up 3 days (healthy)`).

---

## 1. Entidades File-Based (Camada CORE)

### 1.1 Agentes

**Localização:** `.claude/agents/{name}.md` (no container: `/workspace/.claude/agents/`)  
**No lab:** `/root/cd-evonexus-lab/agents/` (cópia do workspace)  
**Formato:** Markdown com frontmatter YAML  
**Chave de identificação:** `name` (slug kebab-case) no frontmatter, também é o nome do arquivo

**40 agentes no lab** (listagem real):
```
apex-architect, aria-hr, atlas-project, bolt-executor, canvas-designer,
clawdia-assistant, compass-planner, custom-analista-ifood, dex-data,
echo-analyst, flow-git, flux-finance, grid-tester, hawk-debugger,
helm-conductor, kai-personal-assistant, lens-reviewer, lex-legal,
lumen-learning, mako-marketing, mentor-courses, mirror-retro, nex-sales,
nova-product, oath-verifier, oracle, pixel-social-media, prism-scientist,
probe-qa, pulse-community, quill-writer, raven-critic, sage-strategy,
scout-explorer, scroll-docs, trail-tracer, vault-security, zara-cs,
zen-simplifier
```
*(fonte: `find /root/cd-evonexus-lab/agents -name "*.md" | wc -l` → 40 arquivos)*

**Campos do frontmatter** (fonte: `oracle.md` + `custom-analista-ifood.md` lidos):
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | slug único (kebab-case) |
| `description` | string longa | ✅ | usado para roteamento automático |
| `model` | string | ✅ | `sonnet` \| `opus` \| `haiku` |
| `color` | string | ✗ | hex ou named color (ex: `amber`, `#EA1D2C`) |
| `memory` | string | ✗ | tipo de memória do harness (`project`, `user`, etc.) |
| `tools` | lista | ✗ | ferramentas permitidas (se ausente: default do harness) |

**Exemplo real** (`oracle.md`, linhas 1-10):
```markdown
---
name: "oracle"
description: "Use this agent as the single entry point to EvoNexus..."
model: sonnet
color: amber
memory: project
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Skill
  - Agent
---
```

**Prefixo `custom-`:** agentes `custom-*` são gitignored + badge "custom" no dashboard. Core agents shippam com o repo.

**Duas camadas** (fonte: `inventario-tecnico-evonexus.md` §2.1, lido de `models.py:AGENT_LAYERS`):
- **Business layer:** clawdia, flux, atlas, kai, pulse, sage, pixel, nex, mentor, lumen, oracle, mako, aria, zara, lex, nova, dex
- **Engineering layer:** apex, echo, compass, raven, lens, zen, vault, bolt, hawk, grid, probe, oath, trail, flow, scroll, canvas, prism, helm, mirror, scout, quill

**Sem noção de tenant:** o arquivo `.md` não tem `tenant_id`, `owner` nem `scope`. Isolamento é por workspace inteiro.

---

### 1.2 Skills (Habilidades)

**Localização:** `.claude/skills/{prefixo-nome}/SKILL.md` (+ scripts/ + references/)  
**No lab:** `/root/cd-evonexus-lab/skills/`  
**Formato:** diretório com `SKILL.md` obrigatório (frontmatter YAML + corpo Markdown)  
**Chave:** nome do diretório = slug da skill

**Contagem real:** `ls /root/cd-evonexus-lab/skills/ | wc -l` → **~200 diretórios**

**Frontmatter obrigatório** (fonte: `create-agent/SKILL.md` lido):
```markdown
---
name: create-agent
description: "Create a new custom agent for the workspace..."
---
```

**Duas categorias:**
- **Doc-driven** — só `SKILL.md`; o agente lê e executa seguindo o Markdown. Exemplos: `create-agent`, `create-routine`, `create-ticket`, `workspace-share`
- **Turnkey** — `SKILL.md` + `scripts/` Python; o agente invoca via `Bash`. Exemplos: `ai-image-creator/scripts/generate-image.py`, `db-postgres/scripts/db_client.py`, `int-bling/scripts/bling_client.py`

**Prefixos reais** (fonte: `find /root/cd-evonexus-lab/skills -maxdepth 1 -type d`):
`ai-image-creator`, `create-*`, `cs-*`, `data-*`, `db-*`, `dev-*`, `discord-*`, `fin-*`, `gog-*`, `hr-*`, `int-*`, `knowledge-*`, `learn-*`, `legal-*`, `manage-*`, `mkt-*`, `obs-*`, `ops-*`, `plugin-*`, `pm-*`, `prod-*`, `pulse-*`, `sage-*`, `salve`, `schedule-task`, `social-*`, `trigger-registry`, `workspace-share`

**Skills do marketplace** têm arquivos extras (fonte: `int-omie/` lido):
```
int-omie/
├── .clawhub/origin.json   ← origem no marketplace clawhub
├── SKILL.md
├── CHANGELOG.md
├── _meta.json             ← versão, autor, tags
└── scripts/
    ├── omie_client.py
    └── omie_webhook.py
```

**Sem noção de tenant:** skills são globais ao workspace, sem `tenant_id` nem `owner`.

---

### 1.3 Memória

**Localização (global):** `/workspace/memory/` — ext4 montado, sobrevive ao restart do container  
**Localização (por agente):** `/workspace/.claude/agent-memory/{agent}/`  
**No lab (estrutura de lojas):** `/root/cd-evonexus-lab/plans/delivery/uraka-burguer/` (equivalente de loja)  
**Formato:** Markdown (`.md`) com frontmatter YAML para arquivos de memória por agente

**Estrutura de memória global** (fonte: `inventario-tecnico-evonexus.md` §3.3):
```
/workspace/memory/
├── ifood-kb/        ← base de conhecimento geral iFood (8 arquivos)
└── lojas/
    └── uraka-burguer/
        ├── perfil.md
        ├── analises/
        └── inputs/
```

**Estrutura de memória por agente** (fonte: `recovery/agent-memory/oracle/` lido):
```
.claude/agent-memory/oracle/
├── MEMORY.md               ← índice (carregado pelo harness)
├── user_wandson.md         ← type: user
├── project_consult_delivery.md  ← type: project
├── project_pain_map.md
├── project_constraints.md
├── feedback_verify_claims.md  ← type: feedback
└── project_plan_rigor.md
```

**Formato de arquivo de memória** (fonte: `user_wandson.md` lido):
```markdown
---
name: user-wandson
description: Perfil de Wandson Silva — CEO/fundador da Consult Delivery
metadata:
  type: user  # user | feedback | project | reference
---

Wandson Silva — CEO e fundador da [[project-consult-delivery]].
```

**Formato do índice `MEMORY.md`:**
```markdown
# Oracle Memory Index
- [Wandson — perfil do usuário](user_wandson.md) — CEO da Consult Delivery, builder técnico...
```

**Sem noção de tenant:** memória é por workspace. Agentes compartilham a mesma `memory/`.

---

### 1.4 Templates

**Localização:** `.claude/templates/html/`  
**Formato:** HTML com placeholders `{{PLACEHOLDER}}`  
**Chave:** nome do arquivo  

**Convenções visuais** (fonte: `inventario-tecnico-evonexus.md` §2.10):
- Fundo escuro (#0C111D), verde (#00FFA7)
- Logo Evolution Foundation no header
- Footer: "Automatically generated by EvoNexus — Evolution Foundation"

**Não presentes no lab** (apenas no container). Lab tem `plans/delivery/uraka-burguer/relatorios/2026-06-02/relatorio-cliente.html` como output gerado.

---

### 1.5 Rotinas (ADWs)

**Localização:** `/workspace/ADWs/routines/` (container, não no lab)  
**Formato:** Python `.py` com `from runner import run_skill, run_claude, banner, summary`  
**Chave:** nome do arquivo `.py` = slug da rotina

**Core routines** shippam com o repo (hardcoded em `scheduler.py`). Custom em `ADWs/routines/custom/` (gitignored).

**Config de rotinas custom:** `config/routines.yaml` (não existia no momento da inspeção).  
**Agendamento:** `scheduler.py` usa `schedule` lib + SIGHUP reload.

---

### 1.6 Heartbeats

**Localização:** `config/heartbeats.yaml` (arquivo de config principal)  
**Formato:** YAML com campos `id`, `agent`, `interval_seconds`, `decision_prompt`, `wake_triggers`, `enabled`

**Exemplo real** (fonte: `inventario-tecnico-evonexus.md` §2.6, lido do container):
```yaml
heartbeats:
  - id: atlas-4h
    agent: atlas-project
    interval_seconds: 14400
    max_turns: 10
    timeout_seconds: 300
    enabled: false
    wake_triggers: [interval, mention, manual]
    decision_prompt: >
      You are Atlas... Respond with JSON: {"action": "work"|"skip", "reason": "..."}
```

**4 heartbeats configurados** (todos `enabled: false`): `atlas-4h`, `zara-2h`, `flux-6h`, `integrations-health`.

---

### 1.7 Providers (Multi-provider)

**Localização:** `config/providers.json`  
**Formato:** JSON com `active_provider` + dicionário de providers

**Providers disponíveis** (fonte: arquivo lido do container):
`anthropic` (ativo), `openrouter`, `omnirouter`, `openai`, `gemini`, `bedrock`, `vertex`

**Mecanismo:** `cli_command` = `claude` (Anthropic) ou `openclaude` (OpenAI-compatible). Whitelist `ALLOWED_CLI_COMMANDS = frozenset({"claude", "openclaude"})` no Python.

---

### 1.8 Custos

**Localização:** `ADWs/logs/metrics.json`  
**Formato:** JSON acumulado pelo `runner.py` a cada execução  
**Campos por rotina:** `runs`, `successes`, `failures`, `total_cost_usd`, `avg_cost_usd`, `total_input_tokens`, `total_output_tokens`, `total_cache_creation_tokens`, `total_cache_read_tokens`

Heartbeats: `HeartbeatRun.cost_usd` na tabela SQLite. API `/costs` agrega ambos.

---

## 2. Tabelas Operacionais (SQLite)

**DB:** `/workspace/dashboard/data/evonexus.db` (container)  
**Levantado via:** `models.py` inspecionado na sessão 2026-06-03 (fonte: `inventario-tecnico-evonexus.md` Apêndice)

**21 tabelas** (fonte: `models.py` — grep `__tablename__` não executado nesta sessão pois `models.py` estava no container; usamos o inventário canônico já produzido):

| Tabela | Propósito |
|--------|-----------|
| `users` | Usuários com bcrypt (id, username, email, password_hash, role) |
| `audit_log` | Trail de auditoria (user_id, action, resource, detail, ip) |
| `login_throttles` | Rate limiting de login por username + ip |
| `runtime_configs` | Configurações key-value em runtime |
| `scheduled_tasks` | Tasks one-off (id, name, type, payload, agent, status) |
| `triggers` | Webhooks e event triggers (slug, source, action_type, secret) |
| `trigger_executions` | Log de execuções de triggers |
| `roles` | RBAC — permissions_json + agent_access_json + workspace_folders_json |
| `systems` | Registro de sistemas externos (URL, icon, type) |
| `file_shares` | Links compartilhados (token, path, expires_at, view_count) |
| `heartbeats` | Config de heartbeats (espelho do YAML) |
| `heartbeat_runs` | Histórico de execuções (tokens_in, tokens_out, cost_usd, status) |
| `heartbeat_triggers` | Eventos que dispararam heartbeats (com debounce/coalesce) |
| `missions` | Nível 1 da hierarquia de metas |
| `projects` | Nível 2 da hierarquia de metas |
| `goals` | Nível 3 (metric_type, target_value, current_value) |
| `goal_tasks` | Tasks dentro de goals (trigger SQLite para progressão automática) |
| `tickets` | Threads de trabalho persistentes (status, priority, assignee_agent) |
| `ticket_comments` | Comentários com @mentions |
| `ticket_activity` | Timeline de atividades por ticket |
| `brain_repo_configs` | Config do Brain Repo (GitHub sync; github_token_encrypted) |

**Nota `sqlite3`:** não instalado no host. Tabelas levantadas por leitura de `models.py` no container (2026-06-03).

---

## 3. ADAPTA — Camada Plugin/Scan

**Tabelas não encontradas** nas 21 listadas: `plugin_scan_cache`, `plugin_audit_log`.

**O que existe de plugin** (fonte: `inventario-tecnico-evonexus.md` §4.8):
- Backend: `dashboard/backend/plugin_*.py` — scanner, loader, installer, migrator, hook runner
- Logs: `ADWs/logs/plugins/{slug}.jsonl` (rotating, 100MB, 5 backups)
- Circuit breaker: `claude_hook_dispatcher.py` — 5 falhas em 60s → cooldown 5min; storage em SQLite
- Plugin struct: `plugins/{slug}/.claude-plugin/plugin.json` + `skills/` + `agents/` + `hooks/`

**`plugin_scan_cache` e `plugin_audit_log`** — não aparecem em `models.py` como classes SQLAlchemy explícitas. Podem existir como tabelas criadas dinamicamente pelo scanner ou estar no schema de migração do knowledge module. **Não acessível com certeza — registrado como gap.**

---

## 4. Como Agentes São Carregados (Evidência para Fork A vs B)

### 4.1 Path BATCH — runner.py

**Arquivo:** `/workspace/ADWs/runner.py`  
**Comando:** `docker exec 8ff65637fbfb grep -n "agent" /workspace/ADWs/runner.py`

**Trecho real** (linhas 130–143, lido 2026-06-06):
```python
def _spawn_cli(cli_command: str, prompt: str, agent: str | None, provider_env: dict) -> subprocess.Popen:
    """Spawn a CLI process using only hardcoded command strings."""
    base_args = ["--print", "--dangerously-skip-permissions", "--output-format", "json"]
    if agent:
        base_args.extend(["--agent", agent])
    base_args.append(prompt)
    # ...

def run_claude(prompt: str, log_name: str = "unnamed", timeout: int = 600, agent: str = None) -> dict:
    """
    agent: Agent name (.claude/agents/*.md) — if None, runs without agent
    """
```

**Conclusão:** `runner.py` passa o nome do agente via `--agent {name}`. O Claude Code CLI resolve `.claude/agents/{name}.md` pelo nome, no CWD do workspace. **Não há tenant_id, não há lookup em banco — é por nome de arquivo.**

---

### 4.2 Path CHAT — chat-bridge.js

**Arquivo:** `/workspace/dashboard/terminal-server/src/chat-bridge.js`  
**Comando:** `docker exec 8ff65637fbfb grep -n "agent\|loadAgentFile" .../chat-bridge.js`

**Trecho real** (linhas 47–57, lido 2026-06-06):
```javascript
/**
 * Parse a .claude/agents/{name}.md file into an AgentDefinition.
 */
function loadAgentFile(agentName, cwd) {
  const agentPath = path.join(cwd, '.claude', 'agents', `${agentName}.md`);
  if (!fs.existsSync(agentPath)) {
    console.warn(`[chat-bridge] Agent file not found: ${agentPath}`);
    return null;
  }
  const raw = fs.readFileSync(agentPath, 'utf8');
```

**Trecho real** (linhas 451–463, lido 2026-06-06):
```javascript
let promptAppend = agentDef.prompt + '\n\n' + runtimeBlock;
queryOptions.systemPrompt = {
    type: 'claude_code',    // preset systemPrompt
    // + agent prompt appended
};
if (agentDef.model) queryOptions.model = agentDef.model;
```

**Conclusão:** `chat-bridge.js` lê `.claude/agents/{agentName}.md` diretamente pelo nome + CWD. Usa `systemPrompt preset: 'claude_code'` e appenda o prompt do agente. **Sem banco, sem tenant — file-based lookup por nome no filesystem do workspace.**

---

## 5. Insumo: Fork A vs B em `agents`

### Pergunta
No EvoNexus, um "agente" é **catálogo global reutilizável** (B) ou **instância específica de deployment/contexto** (A)?

### Evidência

**1. Estrutura do arquivo:** O `.md` não tem campo `tenant_id`, `owner_id`, `scope` ou `workspace_id`. Frontmatter só tem `name`, `description`, `model`, `color`, `memory`, `tools`.

**2. Carregamento por nome:** Tanto `runner.py` (`--agent {name}`) quanto `chat-bridge.js` (`loadAgentFile(agentName, cwd)`) resolvem o agente **pelo nome do arquivo** no filesystem do workspace. Não há indireção via banco de dados.

**3. Custom vs Core:** A separação é feita por prefixo (`custom-`), não por tenant. Todos os usuários do mesmo workspace veem o mesmo conjunto de agentes.

**4. Camadas Business/Engineering:** definidas em `models.py:AGENT_LAYERS` como catálogo global do workspace — não há "habilitação por usuário" de agentes individuais, só `role.agent_access_json` que filtra por camada ou lista de slugs para o papel do usuário.

**5. Single-tenant implícito:** EvoNexus é uma instalação por cliente. O "tenant" é implícito — é o workspace inteiro. Não há multi-tenancy no nível de agente.

### Conclusão

> **O paradigma EvoNexus favorece B (catálogo global + config por contexto)** — mas de forma implícita: o "catálogo" é o filesystem do workspace, e o "contexto" é o workspace inteiro (single-tenant).

Para a **CD multi-tenant**, isso mapeia para:
- **`agents` (tabela)** = catálogo de blueprints. Campo `tenant_id IS NULL` = global; `tenant_id IS NOT NULL` = custom do tenant (já implementado na CD via `is_custom = true`).
- **`tenant_agents` (tabela)** = habilitação por tenant (quais agentes do catálogo o tenant vê/usa).
- **`tenant_agent_config`** = overrides de config por tenant+agente (modelo, modo, etc.).

**O que o EvoNexus NÃO tem e a CD precisa:** o conceito de "habilitar agente X para tenant Y" — no EvoNexus basta o arquivo existir no workspace. Na CD multi-tenant, esse gap é coberto por `tenant_agents`.

**Recomendação:** manter **B** (catálogo global com habilitação por tenant via `tenant_agents`). Não criar agentes duplicados por tenant — apenas configurações diferentes (`tenant_agent_config`). Alinhado com o que já existe na CD.

> A decisão final é do Wandson, reconciliando com `tenant_agents` e `tenant_agent_config` já existentes.

---

## 6. Mapa EvoNexus → CD Multi-tenant

Para cada entidade CORE do EvoNexus, o equivalente multi-tenant na CD:

| Entidade EvoNexus | Onde vive no EvoNexus | Tabela/Mecanismo CD | Nota multi-tenant |
|---|---|---|---|
| **Agente** | `.claude/agents/{name}.md` | `agents` (slug PK) + markdown in Storage | `tenant_id = NULL` (global) ou custom por tenant. Habilitação via `tenant_agents` |
| **Skill** | `.claude/skills/{slug}/SKILL.md` | Tabela `skills` (nova, FASE 2) + Storage | Global ou por-tenant; prefixo de categoria preservado |
| **Memória global** | `memory/{kb}/` + `memory/lojas/{loja}/` | `agent_memories` (tenant_id) + Storage bucket | KB iFood = global; por loja = scoped `loja_id` |
| **Memória por agente** | `.claude/agent-memory/{agent}/` | `agent_memories` (agente + tenant_id) | Tabela já existe (0 linhas), ativar |
| **Rotina** | `ADWs/routines/*.py` + `config/routines.yaml` | Trigger.dev cron tasks | `tenant_id` no payload; `agent_runs` para log+custo |
| **Heartbeat** | `config/heartbeats.yaml` + `heartbeat_runs` | Trigger.dev scheduled + `decision_prompt` | Scoped por tenant; `enabled` por tenant |
| **Tarefa one-off** | `scheduled_tasks` (SQLite) | Trigger.dev one-off tasks | Scoped por tenant |
| **Gatilho** | `triggers` + `trigger_executions` (SQLite) | Supabase Edge Functions + Trigger.dev events | Por tenant; secret por integração |
| **Ticket/Tópico** | `tickets` + `ticket_comments` (SQLite) | Tabela `tickets` (nova ou estender) | Scoped `tenant_id` |
| **Meta** | `missions` + `projects` + `goals` + `goal_tasks` | Tabela `goals` (nova, FASE 2) | Hierarquia scoped `tenant_id` |
| **Template** | `.claude/templates/html/` | Storage bucket + tabela `templates` | Global (CD branding) ou custom por tenant |
| **Custo** | `ADWs/logs/metrics.json` + `heartbeat_runs` | `agent_runs.cost_usd` | Agregação por tenant via `GROUP BY tenant_id` |
| **Workspace / File Browser** | `/workspace/workspace/` (overlay efêmero) | Supabase Storage bucket/prefixo `tenant_id/` | `memory/lojas/` mapeado para Storage persistente |
| **Links Compartilhados** | `file_shares` (SQLite) | Storage signed URLs + tabela `shares` | Scoped `tenant_id`, expiração preservada |
| **MemPalace** | ChromaDB local (`mempalace/chroma/`) | pgvector (já ativo no Supabase) | DEPOIS (baixa prio) |
| **Conhecimento (RAG)** | `knowledge/` Flask + pgvector | pgvector (NATIVO) | Scoped `tenant_id` via embeddings |
| **Configurações** | `config/workspace.yaml` | Tabela `tenants` + settings JSON | Por tenant (nome, fuso, idioma, trustMode) |
| **Provedores** | `config/providers.json` | ADAPTA — CD usa `@anthropic-ai/sdk` nativo | BYO-key por tenant via Infisical |
| **Integrações** | `.env` + `social-auth/` | Credenciais por tenant no Infisical | Asaas/Evolution são foco; OAuth por tenant |
| **Auditoria** | `audit_log` (SQLite) | `audit_log` (NATIVO — já existe) | Estender ações; scoped `tenant_id` |
| **Usuários / Auth** | `users` + bcrypt (SQLite) | Supabase Auth + `tenant_members` (NATIVO) | Melhor que o deles — já multi-tenant |
| **RBAC** | `roles` + `resource.action` (SQLite) | `roles` + `role_permissions` (NATIVO — TD#50 popular) | CD já tem 7 papéis + `agent_access` |

---

## 7. Não Acessível (Gaps)

| Item | Tentativa | Motivo / Erro |
|---|---|---|
| `plugin_scan_cache` e `plugin_audit_log` | grep em `models.py` via inventário canônico | Não aparecem como classes SQLAlchemy explícitas. Podem existir em migração do knowledge module ou criadas dinamicamente. Registrado como gap — baixa prioridade (ADAPTA/DEPOIS). |
| `runner.py` direto no lab | `find /root/cd-evonexus-lab -name "runner.py"` | Não existe no lab — está no container. Acessado via `docker exec` (read-only). |
| `sqlite3 .tables` direto | `find /root/cd-evonexus-lab -name "*.db"` | Banco não existe no lab (só no container). Schema levantado via `models.py` no inventário de 2026-06-03. |
| `config/routines.yaml` | `inventario-tecnico-evonexus.md` §8.4 | `NOT FOUND` no momento da inspeção — arquivo criado quando usuário usa `create-routine`. Só core routines em `scheduler.py`. |
| Código completo de `providers.json` (gemini, bedrock, vertex) | Container `8ff65637fbfb` | Não lido completamente na sessão 2026-06-03. Confirmados: anthropic, openrouter, omnirouter, openai. Gemini/Bedrock/Vertex: existem no JSON mas campos não levantados. Baixa prioridade (CD usa Anthropic nativo). |

---

## 8. 🛑 CHECKPOINT 0 — Go/No-Go

### O que foi feito
- [x] Lab localizado: `/root/cd-evonexus-lab/` (agentes + skills)
- [x] Container identificado: `8ff65637fbfb` (healthy, `docker exec` read-only executado)
- [x] Inventário canônico lido: `docs/inventario-tecnico-evonexus.md` (2026-06-03, 1765 linhas)
- [x] Entidades file-based mapeadas com evidência (agents, skills, memória, templates, rotinas, heartbeats, providers, custos)
- [x] 21 tabelas SQLite listadas com estrutura de colunas-chave
- [x] `runner.py` e `chat-bridge.js` lidos com trechos reais (fork A vs B)
- [x] Recomendação A vs B com evidência de código
- [x] Mapa EvoNexus → CD com equivalente multi-tenant para cada entidade
- [x] Gaps listados com erro/motivo

### O que NÃO foi feito (conforme regras duras)
- Não escreveu migration
- Não decidiu fork A vs B (recomendou, decisão é do Wandson)
- Não mergeou branch
- Não rodou nem modificou o EvoNexus

### Para o Wandson aprovar
1. **Fork A vs B:** recomendação = **B** (catálogo global + habilitação por tenant via `tenant_agents`). Bate com o que CD já tem. Confirmar?
2. **Seguir para FASE 1:** Passo 0 (lado EvoNexus) completo. Pode iniciar Passo 1 (lado CD — mapeamento linha a linha do checklist mestre)?
3. **Gaps aceitáveis?** `plugin_scan_cache`/`plugin_audit_log` não levantados — baixa prioridade (ADAPTA/DEPOIS). Aceitar como gap?

---

*Inventário produzido em sessão read-only. Nenhuma configuração foi alterada, nenhum agente foi acionado, nenhuma migration foi criada.*
