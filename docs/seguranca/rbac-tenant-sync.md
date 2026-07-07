# RBAC: sincronização client ↔ RLS (`user_roles`/`roles` vs `tenant_members`)

Investigação disparada pela revisão do PR #823: TD de segurança real — `src/hooks/usePermissions.js`
`hasRole('admin')` consultava `user_roles`→`roles.name` **sem filtro de tenant**, enquanto a RLS decide
acesso via `tenant_members.role` (`accessible_tenant_ids_with_role`). Os dois sistemas podiam divergir:
falso-negativo (admin real do tenant bloqueado no client) ou tela vazia confusa (client libera UI que a
RLS depois bloqueia sem dado nenhum).

**Status: alinhado nesta PR.** Sem migration — todas as colunas `tenant_id` necessárias já existiam e já
estavam populadas; o fix foi 100% em código de aplicação (client-side).

## Os dois modelos (antes do fix)

| | `user_roles` → `roles` → `role_permissions` | `tenant_members` |
|---|---|---|
| Usado pela RLS? | **Não, nunca** (grep + `pg_get_functiondef` confirmam: `accessible_tenant_ids_with_role` só lê `tenant_members`) | **Sim, é a única fonte** — com herança hierárquica via `parent_tenant_id` |
| Usado pelo client (antes)? | Sim — `usePermissions.hasRole`/`can` | Não (só indiretamente, via RLS) |
| Tem caminho de escrita na app? | **Não — zero.** `grep -rln "user_roles\|from('roles')" src/ bridge-server/ trigger/` só acha `usePermissions.js` (leitura). As 7 linhas de `user_roles`/30 de `roles`/382 de `role_permissions` vieram 100% do seed da migration original de RBAC (squashada no baseline de #746) e nunca mais foram tocadas. | Sim — onboarding, `AcessoUsuarios.jsx`, convite via Console. Ativamente mantida. |
| Escopo por tenant | `roles.tenant_id` existe, mas `user_roles` (join) **não tem `tenant_id`** — só `user_id`+`role_id`. `usePermissions` (antes) ignorava isso e agregava nomes de papel de TODAS as linhas do usuário, cruzando tenants. | 1 linha por `(tenant_id, user_id)`, 1 papel (texto) por vez — sem ambiguidade. |

## Divergência confirmada ao vivo (SQL read-only, `czyanilrverorwenikqw`)

```sql
select coalesce(tm.user_id, ur_agg.user_id) as user_id,
  tm.tenant_id as tm_tenant_id, t.slug as tm_tenant_slug, tm.role as tm_role,
  ur_agg.roles_json as user_roles_global
from tenant_members tm
full outer join (
  select ur.user_id, jsonb_agg(jsonb_build_object('role_tenant_slug', t2.slug, 'role_name', r.name)) as roles_json
  from user_roles ur join roles r on r.id = ur.role_id
  left join tenants t2 on t2.id = r.tenant_id group by ur.user_id
) ur_agg on ur_agg.user_id = tm.user_id
left join tenants t on t.id = tm.tenant_id order by 1;
```

Resultado (7 usuários total no sistema):

| user_id | `tenant_members` | `user_roles` (agregado global, sem tenant) | Efeito do bug (client ANTES do fix) |
|---|---|---|---|
| `5b7f2042-...` | **nenhuma linha** | admin (karina-doceria) | `hasRole('admin')` = **true** em qualquer tela/tenant — mas RLS bloqueia TUDO (usuário não é membro de nenhum tenant). **Tela vazia confusa.** |
| `9b972162-...` (deli@consultdelivery.com.br) | consultor (Consult) | **nenhuma linha** | `hasRole`/`can` sempre **false** — bloqueado em qualquer `<RequireRole>` mesmo sendo `consultor` real via RLS. **Falso-negativo.** |
| outros 5 usuários | admin/admin/admin/admin/(admin+deli_owner) | mesmo tenant, nomes compatíveis | Sem divergência **hoje** — mas não é garantido por nenhuma constraint, é coincidência de manutenção manual. |

`roles`/`role_permissions` são efetivamente um catálogo estático por NOME de papel, duplicado
identicamente em cada tenant (confirmado: `admin` tem os mesmos 39 `resource:action` em todos os 4
tenants que o possuem) — não há customização por tenant na prática, mesmo a coluna `roles.tenant_id`
existindo.

## Onde `<RequireRole>`/`usePermissions` são usados de verdade (mapa)

Chamadas **vivas** (alcançáveis a partir de `ConsoleV2.jsx`, confirmado via grep de imports):

| Arquivo | Uso | Gate |
|---|---|---|
| `console/AtendimentoAvaliacoes.jsx:771` | `<RequireRole roles={['admin','consultor']}>` | tela inteira de CSAT |
| `console/AuditLog.jsx:141` | `<RequireRole roles={['admin']}>` | tela inteira de auditoria |
| `console/NpsResultados.jsx:382` | `<RequireRole roles={['admin','gestor']}>` | tela inteira de NPS |
| `console/Disparos.jsx:432` | `<RequireRole resource="approve_drafts" action="approve">` | aprovação de disparo em massa |
| `console/LaraEditorial.jsx:387` | `can('lara','approve') \|\| can('lara','execute')` | botão de aprovar/publicar conteúdo |

> **Correção 2026-07-06 (PR #831 follow-up, `wandson/rbac-can-fix`):** a revisão do #831 achou que os
> dois `can()` acima nunca resolviam `true` pra ninguém — `Disparos.jsx` pedia `approve_drafts:execute`
> mas `role_permissions` só tem `approve_drafts:approve` (admin/deli_owner); `LaraEditorial.jsx`/
> `LaraEditorialScreen.jsx` pediam o resource `content` (que não existe) em vez de `lara` (que existe,
> `approve`/`execute`, admin/marketing). Corrigido no client pra bater com os dados reais — não foi
> adicionada nenhuma permissão nova, o catálogo existente já é semanticamente coerente pros dois casos.

Chamadas **mortas** (grep confirma zero importador alcançável — não corrigidas no código consumidor,
só a fonte de dados foi ajustada por consistência):

- `components/Sidebar.jsx` — `Sidebar` nunca é importado por nada em `src/` (ConsoleV2 tem seu próprio
  menu via `moduleCatalog.js`, que não usa `.roles` em nenhum item). `item.roles.some(hasRole)` sempre
  foi um no-op (`item.roles` nunca existe). Não removido nesta PR (fora do escopo do TD reportado) —
  candidato a limpeza futura, igual o caso `Inadimplentes.jsx`/`cobranca` (#771).
- `screens/agents/AgentCard.jsx`, `screens/agents/AgentDetailPanel.jsx` — usam `<RequireAgent>`, mas
  nenhum dos dois é importado de lugar alcançável (`DeliHub.jsx`/`AgentBuilderScreen.jsx` têm seus
  PRÓPRIOS componentes locais `AgentCard`, sem relação).
- `screens/LaraEditorial/LaraEditorialScreen.jsx` — duplicata órfã de `console/LaraEditorial.jsx`
  (mesma lógica, zero importador). Corrigida mesmo assim (mesma linha, custo zero) pra não deixar uma
  cópia inconsistente se algum dia for reativada.

## Fix aplicado

1. **`src/hooks/usePermissions.js`** — assinatura vira `usePermissions(userId, tenantId)` (`tenantId`
   agora obrigatório). As 3 queries passam a filtrar por `tenant_id`:
   - `hasRole`/`can`: em vez de `user_roles.select('role_id, roles(name)').eq('user_id', userId)`, lê
     `tenant_members.select('role').eq('user_id', userId).eq('tenant_id', tenantId)` — **1 papel do
     tenant atual**, nunca um Set agregado de outros tenants. Pra `can()`, o papel (nome) é usado pra
     achar o `role_id` certo em `roles` (filtrando por `tenant_id` + `name`) e então os
     `resource:action` em `role_permissions` — reaproveita o catálogo existente, só troca a origem do
     `role_id` (de `user_roles` órfã pra `tenant_members` + `roles` por nome/tenant).
   - `agentAccess` (`user_agent_access`) e `screenPerms` (`user_screen_permissions`): **mesmo bug**
     (colunas `tenant_id` existem e 100% das linhas populadas já têm valor, mas a query antiga não
     filtrava) — corrigido no mesmo commit por serem a mesma função e a mesma classe de defeito.
     Blast radius atual = zero (únicos consumidores, `RequireAgent`/`Sidebar`, são código morto — ver
     acima), mas já fica correto para quando esse código for reativado.
   - Lógica de derivação (`pickTenantRole`, `buildPermissionSet`, `buildAgentAccessMap`,
     `buildScreenPermsMap`) extraída para `src/hooks/permissions-derive.js` — funções puras, sem
     import de `react`/`supabase`, testáveis em Node puro sem jsdom.
2. **`src/components/auth/RequireRole.jsx`** e **`RequireAgent.jsx`** — aceitam e repassam `tenantId`.
3. **9 call sites vivos** atualizados para passar `tenantId={tenantDbId}` (já disponível em todos —
   nenhum precisou de prop-drilling novo): `AtendimentoAvaliacoes.jsx`, `AuditLog.jsx`,
   `NpsResultados.jsx`, `Disparos.jsx`, `LaraEditorial.jsx` (+ `LaraEditorialScreen.jsx`, morto).

## Testes

`src/hooks/permissions-derive.test.js` (vitest, já configurado no projeto — sem dependência nova, sem
jsdom): 8 casos cobrindo `pickTenantRole` (o ponto central do fix — sem linha em `tenant_members` →
`null`, nunca agrega papel de outro tenant), `buildPermissionSet`, `buildAgentAccessMap`,
`buildScreenPermsMap`.

```
✓ src/hooks/permissions-derive.test.js (8 tests)
Test Files  1 passed (1)
     Tests  8 passed (8)
```

`npm run build` verde após todas as mudanças.

## Decisão maior — sinalizada, não resolvida nesta PR

`user_roles`/`roles`/`role_permissions` continuam existindo e agora são a fonte de **permissões finas**
(`resource:action`) via `can()` — não foram removidas, só deixaram de ser lidas via `user_roles`
(substituída por `tenant_members.role` + `roles` por nome/tenant). Ainda não há NENHUM caminho de
escrita pra `roles`/`role_permissions` no app — são um catálogo estático mantido só por migration/seed
manual. Isso é aceitável enquanto o catálogo não mudar, mas **não há UI pra criar um papel novo ou
ajustar permissões finas** — se o produto precisar disso (ex.: papel customizado por tenant, permissão
granular além do que `tenant_members.role` expressa), alguém vai precisar decidir: (a) construir uma
tela de administração de `roles`/`role_permissions`, ou (b) migrar as ~382 linhas de
`role_permissions` para uma chave direta por nome de papel (sem depender de `roles.tenant_id`, já que
hoje são idênticas por tenant) e aposentar `roles`/`user_roles` de vez. Não decidi isso aqui — é escopo
maior que o TD de segurança reportado.
