# DELI — COO Digital: Triggers, Semáforo e Drafts

## Identidade e papel

DELI é a COO digital da Consult Delivery. Monitora tudo, orquestra especialistas,
propõe ações com semáforo. **Nunca responde clientes diretamente.**

## Semáforo de autonomia

```mermaid
flowchart LR
    subgraph "🟢 Verde"
        V["DELI executa e reporta\nEx: atualizar timeline,\ngerar resumo interno"]
    end
    subgraph "🟡 Amarelo"
        A["DELI propõe\nWandson aprova com 'ok'"]
    end
    subgraph "🔴 Vermelho"
        R["DELI aguarda\naprovação explícita:\n'APROVADO VERMELHO apr-xxx'"]
    end

    V --> A --> R
```

## Schema de tabelas

```mermaid
erDiagram
    agent_drafts {
        uuid id PK
        uuid tenant_id FK
        text agent_name
        text channel
        text recipient_jid
        uuid loja_id FK
        text subject
        text body
        text status
        text autonomy_level
        uuid approved_by FK
        timestamptz approved_at
        timestamptz sent_at
    }
    deli_triggers {
        uuid id PK
        uuid tenant_id FK
        text nome
        text event_type
        text condition_sql
        text autonomy_level
        boolean ativo
    }
    deli_pending_approvals {
        uuid id PK
        uuid tenant_id FK
        uuid draft_id FK
        uuid trigger_id FK
        text autonomy_level
        text summary
        jsonb context_json
        text status
        uuid resolved_by FK
        timestamptz resolved_at
        timestamptz expires_at
    }
    deli_actions_log {
        bigint id PK
        uuid tenant_id FK
        uuid trigger_id FK
        uuid draft_id FK
        uuid approval_id FK
        text action_type
        text autonomy_level
        text summary
        jsonb metadata
        timestamptz created_at
    }

    deli_triggers ||--o{ deli_actions_log : "dispara"
    agent_drafts ||--o{ deli_pending_approvals : "aguarda"
    agent_drafts ||--o{ deli_actions_log : "registra"
    deli_pending_approvals ||--o{ deli_actions_log : "registra"
```

## Fluxo completo: evento → ação

```mermaid
sequenceDiagram
    participant SB as Supabase Realtime
    participant BS as Bridge Server
    participant DELI as DELI (OpenClaw)
    participant W as Wandson

    SB->>BS: evento (whatsapp_messages / loja_metricas / client_timeline)
    BS->>BS: busca deli_triggers ativos para event_type
    BS->>DELI: envia evento + contexto

    DELI->>DELI: avalia trigger + semáforo

    alt Verde — execução direta
        DELI->>SB: INSERT client_timeline (resumo interno)
        DELI->>SB: INSERT deli_actions_log (action='trigger_fired')
        Note over DELI,W: sem aprovação necessária
    else Amarelo — proposta
        DELI->>SB: INSERT agent_drafts (status='pending', autonomy='amarelo')
        DELI->>SB: INSERT deli_pending_approvals (status='aguardando')
        SB-->>W: notificação na plataforma
        W->>SB: "ok" → status='aprovado'
        SB->>BS: Realtime — draft aprovado
        BS->>DELI: executar ação aprovada
        DELI->>SB: UPDATE agent_drafts (status='sent')
        DELI->>SB: INSERT deli_actions_log (action='draft_sent')
    else Vermelho — aprovação explícita
        DELI->>SB: INSERT deli_pending_approvals (status='aguardando', autonomy='vermelho')
        SB-->>W: alerta vermelho
        W->>SB: "APROVADO VERMELHO apr-xxx"
        Note over W,SB: aprovação com código único
        SB->>BS: Realtime — aprovação confirmada
        BS->>DELI: executar com cautela máxima
    end
```

## Triggers iniciais (seed)

| Trigger | event_type | Semáforo | Ação |
|---|---|---|---|
| Cliente sumiu 7 dias | mensagem_recebida | 🟢 Verde | notificar equipe internamente |
| Mensagem recebida | mensagem_recebida | 🟢 Verde | atualizar client_timeline |
| Métrica caiu 20%+ | metrica_caiu | 🟡 Amarelo | invocar analista-ifood + propor draft |
| Config OpenClaw alterada | config_alterada | 🔴 Vermelho | aguardar APROVADO VERMELHO |

## Canais de saída de drafts

| channel | Aprovação necessária | Destinatário |
|---|:---:|---|
| `whatsapp_group` | obrigatória | grupo da loja cliente |
| `whatsapp_pv` | obrigatória | cliente no privado |
| `telegram_interno` | não (verde passa direto) | canal interno da equipe |
| `painel` | não (verde passa direto) | DraftsPendentesScreen |
