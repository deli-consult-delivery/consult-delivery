# Arquitetura da Stack — Consult Delivery

```mermaid
flowchart TD
    subgraph "Frontend — React 18 + Vite"
        APP["App.jsx\nroteamento + auth"]
        SCREENS["Telas\nDashboard, Chat, Tasks,\nCORA, Agents, Drafts..."]
        RBAC_UI["RequireRole / RequireAgent\nguards de acesso nas telas"]
        APP --> SCREENS
        SCREENS --> RBAC_UI
    end

    subgraph "Deploy"
        GHA["GitHub Actions\nCI/CD — build + push"]
        GHP["GitHub Pages\napp.consultdelivery.com.br"]
        GHA --> GHP
    end

    subgraph "Backend — Supabase"
        AUTH["Auth\nJWT + sessão"]
        DB["PostgreSQL\nRLS multi-tenant"]
        RT["Realtime\nsubscriptions"]
        EF["Edge Functions\nevolution-webhook\nanalista-callback"]
        STG["Storage\nassets públicos"]

        subgraph "Schema"
            direction LR
            CORE["tenants, tenant_members\nconversations, messages, tasks"]
            RBAC_DB["roles, user_roles\nrole_permissions\nuser_agent_access\naudit_log"]
            MEM["lojas, client_facts\nclient_timeline, loja_metricas"]
            WA_DB["whatsapp_contacts\nwhatsapp_groups\nwhatsapp_group_members\nwhatsapp_messages"]
            DELI_DB["agent_drafts\ndeli_triggers\ndeli_pending_approvals\ndeli_actions_log"]
        end
    end

    subgraph "VPS 45.39.210.183"
        direction TB
        OC["OpenClaw 2026.5.2\nporta 18789"]
        BS["Bridge Server\nNode.js porta 3001"]
        N8N["n8n\nautomações"]
        INF["Infisical\nself-hosted 172.18.0.3:8080"]
        subgraph "Agentes OpenClaw"
            direction LR
            DELI_AG["DELI\nCOO — ativa"]
            ANAL["analista-ifood\nativo"]
            PLAN["LARA / CORA / SOFIA\nplanejados"]
        end
        BS -->|"JWT + audit"| OC
        OC --> DELI_AG & ANAL & PLAN
        INF -->|"secrets"| OC
    end

    subgraph "Integrações Externas"
        EVO["Evolution API\nWhatsApp"]
        TG["@DeliConsultBot\nTelegram"]
        ASAAS["Asaas\npagamentos"]
        GDRIVE["Google Drive\ntranscrições"]
        CLAUDE_API["Claude API\nclaude-sonnet-4-6"]
    end

    APP -->|"auth + dados + realtime"| AUTH & DB & RT
    APP -->|"invoke agente"| BS
    GHA -->|"CI/CD"| GHP
    EF -->|"callback análise"| BS
    BS -->|"chamada LLM"| OC
    OC -->|"LLM"| CLAUDE_API
    BS -->|"lê transcrições"| GDRIVE
    N8N -->|"fluxos"| DB
    N8N -->|"envio"| EVO
    EVO -->|"webhooks"| EF
    TG -->|"comandos"| OC
    ASAAS -->|"webhooks cobrança"| EF
    RT -->|"eventos Realtime"| BS
    BS -->|"avalia triggers"| DELI_AG
```

## Legenda

| Componente | Papel |
|---|---|
| React 18 + Vite | Interface SaaS multi-tenant |
| GitHub Actions → Pages | CI/CD + hospedagem (app.consultdelivery.com.br) |
| Supabase | BD, auth, realtime, edge functions, storage |
| Bridge Server | Intermediário HTTP entre Supabase e OpenClaw |
| OpenClaw | Runtime dos agentes IA (porta 18789) |
| Claude API | LLM base de todos os agentes |
| Evolution API | Envio/recebimento WhatsApp |
| n8n | Automações e integrações |
| Infisical | Cofre de secrets (self-hosted) |
| Asaas | Cobrança e pagamentos |
| @DeliConsultBot | Interface Telegram para comandos |
