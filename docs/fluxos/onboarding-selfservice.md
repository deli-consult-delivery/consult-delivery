# Onboarding self-service de lojista (convite via Console)

## Fluxo atual (antes deste PR)
- **`/onboard`** (skill): gera SQL manual de tenant+user, exige aprovação textual, executado por um operador. Toca `tenants`, `users`(legado)/`tenant_members`, `audit_log`.
- **Convite para tenant JÁ existente**: já era self-service — `src/console/Usuarios.jsx` → `POST /api/users/invite` (`bridge-server/routes/users.js`) → valida que quem chama é `admin`/`owner` do tenant → `POST /auth/v1/invite` (Supabase Auth, e-mail real) → `INSERT tenant_members`. **Não precisou de mudança.**
- **Criar o tenant `store` filho de uma agência**: só existia via SQL manual (`/onboard`) ou via `Clientes.jsx` (tela "Clientes (plataforma)") — que cria tenant **flat** (sem `tenant_type`/`parent_tenant_id`) e **não semeia RBAC** (achado: um admin convidado nesse fluxo cairia em "Acesso negado" em toda tela `<RequireRole>` — mesma classe de bug documentada no runbook `onboarding-cliente-avaliacao.md` Passo 3c). Fora do escopo consertar aqui — registrado para follow-up.

## Fluxo novo (este PR)
1. Admin da **agência** abre "Usuários e equipe" → vê a seção **"Nova loja (self-service)"** (só aparece se `tenants.tenant_type = 'agency'`).
2. Preenche nome da loja + e-mail do admin → `POST /api/tenants/create-store` (bridge):
   - Valida que o caller é `admin`/`owner` da agência (`parent_tenant_id`).
   - `INSERT tenants (tenant_type='store', parent_tenant_id=<agência>)` — a trigger `validate_tenant_hierarchy` (já existente) garante que só agências podem ter lojas filhas.
   - `seed_rbac_system_roles(novo_tenant_id)` (RPC já existente) — sem isso o convite cairia em "Acesso negado".
   - Loga em `audit_log` (tabela já existente).
3. Front encadeia com o **convite já existente**: `POST /api/users/invite {email, role:'admin', tenant_id:<novo>}` — sem código novo de convite.
4. Lojista recebe e-mail real, define senha, entra vendo só a loja dele (herda visibilidade do admin da agência via hierarquia `parent_tenant_id`, sem precisar de linha extra em `tenant_members` para o criador).

## Decisões
- **Nenhuma migration nova.** `seed_rbac_system_roles`, `audit_log`, `tenant_members`, `validate_tenant_hierarchy` já existem — reuso total.
- **Nenhuma chave/segredo no front** — a rota nova usa o mesmo `sbFetch` server-side (service key) já usado por `/api/users/invite`.
- Role do convidado é sempre `admin` (nunca `owner` — decisão travada no runbook `onboarding-lojista.md`: owner não tem RBAC).

## Teste (sem convite real disparado)
Não testado contra e-mail real nesta sessão (regra dura: nenhum convite real). Validação feita por leitura de código + `node --check` nos arquivos do bridge. **Pendente de gate**: rodar 1 dry-run contra `cd-homolog`/`cd-demo` (criar 1 loja de teste + convidar um e-mail de teste do próprio Wandson) antes de considerar pronto para uso com cliente real.

## Pendente (fora de escopo desta entrega)
- Corrigir `Clientes.jsx` (bug real achado: cria tenant flat sem RBAC seed) — mesma classe de problema, tela diferente.
- `npm run build` está falhando por um arquivo pré-existente e não relacionado (`src/console/PainelAvaliacoesConsultor.jsx`, conteúdo corrompido/base64 já em `origin/main`, confirmado via `git diff` vazio nesse arquivo) — não é uma regressão deste PR, mas bloqueia a verificação de build completa do repo hoje.
