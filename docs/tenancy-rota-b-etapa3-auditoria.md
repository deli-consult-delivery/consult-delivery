# Rota B — Etapa 3: auditoria de pertencimento estrito (dados vs. gestão)

Data: 2026-07-02 | read-only, nada aplicado. Antecede a migração de policies (Etapa 4).

## Descoberta que muda o escopo

O objetivo da Rota B era "aposentar a cópia A1". Mas a auditoria mostra que a cópia A1 tem **duas
funções**, não uma:
1. **Visibilidade/operação** — agência VÊ e opera os dados dos stores. (policies de dados)
2. **Gestão** — agência é `admin` dos stores → gerencia membros, roles, config, exclui/edita. (policies
   `is_admin_of` / role-filtradas / tabelas estruturais)

Hoje as duas funcionam porque a cópia A1 torna a agência **membro admin direto** de cada store.
Os triggers da migration `012` já automatizam essa cópia → **a dor de manutenção já está resolvida.**

Portanto a Rota B só "mata a cópia" de verdade se **ambas** as funções virarem hierárquicas. Se só os
dados virarem hierárquicos, a gestão ainda precisa da cópia → a cópia continua existindo.

## Classificação das policies

### BUCKET A — DADOS → hierárquico (`has_tenant_access` / `accessible_tenant_ids`). Seguro, é o core.
~150 inline `tenant_id IN (SELECT … tenant_members …)` + `is_member_of` em tabelas de dados:
agent_actions, agent_drafts(select/insert), agent_memories, agent_prompts, agent_runs, agente_analises,
analise_loja, conversations, crm_notas, customers, customer_groups(select), customer_group_members(select),
daily_kpis, defesa_casos/aprovadores/assinaturas(select), estudio_criacoes, inadimplencias(+messages),
messages, oracle_drafts(select/insert), orders, radar_fontes/metricas/series, regua_cobranca(select),
tarefas_analise, task_comments, tasks, templates(select), tenant_files, tenant_gatilhos, tenant_integracoes,
tenant_links, tenant_provedores, tenant_sistemas, tenant_tarefas, tenant_topicos, vendaerp_*(select),
agent_skills(select), agents(select_gated), tenant_agents(select), tenants(select_member), deli_* (select).

### BUCKET B — GESTÃO → decisão necessária (hierárquico OU estrito)
`is_admin_of` (22): agent_skills_write, agents_{insert,update,delete}_admin_custom, customer_group(s)_write,
defesa_assinaturas_insert_admin, oracle_drafts_update_admin, regua_cobranca_admin_{insert,update,delete},
templates_write, tenant_agents_admin_{insert,update,delete}, tenant_members_admin_{insert,update,delete},
tenant_members_select, tenants_{update,delete}_admin.
role-filtradas inline: audit_log_select_admin, *_admin_marketing (bom_dia/encerramento/whatsapp_groups),
client_facts_delete_admin, conversations_delete_admin, deli_{triggers,approvals}_*, roles_{insert,update,delete}_admin,
role_permissions_manage_admin, user_roles_manage_admin, lojas_delete_admin, loja_metricas_delete_admin, etc.
Tabelas estruturais: tenant_members, roles, role_permissions, tenant_agents, tenant_agent_config,
tenant_modules, tenants, user_roles.

`is_admin_of(_tenant)` hoje = `EXISTS(tenant_members WHERE tenant=_tenant AND user=auth.uid() AND role IN (owner,admin))` — **estrito** (pertencimento direto).

### BUCKET C — SEMPRE estrito (nunca tocar)
- `tenant_members_self_insert`, `tenants_insert_authenticated` (signup/bootstrap).
- policies `service_role` (`auth.role()='service_role'`).
- ramos `tenant_id IS NULL` (linhas globais) — preservar o `IS NULL OR …`.

## A DECISÃO (fork do end-state)

**Opção 1 — Hierarquizar só DADOS; manter cópia p/ gestão.** Bucket A → hierárquico. Bucket B fica
estrito. A cópia A1 + triggers 012 continuam (gestão depende deles). Baixo risco. **Mas não elimina a
cópia** — só a torna redundante para leitura. Ganho real pequeno (a dor de manutenção já foi resolvida
pelos triggers 012).

**Opção 2 — Hierarquizar DADOS + GESTÃO; remover cópia.** Bucket A → hierárquico E `is_admin_of` vira
hierárquico (admin do tenant OU de um ancestral). Depois remove cópia A1 + triggers 012. End-state limpo:
a agência opera e gerencia os stores por hierarquia; lojista confinado ao seu store. **Maior risco**
(admin desce a árvore — agência gerencia membros/roles/config dos stores; é o que a cópia já faz hoje,
então preserva o comportamento atual, mas agora sem cópia).

**Opção 3 — PARAR aqui.** Os triggers 012 já resolveram a dor de manutenção. Manter a cópia como
mecanismo e não hierarquizar RLS. Rota B vira "não vale o risco". Helpers ficam disponíveis se um dia
mudar de ideia.

## Recomendação
Se o objetivo é **realmente aposentar a cópia** → Opção 2 (é a única que elimina, e preserva o
comportamento atual da agência sobre os stores). Se o objetivo era só **resolver manutenção** → já está
feito pelos triggers 012 → **Opção 3**. Opção 1 é meio-termo de ganho baixo.
