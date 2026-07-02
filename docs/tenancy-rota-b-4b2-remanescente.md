# Rota B — 4b-2: as 30 policies remanescentes (checkpoint)

Data: 2026-07-02. Estado: G1(9)+G2(22)+Cat.X(19) aplicados e testados. Faltam **30** que ainda
referenciam `tenant_members` flat (sem `accessible_tenant_ids`). Cópia A1 ainda ATIVA → tudo funciona.
Helpers disponíveis: `accessible_tenant_ids()`, `accessible_tenant_ids_with_role(text[])` (usa
`tenant_members.role`), `is_member_of`/`is_admin_of` (hierárquicos), `has_tenant_access`.

## Y — gate por tenant_members.role (converte com helpers existentes) ~10
Transform: subquery/EXISTS de membership com `tm.role <op> <set>` → `accessible_tenant_ids_with_role(ARRAY[<set>])`
(ou `is_admin_of(tenant_id)` quando role∈{admin,owner} correlacionado). Preservar wrappers/OR/status.
- agent_drafts.drafts_update_tenant (qual: plain→accessible_tenant_ids; with_check: membership + (status DISTINCT approved/rejected) OR tm.role∈admin/owner/deli_owner)
- loja_gpt_conversations.lgc_update (`iniciada_por=auth.uid()` OR tm.role='admin' via lojas l)
- prospect_abordagens.prospect_abordagens_select (tm.role admin/marketing/dev/viewer via prospects p)
- prospect_abordagens.prospect_abordagens_write (tm.role admin/marketing/dev; qual E with_check)
- prospect_pesquisas.prospect_pesquisas_select (tm.role .../viewer via prospects p)
- prospect_pesquisas.prospect_pesquisas_write (tm.role admin/marketing/dev; qual E with_check)
- role_permissions.role_permissions_manage_admin (tm.role='admin' via roles r) → is_admin_of pela r.tenant_id
- user_roles.user_roles_manage_admin (tm.role='admin' via roles r) → idem
- tenant_agent_config.tenant_admin_manage_agent_config (EXISTS correlacionado tm.role admin/owner) → `is_admin_of(tenant_id)`
- user_screen_permissions.admin_read_screen_perms (EXISTS correlacionado tm.role admin/owner) → `is_admin_of(tenant_id)`

## Z — RBAC (user_roles+roles.r.name) e/ou atribuição loja_consultores (PRECISA HELPER NOVO + DECISÃO) ~11
Estas NÃO usam tenant_members.role; usam o RBAC: `tenant_members tm` só para achar o tenant, `JOIN user_roles ur ON ur.user_id=tm.user_id JOIN roles r ON r.id=ur.role_id AND r.tenant_id=<parent>.tenant_id` e filtram por `r.name`. Várias têm OR com `loja_consultores lc` (lc.user_id=auth.uid() AND lc.ativo) = atribuição direta do consultor (já funciona sem hierarquia — PRESERVAR essa branch intacta).
Para hierarquizar o eixo tenant do ramo RBAC é preciso um helper novo, algo como
`has_rbac_role_in_hierarchy(_tenant uuid, _role_names text[])` = existe roles r + user_roles ur do auth.uid() com r.name∈_role_names e r.tenant_id ∈ (ancestrais de _tenant ∪ _tenant). DECISÃO Wandson: o RBAC-role da agência deve valer nos stores descendentes? (provável sim, coerente com Opção 2.)
- atendimento_avaliacoes.aval_update_admin (r.name admin/dev/atendimento)
- avaliacao_config.tenant_admin_write_avaliacao_config (r.name admin/dev)
- loja_consultores."Admins gerenciam atribuições" (r.name admin/consultor_senior via lojas l)
- loja_metricas_snapshot."Editar métricas: admins, consultores_senior e consultores atri…" (r.name OR loja_consultores)
- tarefa_aprovacoes."Registrar acao: …atribu" (INSERT; r.name OR loja_consultores)
- tarefa_comentarios."Comentar: …atribuidos" (INSERT; autor_id + (r.name OR loja_consultores))
- tarefa_comentarios."Deletar comentario: autor ou admin" (autor_id OR r.name)
- tarefa_prints."Enviar prints: …atribui" (INSERT; r.name OR loja_consultores)
- tarefa_prints."Remover prints proprios ou como admin" (enviado_por OR r.name)
- tarefas_loja."Gerenciar tarefas: …atr" (r.name OR loja_consultores)
- templates_tarefa."Gerenciar templates: admins e consultores_senior" (r.name via user_roles/roles)

## Especiais/compostas ~9
- messages.messages_{select,insert,update}_tenant: composto `(tenant_id IS NOT NULL AND tenant_id IN <membros>) OR (tenant_id IS NULL AND conversation_id IN (SELECT id FROM conversations WHERE conversations.tenant_id IN <membros>))`. Trocar cada `<membros>` (`tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid())`) por `IN (SELECT accessible_tenant_ids())`. Convertível, só é composto.
- whatsapp_aprovacao_sessions."Cancelar sessao do tenant" (UPDATE, with_check status='cancelada') e "Sessoes do tenant" (SELECT): `EXISTS(FROM lojas l WHERE l.id=...loja_id AND l.tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid()))` → trocar inner por `l.tenant_id IN (SELECT accessible_tenant_ids())`. Convertível (Cat.X composta).
- profiles.tenant_peers_see_profiles: `id IN (SELECT tm2.user_id FROM tenant_members tm1 JOIN tenant_members tm2 ON tm1.tenant_id=tm2.tenant_id WHERE tm1.user_id=auth.uid())` = "vejo perfis de quem compartilha tenant comigo". Hierárquico = `id IN (SELECT user_id FROM tenant_members WHERE tenant_id IN (SELECT accessible_tenant_ids()))`. DECISÃO: agência passa a ver perfis dos membros dos stores (provável ok).
- evolution_instances.evolution_instances_manage_admin: `EXISTS(tenant_members WHERE user_id=auth.uid() AND role='admin')` — gate GLOBAL sem correlação de tenant (admin de QUALQUER tenant gere TODAS as instâncias). ⚠️ possível brecha pré-existente. DECISÃO: correlacionar por tenant_id (`is_admin_of(tenant_id)`) ou manter global? Recomendo correlacionar.
- max_knowledge_base.max_kb_write: `EXISTS(role admin/owner/deli_owner) LIMIT 1` — global; KB tem linhas globais (tenant_id NULL). Provavelmente intencional global → deixar como está (documentar).

## Ordem sugerida na retomada
1. Especiais convertíveis (messages, whatsapp_aprovacao_sessions) → accessible_tenant_ids(). + profiles (decisão rápida).
2. Y (10) com helpers existentes.
3. Criar `has_rbac_role_in_hierarchy` + converter Z (11) — com decisão do Wandson sobre RBAC descer + preservar branch loja_consultores.
4. Decidir evolution_instances (correlacionar) e max_kb_write (deixar global).
5. Retestar matriz por persona. SÓ ENTÃO Etapa 4c (remover cópia A1 + triggers 012).
Rollback de qualquer policy: `supabase/migrations/rollback_20260702_policies_snapshot.sql`.
