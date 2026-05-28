# MIA — Monitor IA de Conversas — Plano Completo

**Autor:** Wandson Silva (CEO Consult Delivery)
**Última atualização:** 2026-05-28
**Status de implementação:** ✅ MIA-00 BIS, MIA-01, MIA-02, MIA-03, MIA-04 — COMPLETO

---

## Resumo executivo

O MIA monitora conversas WhatsApp entre o time de consultoria e os donos de lojas clientes, extraindo fatos e tarefas via IA (Kimi K2.6 via Ollama Cloud). Sugestões ficam em fila para aprovação humana — nunca são aplicadas automaticamente.

---

## Ondas implementadas

| Onda | Branch | PR | Status |
|---|---|---|---|
| MIA-00 BIS | feat/mia-00bis-smoke-consultor | — (squash local) | ✅ mergeado |
| MIA-01 | feat/mia-01-schema-vinculo | #102 | ✅ mergeado |
| MIA-02 | feat/mia-02-worker-llm | #103 | ✅ mergeado |
| MIA-03 | feat/mia-03-ui-cliente-foco | #104 | ✅ mergeado |
| MIA-04 | feat/mia-04-config-telemetria | #105 | ✅ mergeado |

---

## Arquitetura implementada

```
WhatsApp (Evolution API)
    │ webhook
    ▼
Bridge Server  →  conversations + chat_messages (Supabase)
                       │
                       │ cron */15 * * * * (Trigger.dev)
                       ▼
trigger/agents/monitor-conversas-15min.ts
    │ 1. lê loja_whatsapp_vinculo (monitorar=true)
    │ 2. busca conversas em conversations
    │ 3. pula status='finalizado'
    │ 4. chama LLM (Kimi / fallback Anthropic)
    │ 5. insere em sugestoes_ia (NUNCA direto em client_facts/tarefas_loja)
    │ 6. grava mia_audit_log
    ▼
Supabase Realtime → SugestoesInbox (React)
    │ Humano aprova/edita/rejeita
    ▼
POST /api/sugestoes-ia/:id/aprovar
    → se tipo='fact': INSERT client_facts + client_timeline
    → se tipo='tarefa': INSERT tarefas_loja (criado_por_ia=true)
```

---

## Tabelas criadas (migration 20260603_008)

- `loja_whatsapp_vinculo` — vínculo grupo/contato ↔ loja
- `sugestoes_ia` — caixa de sugestões pendentes
- `mia_audit_log` — audit de privacidade de cada run

**ALTER:** `tarefas_loja.criado_por_ia boolean DEFAULT false`

---

## Rotas bridge (bridge-server/routes/mia-vinculos.js)

```
GET|POST  /api/lojas/:id/whatsapp-vinculo
PATCH|DELETE /api/whatsapp-vinculo/:id
GET       /api/lojas/:id/sugestoes-ia
POST      /api/sugestoes-ia/:id/aprovar
POST      /api/sugestoes-ia/:id/rejeitar
GET|POST  /api/lojas/:id/doc
PATCH|DELETE /api/doc/:fact_id
GET       /api/lojas/:id/mia-audit (admin)
```

---

## Componentes UI (src/components/cliente-foco/)

- `ClienteFocoPanel.jsx` — container com 3 tabs (IA / DOC / Tarefas)
- `SugestoesInbox.jsx` — inbox + Realtime Supabase
- `SugestaoCard.jsx` — card aprovar/editar/rejeitar
- `DocViewer.jsx` — lista client_facts + adição manual
- `TarefasResumo.jsx` — top 5 tarefas abertas

**Integração:** aparece no inspector do ChatScreen quando conversa tem loja vinculada.

---

## Telas de configuração (MIA-04)

- Rota `config-whatsapp-vinculos` → WhatsappVinculosScreen (admin + atendimento)
- Rota `mia-audit` → MiaAuditScreen (admin)

---

## Pendências manuais (Wandson faz)

1. Configurar env vars no Trigger.dev Cloud:
   ```
   LLM_PROVIDER=ollama-cloud
   LLM_MODEL=kimi-k2.6:cloud
   OLLAMA_BASE_URL=https://...
   OLLAMA_API_KEY=sk-...
   ```
2. Aplicar migration `20260603_008_mia_schema_full.sql` em prod
3. Cadastrar primeiros vínculos via `/config-whatsapp-vinculos`
4. Habilitar worker no Trigger.dev dashboard (`mia-monitor-conversas-15min`)
5. Rodar `npx tsx scripts/smoke-kimi-consultor.ts` pra validar Kimi no contexto certo

---

## Anti-padrões respeitados

- ✅ RLS via `tenant_members` (nunca `profiles.tenant_id`)
- ✅ Realtime channels com suffix por componente (`-inbox`)
- ✅ Sem commit de API keys
- ✅ Migrations idempotentes (`IF NOT EXISTS`)
- ✅ Evidência literal em toda sugestão (anti-alucinação)
- ✅ Worker não escreve direto em `client_facts`/`tarefas_loja`
- ✅ Tabela `conversations` (não `chat_conversations`)
- ✅ Lazy getters em todo código Trigger.dev
