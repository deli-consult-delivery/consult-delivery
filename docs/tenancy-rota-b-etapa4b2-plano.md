# Rota B — Etapa 4b-2: as 78 policies especiais (plano detalhado)

Data: 2026-07-02. Estado ao escrever: 4b-1 aplicada (133 plain hierárquicas), helpers prontos
(`accessible_tenant_ids`, `accessible_tenant_ids_with_role`, `is_member_of`/`is_admin_of` hierárquicos).
Cópia A1 ainda ATIVA → sistema funciona (as 78 flat ainda concedem via cópia). Nada quebrado.

## Por que parar a automação aqui
As 78 são heterogêneas e algumas são gate de segurança / autorização por atribuição. Blanket-convert
arriscaria downgrade ou lockout. Tratar por grupo, com teste por grupo.

## Grupos e tratamento

### G1 — DATA aninhada/EXISTS sem role (SEGURO → hierárquico) ~33
Visibilidade pura por tenant, escritas via outra tabela ou EXISTS. Transformar o subselect interno de
membership `(… tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid()))` /
`EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=X AND user_id=auth.uid())` para
`X IN (SELECT accessible_tenant_ids())`.
Ex.: messages.{select,insert,update}_tenant (via conversations), custom_field_values, customer_tag_relations,
contact_optout, evolution_instances_select_tenant, chat_tasks, client_tasks, cobranca_eventos.{insert,select},
conversation_tags, customer_note_entries, customer_tags, department_members, lead_list_members,
loja_gpt_conversations.lgc_select, loja_gpt_messages.lgm_select, loja_metricas_snapshot."Métricas do próprio tenant",
role_permissions_select_tenant (via roles), tarefa_*."Ver ... do proprio tenant", tarefa_revisoes,
tarefas_loja."Ver tarefas do proprio tenant", templates_tarefa."Ver templates...", user_roles_select_tenant,
whatsapp_aprovacao_sessions.*, whatsapp_group_members.*_select/manage_tenant, profiles.tenant_peers_see_profiles.

### G2 — GESTÃO role simples/estrutural (→ accessible_tenant_ids_with_role) ~22
Gate por role em tenant_members, sem atribuição. Trocar subquery-com-role por
`X IN (SELECT accessible_tenant_ids_with_role(ARRAY[<roles exatos>]))`, preservando roles e wrappers.
Ex.: audit_log_select_admin, bom_dia_config.*_admin_marketing, encerramento_config.*_admin_marketing,
whatsapp_groups.wa_groups_update_admin_marketing, bot_configs write (admin/dev), client_facts_delete_admin,
conversations_delete_admin, deli_triggers_manage_admin, deli_approvals_update_deli_owner,
evolution_instances_manage_admin, loja_metricas_delete_admin, lojas_delete_admin, max_kb_write,
role_permissions_manage_admin, roles_{insert,update,delete}_admin, user_roles_manage_admin,
tenant_modules_{insert,update,delete}_admin, tenant_agent_config.tenant_admin_manage_agent_config,
avaliacao_config.tenant_admin_write_avaliacao_config, atendimento_avaliacoes.aval_update_admin,
agent_drafts.drafts_update_tenant (preservar a condição de status!), tarefa_anexos.deletar_anexos_tenant.

### G3 — AUTORIZAÇÃO COMPLEXA (revisar caso a caso — NÃO converter em lote) ~ até 15
Envolvem "consultores atribuídos" / possível join com loja_consultores ou lógica além de tenant_members.
LER a definição de cada uma antes: loja_consultores."Admins gerenciam atribuições",
loja_gpt_conversations.lgc_update, loja_metricas_snapshot."Editar métricas: admins, consultores_senior e
consultores atrib…", prospect_abordagens.{select,write}, prospect_pesquisas.{select,write},
prospects.{select,write}_tenant_roles, tarefa_aprovacoes."Registrar acao…", tarefa_comentarios.{comentar,
deletar}, tarefa_prints.{enviar,remover}, tarefas_loja."Gerenciar tarefas…", templates_tarefa."Gerenciar…".
Para cada: decidir se o eixo tenant vira hierárquico (provável sim) mantendo a lógica de atribuição intacta.

## Passos
1. G1 (data) → migration atômica + teste isolamento (agência sem cópia vê; lojista confinado).
2. G2 (gestão simples) → migration atômica + teste (agência admin gere store; lojista não).
3. G3 → ler cada def, converter individual, testar.
4. Só então Etapa 4c (remover cópia A1 + triggers 012).

Rollback de qualquer policy: `supabase/migrations/rollback_20260702_policies_snapshot.sql`.
Lista bruta das 78 (com motivo) está no output do subagente da sessão 2026-07-02 e reproduzida por grupo acima.
