# cd-hermes-chat-mcp

MCP ponte **Nimbalyst ↔ Hermes** (CON-6). Não é uma tool de ação como os outros MCPs do
Hermes (`ifood`, `asaas`, `evolution`, `admin`, `vendaerp`) — é uma ponte de **conversa**:
deixa o Nimbalyst falar com a DELI ou a Ana como se fosse o chat do Console.

Spec completa: `docs/ai-first/nimbalyst-hermes-mcp-spec.md`.

## Tools
- `talk_to_deli(mensagem)` — conversa com a DELI (COO digital). **Testado contra produção.**
- `talk_to_ana(mensagem)` — conversa com a Ana (assistente pessoal). **Implementado, NÃO
  testável ainda** — depende de (a) endpoint `ana-conversa/run` existir no Bridge/Trigger.dev
  e (b) credenciais dos sistemas pessoais da Ana (nenhuma existe em 2026-07-31, ver
  `docs/ai-first/ana-sistemas-pessoais-acesso.md`).

## Como funciona (achado técnico, não é REST síncrono)
1. Login como a conta de serviço dedicada (`HERMES_CHAT_SERVICE_EMAIL`/`_PASSWORD`) via
   Supabase Auth — vira `session.access_token`, igual a um usuário logado no Console.
2. `POST {BRIDGE_URL}/agents/<agente>-conversa/run` com esse token — só **dispara** a
   execução, não retorna a resposta.
3. Escuta `INSERT` em `deli_messages` (`role=assistant`, `tenant_id=CD_TENANT_ID`) via
   **Supabase Realtime**, com timeout (`CD_MCP_REALTIME_TIMEOUT_MS`, padrão 60s).

## Conta de serviço dedicada (Supabase Auth)
Criada em 2026-07-31 via GoTrue Admin API, direto na VPS (nunca em texto puro em
arquivo/chat — ver `docs/ai-first/HANDOFF-ana-gate0-2026-07-30.md` / incidente CON-3):
- Email: `hermes-chat-mcp@service.consultdelivery.com.br`
- `user_id`: `726e3fbd-6a40-4b85-ae98-ba634f5f8a50`
- Senha: guardada em `/home/claudedev/.secrets/hermes-chat-mcp-service-account.pwd` na VPS
  (modo 600), a mover para o Infisical junto com o resto das envs deste MCP.
- Acesso, via `supabase/migrations/20260731_001_hermes_chat_mcp_service_account.sql`:
  - `tenant_members` (tenant plataforma, role `operador` — menor privilégio disponível no
    CHECK de `tenant_members.role`). Necessário para a policy RLS
    `tenant_members_view_own_deli_messages` (SELECT/Realtime em `deli_messages`) e para
    `audit_log_insert_authenticated` (INSERT em `audit_log`, que só exige `auth.uid() IS NOT NULL`).
  - `user_agent_access` (`agent_name='deli-conversa'`, `can_invoke=true`, escopado só a esse
    agente). **Achado ao testar live-smoke**: o middleware `requireAgentAccess` do Bridge não
    usa o RBAC rico (`roles`/`role_permissions`/`user_roles`, esse é do Console) — checa (1)
    `user_agent_access.can_invoke` por slug exato ou (2) fallback `tenant_members.role` contra
    um mapa `ROLE_AGENT_PREFIXES` onde só `admin`/`owner` cobrem `deli-*`. Em vez de promover a
    conta de serviço a `admin` (acesso total), usamos a via granular: grant explícito só para
    `deli-conversa`. Primeira tentativa (`user_roles` + role `deli_owner` do RBAC do Console)
    não tinha efeito nenhum nesse middleware — corrigido antes do PR, ver commits/migration.

## Env (Infisical, no MCP)
`SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable, não a service key — este MCP autentica
como usuário), `HERMES_CHAT_SERVICE_EMAIL`, `HERMES_CHAT_SERVICE_PASSWORD`, `CD_TENANT_ID`
(tenant plataforma, `9079bd4d-4df7-4023-90fb-d79c8ba7e900`), `BRIDGE_URL` (opcional,
default `http://127.0.0.1:3001`).

## Reservado ao Wandson (VPS)
- Mover a senha da conta de serviço do cofre local (`/home/claudedev/.secrets/`) para o
  Infisical.
- `cd hermes-chat-mcp && npm install`
- `hermes mcp add hermes-chat --env SUPABASE_URL/SUPABASE_ANON_KEY/HERMES_CHAT_SERVICE_EMAIL/HERMES_CHAT_SERVICE_PASSWORD/CD_TENANT_ID`
- `hermes gateway restart`
- Registrar no Nimbalyst (Settings → MCP Servers → Add Server, config manual apontando
  para `node hermes-chat-mcp/src/server.js` na VPS ou via túnel — a confirmar o transporte
  exato na hora do registro, fora de escopo desta implementação).

## Testes
`npm run smoke` (offline, zero rede) · `npm run live-smoke` (Bridge + Supabase reais,
`talk_to_deli` — ativação).

## Decisões em aberto (não resolvidas nesta sessão)
- `talk_to_ana`: bloqueado por dependências externas documentadas acima — código pronto,
  sem endpoint real para testar contra.
- Transporte de registro exato no Nimbalyst (stdio local vs túnel remoto) — spec original
  deixava "a confirmar contra a doc real do Nimbalyst MCP na hora de implementar"; não
  decidi sozinho, fica para quando o Wandson for registrar de fato.
