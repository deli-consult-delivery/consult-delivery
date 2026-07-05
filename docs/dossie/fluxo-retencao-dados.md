# Fluxo e Retenção de Dados — Consult Delivery

> STATUS: DRAFT — revisar antes de publicar

Mapeamento real de que dados entram na plataforma, onde ficam (Supabase, `czyanilrverorwenikqw`), por quanto tempo e quem acessa. Sustenta o dossiê de homologação iFood (Frente A3, `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §2 A3 etapa 5) e a base LGPD do SaaS white-label.

Toda tabela abaixo é multi-tenant (`tenant_id NOT NULL REFERENCES tenants(id)`) com Row Level Security (RLS) ativa — ver `politica-seguranca.md`.

## 1. Avaliações iFood (módulo Review)

| | |
|---|---|
| **Dado** | Nota (1-5), comentário, nome do cliente, tipo (loja/entrega), resposta sugerida pela IA, resposta final publicada, insights de consultoria |
| **Entrada** | Colado manualmente pelo consultor hoje (via browser no Portal do Parceiro); módulo Review da API oficial substituirá essa via (`docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §2 A1) |
| **Onde fica** | `avaliacoes`, `avaliacoes_loja_config` (`supabase/migrations/20260614_001_avaliacoes.sql`); `nps_avaliacoes` (CSAT/NPS, `20260621_002_nps_avaliacoes.sql`); `atendimento_avaliacoes` (`20260621_001_atendimento_avaliacoes.sql`) |
| **Retenção** | Sem TTL/expurgo automático configurado hoje — dado fica indefinidamente. Ver §5 (gap) |
| **Quem acessa** | RLS por `tenant_id` (`tenant_members`); tela protegida por RBAC `analise_ifood:view` (roles `admin`, `dev`, `atendimento` — `docs/deli-memory/principles/rbac-roles.md`). Migration `20260701_003_bloquear_resp_avaliacoes_leak_consult_delivery.sql` e `20260701_004_corrige_escopo_resp_avaliacoes.sql` corrigiram vazamento de escopo entre tenants nesta mesma tabela |

## 2. Métricas de loja (módulo Merchant/Financial/Catalog)

| | |
|---|---|
| **Dado** | Faturamento, pedidos, status de loja, itens pausados, ~7 abas de desempenho (via skill de validação Cowork) |
| **Entrada** | Agente GESTOR — coleta diária automatizada via browser no Portal do Parceiro (`GESTOR_COLETA_ATIVA=true`, 14 lojas); migrará para API oficial módulo a módulo (`fonte_dados = 'portal' \| 'api'` por loja) |
| **Onde fica** | `loja_metricas` (snapshot diário), `radar_series` (série longa fonte/métrica) |
| **Retenção** | Sem TTL — série histórica acumula indefinidamente (é o propósito: comparar tendência) |
| **Quem acessa** | RLS por `tenant_id`; tela protegida por RBAC `reports:view`/`crm:view` |

## 3. WhatsApp (contatos, grupos, mensagens)

| | |
|---|---|
| **Dado** | JID (identificador de telefone), nome, mensagens de texto/mídia, metadados de grupo |
| **Entrada** | Webhook Evolution API → Edge Function `evolution-webhook` (Supabase) |
| **Onde fica** | `whatsapp_contacts`, `whatsapp_groups`, `whatsapp_group_members`, `whatsapp_messages` (`supabase/migrations/20260504_004_whatsapp.sql`; modelo completo em `docs/fluxos/whatsapp.md`) |
| **Retenção** | Sem TTL — histórico de mensagens acumula indefinidamente |
| **Quem acessa** | RLS por `tenant_id`; tela protegida por RBAC `grupos_whatsapp` (role `atendimento`). **DELI monitora mas nunca responde** cliente diretamente (`docs/deli-memory/principles/whatsapp-model.md`) |
| **Direito de oposição** | Tabela `contact_optout` existe e tem RLS hierárquica (`supabase/migrations/20260702_011_rls_contact_optout.sql`) — mecanismo técnico de opt-out de contato já implementado |

## 4. Fatos e linha do tempo do cliente (Memória Central)

