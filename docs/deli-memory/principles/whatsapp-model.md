# Modelo WhatsApp

Schema: `supabase/migrations/20260504_003_whatsapp.sql`
Edge Function: `evolution-webhook` (Supabase)

## Realidade da operação

- 1 número oficial Evolution API
- 1 grupo por loja cliente (ex: "Consultoria - Pizza do Zé")
- PVs separados (cliente no PV = conversa independente)
- Múltiplos remetentes no grupo: dono, esposa, sócio, gerente, equipe Consult
- DELI MONITORA mas NUNCA RESPONDE grupos/PVs de cliente
- Agentes só agem quando @mencionados (ex: `@analista faz análise`)
- Resumo sob demanda: `@DELI resume últimos 3 dias` → vai para canal INTERNO

## Tabelas

- `whatsapp_contacts` — contatos cadastrados
- `whatsapp_groups` — grupos (JID @g.us)
- `whatsapp_group_members` — membros por grupo
- `whatsapp_messages` — mensagens com origin, direction, type

## Lógica da evolution-webhook

```
JID terminando em @g.us      → grupo → associar a whatsapp_groups + loja
JID terminando em @s.whatsapp.net → PV individual
Detecta menção a agente (regex) → enfileira invoke no Bridge Server
```

## Regra de ouro

DELI monitora tudo. NUNCA responde cliente. Só envia para canais internos (`telegram_interno` ou `painel`).
Qualquer mensagem para cliente passa pelo fluxo de draft → aprovação → envio.

## Observações operacionais

- Evolution API fetchAllGroups é lenta/instável → usar Supabase como fonte primária (QA Pattern P3)
- Webhook pode chegar fora de ordem → idempotência obrigatória nas inserções
