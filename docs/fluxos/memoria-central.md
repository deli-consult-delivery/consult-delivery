# Memória Central dos Agentes

Fatos sobre clientes vivem no **Supabase**, não em `memory/*.md` na VPS.
Qualquer agente pode ler e escrever. A memória é compartilhada entre DELI, analista-ifood, CORA, etc.

## Schema de tabelas

```mermaid
erDiagram
    tenants {
        uuid id PK
        text slug
        text name
    }
    lojas {
        uuid id PK
        uuid tenant_id FK
        text nome
        text segmento
        text[] plataformas
        text cidade
        boolean ativo
    }
    client_facts {
        uuid id PK
        uuid loja_id FK
        uuid tenant_id FK
        text agent_name
        text category
        text fact
        smallint confidence
        timestamptz expires_at
        timestamptz updated_at
    }
    client_timeline {
        bigint id PK
        uuid loja_id FK
        uuid tenant_id FK
        text agent_name
        text event_type
        text summary
        jsonb metadata
        timestamptz created_at
    }
    loja_metricas {
        uuid id PK
        uuid loja_id FK
        uuid tenant_id FK
        date data_ref
        numeric faturamento
        int pedidos
        numeric ticket_medio
        numeric avaliacao
        int cancelamentos
        text fonte
        jsonb raw_data
    }

    tenants ||--o{ lojas : "gerencia"
    lojas ||--o{ client_facts : "fatos de"
    lojas ||--o{ client_timeline : "eventos de"
    lojas ||--o{ loja_metricas : "métricas de"
```

## Fluxo de leitura e escrita por agente

```mermaid
sequenceDiagram
    participant OC as OpenClaw (agente)
    participant BS as Bridge Server
    participant SB as Supabase

    Note over OC,SB: ANTES DE AGIR — carregar contexto

    OC->>BS: GET /context/loja/{loja_id}
    BS->>SB: SELECT * FROM client_facts WHERE loja_id = $1
    BS->>SB: SELECT * FROM client_timeline WHERE loja_id = $1\nORDER BY created_at DESC LIMIT 20
    BS->>SB: SELECT * FROM loja_metricas WHERE loja_id = $1\nORDER BY data_ref DESC LIMIT 7
    SB-->>BS: contexto completo
    BS-->>OC: {facts, timeline, metricas}

    Note over OC,SB: APÓS APRENDER — registrar fato novo

    OC->>BS: POST /facts {loja_id, category, fact, confidence}
    BS->>SB: INSERT INTO client_facts ... ON CONFLICT DO UPDATE\nSET value = $fact, updated_at = NOW()
    SB-->>BS: ok

    Note over OC,SB: REGISTRAR EVENTO (append-only)

    OC->>BS: POST /timeline {loja_id, event_type, summary, metadata}
    BS->>SB: INSERT INTO client_timeline (...)
    SB-->>BS: ok
```

## Categorias de fatos (client_facts.category)

| Categoria | Exemplos |
|---|---|
| preferencia | "prefere contato no WhatsApp", "não aceita ligações" |
| restricao | "sem orçamento para tráfego pago", "marca regional" |
| historico | "foi cliente da concorrente X por 2 anos" |
| objetivo | "meta de 200 pedidos/dia em 3 meses" |
| risco | "dono cogitou fechar loja em jan/2026" |

## Tipos de evento (client_timeline.event_type)

| event_type | Criado por |
|---|---|
| analise | analista-ifood |
| cobranca | CORA |
| mensagem | evolution-webhook |
| reuniao | equipe (manual) |
| meta | DELI |
| alerta | DELI / n8n |
