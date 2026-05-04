# Modelo WhatsApp — Contacts, Groups, Messages

## Regras de negócio

- 1 número oficial Evolution API por tenant
- 1 grupo por loja cliente (ex: "Consultoria - Pizza do Zé")
- PVs: clientes que chamam diretamente no privado
- Múltiplos remetentes num grupo: dono, sócios, gerentes, equipe Consult Delivery
- **DELI monitora tudo, mas NUNCA responde grupos ou PVs de cliente**
- Agentes só agem quando são **@mencionados** (ex: `@analista faz análise`)
- Resumos internos: `@DELI resume últimos 3 dias` → vai para canal interno da equipe

## Schema de tabelas

```mermaid
erDiagram
    lojas {
        uuid id PK
        text nome
        text segmento
    }
    whatsapp_contacts {
        uuid id PK
        uuid tenant_id FK
        text jid
        text nome
        text telefone
        uuid loja_id FK
        text tipo
    }
    whatsapp_groups {
        uuid id PK
        uuid tenant_id FK
        text group_jid
        text nome
        uuid loja_id FK
        boolean ativo
    }
    whatsapp_group_members {
        uuid group_id FK
        uuid contact_id FK
        boolean is_admin
        timestamptz joined_at
    }
    whatsapp_messages {
        uuid id PK
        uuid tenant_id FK
        text message_id
        uuid group_id FK
        uuid contact_id FK
        uuid conversation_id FK
        boolean is_group
        text direction
        text body
        text media_type
        boolean is_mention_to_bot
        text mentioned_agent
        boolean processed_by_deli
        timestamptz created_at
    }

    lojas ||--o{ whatsapp_contacts : "associa"
    lojas ||--o{ whatsapp_groups : "tem grupo"
    whatsapp_groups ||--o{ whatsapp_group_members : "membros"
    whatsapp_contacts ||--o{ whatsapp_group_members : "participa"
    whatsapp_groups ||--o{ whatsapp_messages : "mensagens do grupo"
    whatsapp_contacts ||--o{ whatsapp_messages : "remetente"
```

## Fluxo do evolution-webhook

```mermaid
flowchart TD
    EVO["Evolution API\nwebhook POST"] --> EF["Edge Function\nevolution-webhook"]

    EF --> CHECK_JID{JID termina em...}
    CHECK_JID -->|"@g.us"| GRUPO["É GRUPO"]
    CHECK_JID -->|"@s.whatsapp.net"| PV["É PV / privado"]

    GRUPO --> UPSERT_GROUP["UPSERT whatsapp_groups\n+ associar loja_id"]
    GRUPO --> UPSERT_CONTACT["UPSERT whatsapp_contacts\n(remetente)"]
    UPSERT_GROUP --> MENTION{Mencionou\nagente?}
    PV --> UPSERT_PV_CONTACT["UPSERT whatsapp_contacts\n(tipo: cliente)"]
    UPSERT_PV_CONTACT --> INSERT_MSG2["INSERT whatsapp_messages\nis_group=false"]

    MENTION -->|"sim — ex: @analista"| INSERT_MSG1["INSERT whatsapp_messages\nis_mention_to_bot=true\nmentioned_agent='analista-ifood'"]
    MENTION -->|"não"| INSERT_MSG_PLAIN["INSERT whatsapp_messages\nis_mention_to_bot=false"]

    INSERT_MSG1 --> INVOKE["POST Bridge Server\n/invoke/{mentioned_agent}"]
    INVOKE --> OC["OpenClaw executa agente"]

    INSERT_MSG_PLAIN --> DELI_EVAL["DELI avalia via\nRealtime subscription"]
    INSERT_MSG2 --> DELI_EVAL
```

## JID — identificadores WhatsApp

| Formato | Tipo | Exemplo |
|---|---|---|
| `55119...@s.whatsapp.net` | Contato individual / PV | cliente no privado |
| `5511999...@g.us` | Grupo | grupo da loja |
| `55119...@broadcast` | Lista de transmissão | (não tratado atualmente) |
