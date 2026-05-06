# LARA — Agente Régua

Agente de CRM food service e régua de disparo da Consult Delivery.
Ativa no OpenClaw desde 06/05/2026.

---

## Identidade

- **Papel:** CRM food service + régua de disparo automatizada
- **Audiência:** equipe interna APENAS (Wélida como usuária principal)
- **Nunca responde cliente final** — tudo via drafts aprovados
- **Sub-agentes:** NEXUS-PESQUISA, NEXUS-RÉGUA, NEXUS-MÍDIA (async, callback HMAC-SHA256)

## Localização dos artefatos

| Artefato | Caminho |
|---|---|
| System prompt | `.openclaw/agents/lara/system_prompt.md` |
| Base de regras | `.openclaw/agents/lara/base_regras.yaml` |
| Spec sub-agentes | `.openclaw/agents/lara/nexus_subagents_spec.md` |
| Diagrama de fluxo | `docs/fluxos/lara-regua.md` |
| Migration SQL | `supabase/migrations/20260506_001_lara_regua.sql` |
| Spec Bridge Server | `bridge-server/docs/lara-endpoints.md` |
| Seed RBAC | `supabase/seed/lara_rbac.sql` |

## Status de implementação

- [x] Artefatos no repo (branch `wandson/lara-agente-regua`, commit `4bad97e`)
- [x] LARA ativa no OpenClaw (06/05/2026)
- [ ] Endpoints Bridge Server (`/invoke/lara`, `/api/nexus-dispatch/:agent`, `/api/nexus-callback`) — Yasmin
- [ ] Sub-agentes Nexus implementados — equipe Nexus
- [ ] Aba frontend "Agente de Régua" — Yasmin
- [ ] Piloto com loja real (candidato: Salgados da Mônica)

## Como invocar (hoje)

Via CLI da VPS:
```bash
ssh -i ~/.ssh/vps_openclaw root@45.39.210.183
openclaw agent --agent lara -m "sua mensagem aqui"
```

Via Bridge Server (quando Yasmin implementar):
```
POST /invoke/lara
Authorization: Bearer <INTERNAL_BRIDGE_TOKEN>
{"message": "...", "loja_id": "...", "user_id": "..."}
```

## Secrets necessários (Infisical)

- `NEXUS_API_KEY` — autenticação com Nexus
- `NEXUS_BASE_URL` — URL base dos sub-agentes Nexus
- `NEXUS_CALLBACK_SECRET` — HMAC-SHA256 para callbacks
- `INTERNAL_BRIDGE_TOKEN` — autenticação Bridge Server → OpenClaw

---

*Veja também: [[Deploy de Agentes OpenClaw]], [[Evolution API Webhooks]]*
