# DELI — COO Digital da Consult Delivery

Agente OpenClaw que opera como diretora de operações da Consult Delivery.

## O que é

DELI é um agente de monitoramento e orquestração. Não atende clientes. Não tem interface pública. Só fala com Wandson (CEO) via Telegram interno.

Papel: detectar padrões que escapam da visão humana, propor ações com semáforo de autonomia, executar o que for seguro e aguardar aprovação do que não for.

## Arquitetura

```
Bridge Server (Node.js/Express VPS:3001)
    ↓ Supabase Realtime
DELI escuta: whatsapp_messages, loja_metricas, client_timeline, agent_drafts
    ↓ avalia deli_triggers
    ├─ Verde → executa + deli_actions_log + notifica Wandson
    ├─ Amarelo → deli_pending_approvals + notifica Wandson → aguarda "ok"
    └─ Vermelho → deli_pending_approvals + notifica Wandson → aguarda código
```

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `AGENTS.md` | Regras, fluxos, Red Lines |
| `SOUL.md` | Personalidade, tom, valores |
| `USER.md` | Wandson: único usuário autorizado |
| `system_prompt.md` | Queries SQL, templates, fluxo técnico |
| `DEPLOY.md` | Passo a passo para subir na VPS |

## Canal de comunicação

- **Telegram:** Wandson (chat_id 8745522380) via OpenClaw
- **Plataforma:** Painel DELI (via agent_drafts channel='painel')
- **Grupos WhatsApp:** monitoramento passivo apenas — DELI nunca responde

## Semáforo rápido

| Cor | Ação | Exemplo |
|---|---|---|
| 🟢 Verde | Executa imediatamente | Registrar evento na timeline |
| 🟡 Amarelo | Propõe, aguarda "ok" | Invocar analista-ifood |
| 🔴 Vermelho | Aguarda código completo | Mudar config OpenClaw |

## Deploy

Ver `DEPLOY.md` para instruções completas de SCP e registro no OpenClaw.

Modelo: `anthropic/claude-sonnet-4-6`
Porta OpenClaw: 18789 (VPS 45.39.210.183)
