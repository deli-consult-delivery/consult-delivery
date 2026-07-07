# Autenticação de webhooks — evolution-webhook e dispatch-push-notification (2026-07-07)

## `evolution-webhook`

**Problema:** zero verificação de assinatura/secret — qualquer POST com `instance_name` existente era processado.

**Investigação:** este repo não configura mais o webhook do Evolution via código (as funções `setWebhook`/`ensureWebhookConfig` eram mortas e foram removidas em PR anterior) — a URL foi cadastrada manualmente no Evolution em algum momento. O Evolution API (self-hosted, versão em uso) **não envia um header de assinatura configurável** nas chamadas de webhook que este projeto documenta ou usa — não há `x-evolution-signature` nem equivalente no código/docs existentes.

**Trade-off e solução escolhida:** como o Evolution só faz `POST` para a URL cadastrada (preservando query string), o canal de autenticação viável **sem mudar código no Evolution** é um segredo embutido na própria URL: `https://.../functions/v1/evolution-webhook?secret=<valor>`.

- Implementado em `supabase/functions/evolution-webhook/index.ts`: lê `EVOLUTION_WEBHOOK_SECRET` (env da function); se vazio, **pula a checagem** (fail-open — deploy sozinho não quebra o webhook vivo). Se configurado, compara contra `?secret=` da URL recebida; sem bater → 401.
- **Para ativar de verdade** (2 passos, NENHUM é deploy de código):
  1. Configurar a secret da function: `supabase secrets set EVOLUTION_WEBHOOK_SECRET=<valor gerado>` (não gerei/rotacionei nada — é ação da orquestradora/Wandson).
  2. Atualizar a URL do webhook cadastrada na instância Evolution (painel ou API do Evolution) para incluir `?secret=<mesmo valor>`.
- Enquanto o passo 2 não for feito, o webhook continua aceitando qualquer POST (mesmo com a secret configurada, se a URL não tiver o query param, ainda seria 401 — **atenção**: configurar a secret SEM atualizar a URL do Evolution QUEBRA o webhook. Fazer os 2 passos juntos.)

## `dispatch-push-notification`

**Problema:** zero autenticação própria no código; só chamada pelo `bridge-server` (`lib/push-notify.js`), nunca pelo front.

**Fix:** reaproveitado o `BRIDGE_SECRET` já existente (mesmo padrão de `analista-callback`) — header `x-bridge-secret`. Fail-open se `BRIDGE_SECRET` não estiver configurado na function. O `bridge-server/lib/push-notify.js` já foi atualizado nesta mesma PR para enviar o header — como o deploy do Bridge é automático no merge (self-hosted runner), a partir do merge o Bridge já manda o header; a function só passa a EXIGIR o header quando a orquestradora configurar `BRIDGE_SECRET` nas secrets dela (mesmo valor já usado no Bridge) e fizer o deploy manual da function — sem risco de ordem quebrada.

## O que NÃO foi feito
- Nenhuma secret foi gerada, rotacionada ou configurada nas Edge Functions — isso é ação da orquestradora/Wandson (`supabase secrets set ...`).
- Nenhum deploy de Edge Function foi executado.
- Nenhuma mudança na config do Evolution (URL do webhook) foi feita.
