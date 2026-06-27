# iFood — Authentication (OAuth 2.0) — capturado 2026-06-27

Base: https://merchant-api.ifood.com.br/authentication/v1.0
Todas as APIs usam **OAuth 2.0 + Bearer token**. Header: `Authorization: Bearer YOUR_ACCESS_TOKEN`.
Token: `type=bearer`, `expiresIn=21600` segundos (**6 horas**). accessToken é um JWT (contém aud/scope/tenantId/merchant_scope/client_id).

## Dois fluxos — DECISÃO DE ARQUITETURA

### Centralized (aplicativos centralizados) — client_credentials
- Use quando o aplicativo **gerencia as próprias lojas** (você controla/opera as lojas, ou é dono).
- Grant: `client_credentials` com `clientId` + `clientSecret` direto → recebe accessToken.
- Mais simples: 1 par de credenciais, sem autorização por lojista.

### Distributed (aplicativos distribuídos) — authorization_code + userCode
- Use quando o app **é público/acessível pela internet** e **precisa de autorização explícita do dono da loja**.
- Tokens não excedem 8.000 caracteres — garantir armazenamento adequado.
- Como funciona: o dono da loja autentica no Portal do Parceiro → autoriza seu app a acessar recursos específicos → app recebe permissão. Só apps aprovados pelo dono acessam.
- **Passo a passo:**
  1. `POST /oauth/userCode` (body `clientId`) → retorna `userCode` (ex: `HJLX-LPSQ`) + `authorizationCodeVerifier`.
  2. Armazenar o `authorizationCodeVerifier` com segurança.
  3. Exibir o `userCode` ao lojista → ele insere no Portal do Parceiro e autoriza.
  4. Trocar por token: `POST /oauth/token` (`grant_type=authorization_code`, clientId, clientSecret, authorizationCode, authorizationCodeVerifier).
  5. Recebe accessToken + refreshToken.
  6. Renovar com `grant_type=refresh_token` (clientId, clientSecret, refreshToken).
- **Revogação:** apenas o usuário que autorizou o app pode revogar o acesso.

## Implicação para Consult Delivery (multi-tenant)
Cada restaurante cliente da CD é dono da PRÓPRIA loja no iFood → o fluxo natural é **Distributed**: cada lojista autoriza o app da CD via userCode no Portal do Parceiro (consentimento explícito, revogável). O accessToken+refreshToken por loja vira credencial por tenant (guardar no Infisical/`ifood_instances` com fallback, espelhando o padrão de `evolution_instances`/`vendaerp_instances`).
Centralized só serve se a CD operar lojas próprias. CONFIRMAR no onboarding de Super Integradora qual fluxo o iFood habilita para o caso PDV multi-loja.

## Endpoints
- POST /oauth/userCode — Requests a user code (distributed)
- POST /oauth/token — Requests an access token (ambos os grants)
