# Política de Segurança da Informação — Consult Delivery

> STATUS: DRAFT — revisar antes de publicar

Baseada exclusivamente em controles que **existem e estão em produção** hoje. O que não existe vai em §Roadmap, não é apresentado como implementado — segurança-de-brochura é o oposto do que este documento deve ser.

## 1. Gestão de segredos

- Nenhuma credencial (API key, token, senha de serviço) vive em código, commit, chat, issue ou log — regra explícita e auditada (`docs/infra/gate0-rotacao-credenciais.md`)
- Segredos de produção ficam em **Infisical** (`172.18.0.3:8080`, painel web) ou em `.env` da VPS fora do controle de versão
- Runbook de rotação de credenciais documentado e testado (`docs/infra/gate0-rotacao-credenciais.md`): PATs GitHub, tokens de dashboard, tokens de bot — rotação um de cada vez, com verificação de serviço entre cada passo
- Achado de segurança já corrigido por essa disciplina: `/opt/evo-nexus/.env` com permissão `666` (world-writable) foi identificado no próprio inventário de rotação — evidência de que auditoria de permissão de arquivo é praticada, não só declarada

## 2. Isolamento multi-tenant (Row Level Security)

- Todo dado de tenant vive em tabela com `tenant_id NOT NULL` e **RLS habilitada por padrão** (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em toda migration que cria tabela nova)
- Modelo hierárquico de 3 níveis — Plataforma → Agência → Loja (`parent_tenant_id` + `tenant_type`, árvore acíclica garantida por trigger `validate_tenant_hierarchy`)
- Função `accessible_tenant_ids()` centraliza a regra de acesso hierárquico (usuário vê seu tenant + descendentes, nunca ascendentes ou irmãos) — substituiu 172+ policies com subquery inline heterogênea por uma função única auditável (`docs/tenancy-rota-b-rls-hierarquica-spec.md`, aplicada e concluída 2026-07-03 conforme memória `project_tenancy_rota_b_progresso`)
- Isolamento é testado ativamente: quando uma falha de escopo foi encontrada (vazamento de resposta de avaliação entre tenants), foi corrigida em produção via migration versionada no mesmo dia (`supabase/migrations/20260701_003_bloquear_resp_avaliacoes_leak_consult_delivery.sql`, `20260701_004_corrige_escopo_resp_avaliacoes.sql`)

## 3. Controle de acesso (RBAC)

- Papéis por tenant: `admin`, `dev`, `marketing`, `atendimento`, `financeiro`, `viewer`, `deli_owner` (`supabase/migrations/20260504_001_rbac.sql`, matriz completa em `docs/deli-memory/principles/rbac-roles.md`)
- Permissão granular por recurso × ação (`role_permissions`: resource, action) — não é RBAC binário de "é admin ou não"
- Front: componente `<RequireRole resource="x" action="y">` bloqueia renderização de tela não autorizada
- Bridge Server: middleware `requireAgentAccess` valida JWT (Supabase Auth) + `user_agent_access` antes de qualquer invocação de agente — 403 se não autorizado
- Acesso por agente é individual: `can_invoke`, `can_view_history`, `can_approve_drafts` são flags separadas por usuário × agente

## 4. Auditoria

- `audit_log` é **append-only por design** — schema comentado explicitamente "sem UPDATE, sem DELETE" (`supabase/migrations/20260504_001_rbac.sql`)
- Toda invocação de agente via Bridge Server é logada com `tenant_id`, `user_id`, `agent_name`, `action`, `resource`, `metadata`, `ip_address`, `user_agent`
- `client_timeline` (memória dos agentes) também é imutável por convenção documentada — nunca UPDATE/DELETE (`docs/deli-memory/principles/agent-memory.md`)

## 5. Aprovação humana antes de ação externa

- Nenhum agente envia mensagem a cliente sem aprovação — fluxo `agent_drafts`: draft → notifica humano → aprova/rejeita → sistema envia (`supabase/migrations/20260504_005_drafts_deli.sql`)
- Semáforo de autonomia por ação: Verde (executa e reporta) / Amarelo (propõe, humano aprova) / Vermelho (aprovação explícita nomeada)
- Aprovação de draft restrita a `admin`/`deli_owner` (`supabase/migrations/20260701_002_agent_drafts_restrict_approval_to_admin.sql`)
- DELI (orquestradora) **nunca responde cliente diretamente** — só monitora e aciona especialistas (`docs/deli-memory/principles/whatsapp-model.md`)

## 6. Infraestrutura

- VPS própria (187.127.25.24, Ubuntu 24.04) rodando Bridge Server sob `systemd`/PM2 (processo persistente, não ad-hoc)
- Deploy de frontend via GitHub Actions → GitHub Pages (pipeline versionado, sem deploy manual de arquivo)
- Orquestração de agentes via Trigger.dev cloud (`proj_slexhoelcjwgbopmbzzr`) — execução gerenciada, com retry e `additionalFiles` explícito no `trigger.config.ts`
- Regra de código: nenhum `throw` no topo de módulo Trigger.dev (derrubaria o worker inteiro) — env vars sempre em lazy getter

## 7. Git e revisão de mudança

- Nenhum commit direto em `main` — toda mudança passa por branch + PR (`docs/deli-memory/principles/git-workflow.md`)
- Migrations SQL são versionadas em git **antes** de aplicadas em produção — nunca SQL solto rodado direto no painel
- SQL destrutivo (`DROP`/`DELETE`/`TRUNCATE` em massa) sobre dado real exige confirmação explícita do CEO; SQL aditivo/reversível roda com autonomia registrada em log

## Roadmap de segurança (o que NÃO existe ainda — declarado, não escondido)

- [ ] Sem TTL/retenção automatizada de dados (ver `fluxo-retencao-dados.md` §Gaps)
- [ ] Sem runbook formal de resposta a incidente de dado pessoal (distinto do runbook de rotação de credencial, que já existe)
- [ ] Sem criptografia de campo a nível de aplicação para dado sensível em repouso (depende do Supabase-managed encryption at rest — não há camada adicional própria)
- [ ] Sem pentest/auditoria de segurança externa realizada até o momento
- [ ] Sem MFA obrigatório para usuários da plataforma (depende de configuração do Supabase Auth — a confirmar se está ativo)
- [ ] Sem WAF/rate-limiting dedicado documentado no Bridge Server além do que a stack (Express) oferece nativamente
