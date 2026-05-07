# LARA — Agente Régua

Agente de CRM food service e régua de disparo da Consult Delivery.
Ativa no OpenClaw desde 06/05/2026. Pipeline completo funcionando desde 07/05/2026.

---

## Identidade

- **Papel:** CRM food service + régua de disparo automatizada
- **Audiência:** equipe interna APENAS (Wélida como usuária principal)
- **Nunca responde cliente final** — tudo via drafts aprovados
- **Sub-agentes:** execução via openclaw LARA em sessão isolada (ver arquitetura abaixo)

## Localização dos artefatos

| Artefato | Caminho |
|---|---|
| System prompt | VPS: `/root/.openclaw/agents/lara/workspace/system_prompt.md` |
| TOOLS.md | VPS: `/root/.openclaw/agents/lara/workspace/TOOLS.md` |
| Bridge dispatch | `bridge-server/index.js` linhas ~149-215 |
| Migration SQL | `supabase/migrations/20260506_001_lara_regua.sql` |
| Frontend | `src/screens/LaraScreen.jsx` |

## Status de implementação (07/05/2026)

- [x] LARA ativa no OpenClaw (06/05/2026)
- [x] `POST /invoke/lara` — frontend → LARA via SSE
- [x] `POST /api/nexus-dispatch/:agent` — LARA → sub-agente async via openclaw
- [x] `GET /api/nexus-status/:request_id` — polling do resultado
- [x] Supabase: trigger auto-cria `loja` ao inserir `customer` no CRM
- [x] Teste E2E completo: pesquisa real da Varanda's (Garanhuns/PE) em ~60s
- [ ] Teste end-to-end pela tela LARA (Wélida usando)
- [ ] Geração de régua completa validada
- [ ] Agentes dedicados por tarefa (nexus-pesquisa, nexus-regua, nexus-midia) — opcional

## Arquitetura dos sub-agentes (decisão 07/05/2026)

**EvoNexus é UI-driven — não API-first.** Tickets criados via API ficam em `status: open` sem processamento automático (sem heartbeat configurado). Webhooks disparam mas resultado fica no chat interno do EvoNexus, inacessível via API.

**Solução adotada:** Bridge Server spawna openclaw LARA em sessão isolada para cada sub-task.

```
LARA principal (OpenClaw)
  → curl POST /api/nexus-dispatch/pesquisa
    → Bridge recebe, registra job em memória
    → Spawna: openclaw agent --agent lara --json --session-id <uuid novo>
    → Responde imediatamente: {"ok":true, "request_id":"..."}
  → LARA faz polling: GET /api/nexus-status/{request_id}
    → status: queued → running → done
    → result: JSON com resultado da pesquisa/régua/mídia
```

EvoNexus webhook ainda dispara (fire-and-forget) para visibilidade no painel.

## Como invocar (produção)

Via frontend (LaraScreen.jsx):
```
POST /invoke/lara
Authorization: Bearer <Supabase JWT>
{"message": "...", "loja_id": "...", "tenant_id": "...", "session_id": "..."}
```

Via Bridge (interno, LARA chamando sub-agentes):
```
POST http://localhost:3001/api/nexus-dispatch/pesquisa
X-Internal-Token: <INTERNAL_BRIDGE_TOKEN>
{"tenant_id":"...","loja_id":"...","payload":{"prompt":"..."}}
```

Polling:
```
GET http://localhost:3001/api/nexus-status/{request_id}
X-Internal-Token: <INTERNAL_BRIDGE_TOKEN>
→ {"status":"done","result":"..."}
```

## Lojas de referência

| Loja | loja_id |
|---|---|
| Varanda's Restaurante & Pizzaria (Garanhuns/PE) | `6a8c6978-8575-45a2-b971-00bd9a81c754` |

## Secrets (bridge-server/.env na VPS)

- `INTERNAL_BRIDGE_TOKEN` — token para LARA chamar o Bridge
- `NEXUS_TICKET_TOKEN` — token EvoNexus (para webhook de visibilidade)
- `NEXUS_TICKET_BASE` — URL EvoNexus: `https://ia.consultdelivery.com.br`

---

*Veja também: [[Deploy de Agentes OpenClaw]], [[Evolution API Webhooks]]*
