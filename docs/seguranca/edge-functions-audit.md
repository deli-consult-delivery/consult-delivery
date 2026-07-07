# Auditoria de segurança — Edge Functions (2026-07-07)

## Tabela função × critério × veredito

| Função | 1. Auth | 2. Validação input | 3. Tenant scoping | 4. Segredos |
|---|---|---|---|---|
| `evolution-webhook` | 🔴 **Nenhuma verificação de assinatura/secret** — `index.ts:35-36` só checa método POST, sem checar header/secret do Evolution. Único "gate" é a instância existir (`instance_name`, linhas 48-52) | ✅ try/catch (38, 112-115), checagem manual por handler (ex. `!msgData?.key` linha 125), sem crash/leak | ✅ `tenant_id` vem de lookup em `evolution_instances` por `instance_name` (linha 72), não confia no body — mas combinado com 🔴 do item 1, quem souber um `instance_name` existente forja eventos pro tenant dele | ✅ `Deno.env` correto (11-12,15-16); nenhum log de valor de secret |
| `manage-users` | ✅ JWT obrigatório, valida via `auth.getUser()` (56-62) | ✅ try/catch no JSON (65-66), checagem manual por ação | ✅ Valida `caller` é owner/admin do `tenant_id` via `tenant_members` (72-81) — não confia cegamente | ✅ `Deno.env` correto; logs só id/email/role, nunca segredo |
| `persist-profile-pic` | ✅ JWT obrigatório (29-35) | 🟡 erro devolvido ao cliente inclui `err.message` (linha ~134) — vaza texto de erro interno, não stack trace completo | 🔴→✅ **Corrigido nesta auditoria** (era: zero checagem, qualquer autenticado sobrescrevia `push_photo_url` de conversa de outro tenant) | ✅ `Deno.env` correto; log não imprime secret |
| `dispatch-push-notification` | 🔴 **Nenhuma autenticação** — só CORS, sem JWT/secret check | ✅ checagem manual (`tenant_id`/`target_user_ids` obrigatórios), try/catch, mas erro devolve `String(err)` (linha 103) | 🔴 **`tenant_id` confiado direto do body** (linhas 28-29, 63), sem verificar que o caller pertence a esse tenant | ✅ VAPID keys via `Deno.env`; log não imprime chave |
| `breno-confirmar` | 🔴 **Nenhuma autenticação** — só `triagem_id`+`acao` como query params | ✅ valida `acao` contra enum fixo (linha 8), sem crash | 🟡 **Ambíguo, não confirmado**: guard `.eq('confirmado', false)` (linha 25) impede replay após 1º uso, mas se `triagem_id` for sequencial (não token aleatório), é enumerável — não confirmei o tipo da PK de `breno_triagem` nesta rodada (tempo) | ✅ `Deno.env` correto |
| `analista-callback` | ✅ Valida `x-bridge-secret` contra `Deno.env.get('BRIDGE_SECRET')` (linhas 17-20) | ✅ try/catch (22, 52), checagem manual de `job_id` (26) | ✅ N/A — atualiza por `job_id` único gerado server-side, sem tenant_id no payload | ✅ `Deno.env` correto; log não imprime secret |

## Achados e ações

### 🔴 P0/P1 corrigido nesta PR
- **`persist-profile-pic`** — IDOR de tenant scoping. Fix: adiciona lookup `conversations.tenant_id` + checagem de `tenant_members` antes de processar (mesmo padrão `assertTenantMember` já usado no Bridge). Não muda o contrato com o front (que já envia JWT) nem com a Evolution.

### 🔴 P0/P1 documentado — requer decisão, NÃO corrigido nesta rodada
- **`evolution-webhook`** — sem verificação de assinatura/secret do Evolution. Corrigir exigiria: (a) confirmar se o Evolution API self-hosted suporta enviar um secret/assinatura configurável nos webhooks (não verificado), (b) coordenar a mudança de configuração no Evolution real (produção, webhook vivo) simultaneamente ao deploy da function — risco de quebrar o recebimento de mensagens em produção se malfeito. **Não tentei — webhook vivo, fora do orçamento seguro desta sessão.** Mitigação parcial já existente: tenant scoping via lookup real (não confia em `tenant_id` do payload), então o pior caso é forjar eventos *dentro* de um tenant cujo `instance_name` o atacante descobriu — não vaza dado de outro tenant diretamente, mas pode disparar ações (ex. `handleAprovacaoSession`).
- **`dispatch-push-notification`** — zero auth + `tenant_id` confiado do body. Fix natural seria exigir JWT + `assertTenantMember`-equivalente (mesmo padrão de `manage-users`) — não é mudança de contrato externo, mas não coube nesta rodada (contexto). **Recomendo próxima tarefa dedicada.**
- **`breno-confirmar`** — possível enumeração de `triagem_id` (não confirmado se é UUID ou serial). Verificar o tipo da coluna antes de decidir se precisa de token opaco.

## Regras seguidas
Nenhuma Edge Function foi deployada. Nenhum SQL aplicado. Nenhum segredo impresso (grep e leitura só confirmaram *nomes* de env vars, nunca valores). `evolution-webhook` não foi alterado.
