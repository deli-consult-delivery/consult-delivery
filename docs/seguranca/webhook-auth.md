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

**⚠️ Risco residual (aceito, não é bug):** um secret em query string aparece em **logs de acesso** (nginx/proxy/CDN na frente do Supabase, logs do próprio Evolution ao registrar a URL configurada, histórico de terminal de quem configurou). Diferente de um header, query string é rotineiramente logada por infraestrutura HTTP padrão. Mitigação: tratar qualquer log que contenha essa URL como sensível (não colar em canais abertos, não commitar); se o valor vazar (log exposto, print compartilhado etc.), **rotacionar** (gerar novo valor + repetir os 2 passos de ativação). Não há alternativa melhor disponível sem mudar o Evolution (que não suporta header de assinatura configurável nesta instalação).

## `dispatch-push-notification`

**Problema:** zero autenticação própria no código; só chamada pelo `bridge-server` (`lib/push-notify.js`), nunca pelo front.

**Fix (follow-up desta rodada — FAIL-CLOSED):** reaproveitado o `BRIDGE_SECRET` já existente, mesmo padrão exato de `analista-callback/index.ts:17-20` (`if (!secret || secret !== env) return 401`) — **sempre exige** o header `x-bridge-secret` batendo com `BRIDGE_SECRET`, sem fallback fail-open. Diferente do `evolution-webhook` (que depende de reconfigurar o Evolution, sistema externo), aqui controlamos os dois lados: `bridge-server/lib/push-notify.js` já manda o header desde #830, e quem for deployar esta function é a mesma pessoa que configura o secret — não há janela de "meio-termo" que justifique fail-open. **Consequência prática:** até a orquestradora configurar `BRIDGE_SECRET` nas secrets da function E deployar esta versão, a function seguirá rodando a versão anterior (sem a checagem) em produção — nenhuma mudança de comportamento até o deploy acontecer.

## ATIVAÇÃO (pendente, passos manuais — nenhum executado nesta sessão)

1. `supabase secrets set EVOLUTION_WEBHOOK_SECRET=<valor gerado>` (projeto Supabase)
2. `supabase secrets set BRIDGE_SECRET=<mesmo valor já usado no .env do bridge-server na VPS>`
3. Deploy das 2 functions: `supabase functions deploy evolution-webhook` e `supabase functions deploy dispatch-push-notification`
4. Reconfigurar a URL do webhook no painel/API do Evolution para `https://<projeto>.supabase.co/functions/v1/evolution-webhook?secret=<mesmo valor do passo 1>`
5. Confirmar com um evento real do Evolution (ex. mandar mensagem de teste) que o webhook continua funcionando após o passo 4

Ordem importa: passos 1-3 primeiro (fail-closed do push-notification já vale; evolution-webhook segue aceitando tudo pois a URL ainda não tem `?secret=`), depois passo 4 (ativa de fato a checagem do evolution-webhook).

## O que NÃO foi feito
- Nenhuma secret foi gerada, rotacionada ou configurada nas Edge Functions — isso é ação da orquestradora/Wandson (`supabase secrets set ...`).
- Nenhum deploy de Edge Function foi executado.
- Nenhuma mudança na config do Evolution (URL do webhook) foi feita.