| | |
|---|---|
| **Dado** | Fatos key-value por loja (`client_facts`) e eventos imutáveis (`client_timeline`) que todo agente IA lê antes de agir e escreve depois |
| **Entrada** | Escrita pelos próprios agentes (DELI, LARA, VERA, BRENO, CORA) durante execução |
| **Onde fica** | `client_facts`, `client_timeline`, `lojas`, `loja_metricas` (`supabase/migrations/20260504_002_memoria_central.sql`; princípios em `docs/deli-memory/principles/agent-memory.md`) |
| **Retenção** | `client_timeline` é **imutável por design** (nunca UPDATE/DELETE) — cresce indefinidamente. Não vive em VPS/arquivo local, só Supabase |
| **Quem acessa** | RLS por `tenant_id`; leitura/escrita restrita ao agente em execução via `requireAgentAccess` middleware do Bridge Server |

## 5. Drafts de mensagens e aprovações (DELI)

| | |
|---|---|
| **Dado** | Corpo da mensagem que um agente quer enviar a um cliente, canal, status (`pending/approved/rejected/sent/edited`), autonomia (`verde/amarelo/vermelho`), quem aprovou |
| **Entrada** | Gerado pelos agentes antes de qualquer envio a cliente — **nenhum agente envia sem aprovação humana** (exceto canal interno + verde) |
| **Onde fica** | `agent_drafts`, `deli_triggers` (`supabase/migrations/20260504_005_drafts_deli.sql`) |
| **Retenção** | Sem TTL — histórico de drafts (inclusive rejeitados) fica retido |
| **Quem acessa** | RLS por `tenant_id`; aprovação restrita a `deli_owner`/`admin` (`20260701_002_agent_drafts_restrict_approval_to_admin.sql`) |

## 6. Auditoria (audit_log)

| | |
|---|---|
| **Dado** | Toda ação relevante: quem, quando, qual agente, qual recurso, IP, user-agent, metadata |
| **Entrada** | Middleware Bridge Server (`requireAgentAccess`) grava em toda invocação de agente; toda tela RBAC-protegida também loga |
| **Onde fica** | `audit_log` (`supabase/migrations/20260504_001_rbac.sql`) — **append-only por design**, comentário no schema: "sem UPDATE, sem DELETE" |
| **Retenção** | Permanente — é o registro de conformidade, não deve ter TTL |
| **Quem acessa** | RLS por `tenant_id`; leitura não exposta a papéis operacionais no front hoje (gap a formalizar — ver `checklist-homologacao.md`) |

## 7. Identidade e controle de acesso (RBAC)

| | |
|---|---|
| **Dado** | E-mail/senha (Supabase Auth), papel por tenant (`tenant_members.role`), permissões granulares (`role_permissions`), acesso por agente (`user_agent_access`) |
| **Onde fica** | `auth.users` (Supabase Auth nativo), `tenant_members`, `roles`, `user_roles`, `role_permissions`, `user_agent_access` (`supabase/migrations/20260504_001_rbac.sql`) |
| **Retenção** | Ligada ao ciclo de vida do usuário — remoção de acesso é manual hoje (sem fluxo de "excluir conta" self-service) |
| **Quem acessa** | Cada usuário só enxerga a própria linha e a de quem administra; hierarquia Plataforma→Agência→Loja controlada por `accessible_tenant_ids()` (RLS hierárquica, `docs/tenancy-rota-b-rls-hierarquica-spec.md`) |

## 8. Segredos e credenciais (fora do escopo de dado pessoal, mas retenção relevante)

Credenciais (API keys, tokens) ficam em **Infisical** (`172.18.0.3:8080`) ou `.env` da VPS — nunca em tabela do Supabase, nunca em commit/chat/log (`docs/infra/gate0-rotacao-credenciais.md`). Não é dado pessoal de titular, mas é o que protege todos os dados acima.

## Onde os dados NÃO ficam

- Nada de dado de cliente em `memory/*.md` da VPS ou arquivos locais — regra explícita (`docs/deli-memory/principles/agent-memory.md`)
- Nada de segredo/token em tabela do Supabase

## Gaps identificados (transparência — não esconder do dossiê)

- [ ] Não existe política de retenção/expurgo automatizado (TTL, `pg_cron` de limpeza) para nenhuma das tabelas acima — hoje tudo é retido indefinidamente
- [ ] Não existe fluxo self-service de "exportar meus dados" ou "excluir minha conta" — hoje é manual (via Wandson)
- [ ] Leitura de `audit_log` não está exposta em tela de front para o titular/tenant auditar a própria trilha

Estes 3 itens alimentam `lgpd.md` §Direitos do titular e `checklist-homologacao.md`.
