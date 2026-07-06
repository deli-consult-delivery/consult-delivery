# Auditoria de segurança — rodada P2 (2026-07-07)

**Escopo:** tudo em `bridge-server/` e `supabase/migrations/` alterado desde 2026-07-05 (~52 PRs), + grep de segredos em `src/`. Segue a auditoria RLS geral de 177 tabelas (`docs/seguranca/RLS-AUDIT-2026-07.md`, PRs #776/#784, já mergeados).

## 1. Rotas do bridge (15 arquivos alterados desde 07-05)

`bridge-server/{index.js, lib/evolution-instance.js, lib/ifood.js, routes/evolution-actions.js, routes/ifood-api.js, routes/ifood.js}` + 9 arquivos de teste.

- **Toda rota nova/alterada tem middleware de auth** (`requireJwt`, `requireJwtOrInternal`) — conferido via grep de todas as declarações `router.(get|post|put|delete)(` nos 3 arquivos de rota; zero rota sem o segundo argumento de auth.
- **Tenant scoping**: `evolution-actions.js` usa `assertTenantMember` (fechado no #761/follow-up); `ifood-api.js`/`ifood.js` usam `resolveLojaGated`/`resolveTenant`+`assertTenantMember` (padrão já auditado em rodadas anteriores). Nenhuma rota nova introduzida fora desse padrão.
- `bridge-server/routes/inadimplentes.js` apareceu no `git log --since` só porque foi **removido** (#782, cleanup de endpoint órfão) — não é uma rota viva, sem risco.
- **Nenhum achado novo.**

## 2. RLS das tabelas de 06/07

Única migration nova desde a auditoria RLS geral (que cobriu baseline + `_001` a `_017`): `20260706_018_homolog_demo_financeiro_ifood.sql`. Conteúdo: `INSERT ... ON CONFLICT DO UPDATE` em `public.tenant_modules` (habilita o module_key `financeiro-ifood` para `cd-homolog`/`cd-demo`) — **é só dado (upsert), não mexe em nenhuma policy/schema**. `tenant_modules` já constava como corretamente escopado (`OK`) na auditoria anterior.

**Nenhuma tabela nova, nenhuma policy nova desde a última auditoria.** As "rotas gated de Merchant/Financial/Catalog/Reviews, drafts de alteração de preço, RPCs por token" citadas no brief usam tabelas/RPCs já existentes e já auditados (`agent_drafts`, `reviews` com as RPCs `get_review_by_token`/`update_review_by_token` do #757→#764).

## 3. Segredos no front (`src/`)

Grep em todos os 20 arquivos de `src/` alterados desde 07-05: nenhuma chave hardcoded, nenhum novo uso de `import.meta.env.VITE_*` sensível (só `VITE_BRIDGE_URL`, que é uma URL pública, não segredo). `session.access_token` aparece em vários arquivos — é o JWT do próprio usuário logado, padrão já revisado, não é vazamento.

**Nenhum achado novo.**

## 4/5. Fixes e decisões

Nenhum achado P0/P1 novo nesta rodada — nenhuma migration nem PR de código necessários. As pendências que seguem em aberto já estavam documentadas: M4/M5 (path de ajustes financeiros, `docs/integracoes/ifood/homologacao-matriz-financas.md`) e a dúvida de shape de `settlements[]` não-vazio (mesma matriz).
