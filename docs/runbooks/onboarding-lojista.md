# Runbook — Onboarding de usuário lojista (store tenant)

Status: **✅ pronto para uso** | Decisão Wandson 2026-07-01 | Projeto Supabase `czyanilrverorwenikqw`

Dar ao dono de cada loja de consultoria um login que enxerga **só a própria loja**. Não requer
código nem migration — a plataforma já suporta. Contexto: as 16 lojas viraram store tenants na
Fase 1b (`docs/tenancy-fase1b-lojas-para-tenant-spec.md`).

## Decisão: lojista = papel `admin` do próprio store

- **Papel `admin`** dá acesso completo às telas da própria loja e é isolado por RLS (o lojista só
  vê os dados do tenant dele). É o único papel "cheio" já suportado ponta a ponta.
- ⚠️ **NÃO usar `owner`.** O CHECK de `tenant_members.role` aceita `owner`, mas o RBAC
  (`role_permissions`) **não tem nenhuma permissão para `owner`** — o lojista logaria e não veria
  nada (falha silenciosa). Idem `operador`. Papéis com permissão: admin(78), consultor(11), viewer(4), etc.

## Pré-condições
- Você (agência) é membro `admin` do store (copiado na Fase 1b, decisão A1) → aparece no switcher e
  pode convidar dentro dele. O convite exige que o caller seja `admin`/`owner` daquele store.
- E-mail real do lojista (um por loja). Sem e-mail, não prossiga — não inventar.

## Passos (Console — app.consultdelivery.com.br)
1. No **switcher de tenant** (topo), selecione o store da loja (ex.: "Café Container").
2. Vá em **Usuários e equipe → Convidar**.
3. E-mail = do lojista · **Nível de acesso = Admin** · Enviar convite.
4. O sistema cria o usuário em `auth.users`, envia e-mail de convite e insere a linha em
   `tenant_members` (store_tenant, user, role=admin). O lojista abre o link, cria a senha
   (tela "Criar sua senha") e entra.

## Verificação (isolamento)
- O lojista, membro de **1 só** tenant, cai no caminho single-tenant do `App.jsx` → vê só a loja dele.
- Conferir no banco:
  ```sql
  select t.name, m.role, m.display_name
  from tenant_members m join tenants t on t.id=m.tenant_id
  where m.user_id = '<user_id_do_lojista>';
  -- deve retornar exatamente 1 linha, o store da loja, role=admin
  ```
- RLS é flat (`is_member_of`) → nenhum acesso a outras lojas/agência. Mesmo teste que passou na Fase 1b.

## Se um dia quiser um papel "Dono" distinto (mais restrito que admin)
Aí sim vira trabalho: (1) inserir role `owner` em `roles`; (2) seed em `role_permissions` (subconjunto
curado); (3) adicionar `owner` ao whitelist do convite em `bridge-server/routes/users.js` (`validRoles`)
e em `src/console/Usuarios.jsx` (`INVITABLE_ROLES`). Fora do escopo atual (decisão: usar `admin`).
