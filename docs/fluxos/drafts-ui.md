# Fluxo Drafts UI — Etapa 11

Descreve o ciclo completo de proposta-aprovação de mensagens dos agentes.

```mermaid
flowchart TD
    A([Agente OpenClaw]) -->|INSERT agent_drafts\nstatus = pending| B[(Supabase\nagent_drafts)]

    B -->|Realtime notify| C[DraftsPendentesScreen\nsupabase.channel]

    C --> D{Usuário logado\ntem approve_drafts\nexecute?}
    D -- Não --> E[AccessDenied]
    D -- Sim --> F[Lista de DraftCards]

    F --> G{Ação do usuário}

    G -->|✅ Aprovar| H[approveDraft\nstatus → approved\nreviewer_id + reviewed_at]
    G -->|✏️ Editar| I[EditModal\nupdateDraftContent\nstatus → approved\nedits_made salvo]
    G -->|❌ Rejeitar| J[RejectModal\nrejectDraft\nstatus → rejected\nrejection_reason obrigatório]

    H --> K([Edge Function / Bridge Server\nenvia mensagem no canal])
    I --> K
    J --> L([Draft arquivado\nagente aprende])

    K --> M[(audit_log\nação registrada)]
```

## Canais suportados

| Canal | Cor | Aprovação obrigatória? |
|---|---|---|
| `whatsapp_grupo` | Verde WhatsApp | ✅ Sim |
| `whatsapp_pv` | Verde escuro | ✅ Sim |
| `telegram_interno` | Azul Telegram | ❌ Direto (é para equipe) |
| `painel` | Vermelho CD | ❌ Direto (é para equipe) |

## Componentes envolvidos

- `src/screens/DraftsPendentesScreen.jsx` — tela principal
- `src/lib/api.js` — `listAgentDrafts`, `approveDraft`, `rejectDraft`, `updateDraftContent`, `subscribeToDrafts`
- `src/components/auth/RequireRole.jsx` — guard `approve_drafts:execute`
- `supabase/migrations/20260504_004_drafts_deli.sql` — schema `agent_drafts`