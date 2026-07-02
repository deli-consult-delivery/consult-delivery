# Achado de segurança — policies "abertas" (USING true) que anulam isolamento

Data: 2026-07-02. Descoberto durante a Rota B (ao testar `messages`). **Fora do escopo Rota B**
(pré-existentes, não introduzidas pela migração hierárquica). Precisam de revisão/decisão separada.

Policies PERMISSIVE com `qual = true` (e with_check null/true) para `public`/`authenticated` — como
policies permissivas são OR'd, uma dessas **anula qualquer isolamento por tenant** na tabela:

| tabela | policy | cmd | roles | provável intenção |
|---|---|---|---|---|
| messages | messages_auth_all | ALL | authenticated | ⚠️ **vazamento** — qualquer logado vê TODAS as mensagens de TODOS os tenants. Mascara messages_select/insert/update_tenant. Recomendo DROP. |
| reviews | service_full_access | ALL | public | ⚠️ nome diz "service" mas roles=public → aberto a todos. Revisar (deveria ser `to service_role`?). |
| channel_members | allow_all_channel_members | ALL | public | possivelmente intencional (chat interno da equipe, não tenant-scoped). Confirmar. |
| channel_messages | allow_all_channel_messages | ALL | public | idem chat interno. Confirmar. |
| internal_channels | allow_all_internal_channels | ALL | public | idem chat interno. Confirmar. |
| onboarding_wizard_sessions | wizard_sessions_authenticated_select | SELECT | authenticated | fluxo de signup/wizard — pode ser intencional. Revisar escopo. |

## Impacto na validação da Rota B
As conversões da Rota B nessas tabelas estão corretas, mas o **teste de isolamento fica mascarado**
onde há policy aberta (ex.: lojista "viu" 11364 messages por causa de `messages_auth_all`, não por
falha da conversão — `messages` da Karina = 0). Tabelas sem policy aberta (cobrancas, radar_*, tasks,
tenant_modules, etc.) testaram isolamento corretamente.

## Recomendação
Revisão de segurança separada: DROP `messages_auth_all` e corrigir `reviews.service_full_access`
(→ `TO service_role`) são os dois claros. Os `channel_*`/`internal_channels` (chat interno) e o wizard
provavelmente são intencionais — confirmar com Wandson antes de tocar. NÃO alterado nesta sessão.
