# Arquitetura da Stack — Consult Delivery

```mermaid
flowchart TD
    subgraph "Frontend"
        LV["Lovable (React)\nhosteado na Vercel"]
    end

    subgraph "Deploy"
        VCL["Vercel\ndeploy automático via GitHub"]
    end

    subgraph "Backend"
        SB["Supabase\nDB + Auth + Realtime + Edge Functions"]
        INF["Infisical\ngestão de secrets (172.18.0.3:8080)"]
    end

    subgraph "VPS 45.39.210.183"
        direction TB
        OC["OpenClaw 2026.5.2\nporta 18789"]
        BS["Bridge Server\nNode.js porta 3001"]
        N8N["n8n\nautomações"]
        subgraph "Agentes IA"
            direction LR
            DELI["DELI\nCOO / orquestradora"]
            LARA["LARA\nmarketing"]
            CORA["CORA\ncobrança"]
            SOFIA["SOFIA\nSDR"]
            BRENO["BRENO\natendimento"]
            MAX["MAX\nconsultor técnico"]
            VERA["VERA\nBI e relatórios"]
            ANAL["analista-ifood\nCo-piloto Delivery"]
        end
    end

    subgraph "Integrações Externas"
        EVO["Evolution API\nWhatsApp"]
        TG["Bot Telegram\n@DeliConsultBot"]
        ASAAS["Asaas\npagamentos"]
        GDRIVE["Google Drive\ndados das lojas"]
        CLAUDE["Claude API\nclaude-sonnet-4-6"]
    end

    LV -->|"autenticação, dados, realtime"| SB
    LV -->|"webhook de análise"| BS
    SB -->|"edge function callback"| BS
    BS -->|"roda agente CLI"| OC
    OC --> DELI & LARA & CORA & SOFIA & BRENO & MAX & VERA & ANAL
    OC -->|"chamada LLM"| CLAUDE
    BS -->|"lê transcrições"| GDRIVE
    ANAL -->|"resultado JSON"| BS
    BS -->|"POST callback"| SB
    N8N -->|"fluxos automáticos"| SB
    N8N -->|"envio mensagens"| EVO
    EVO -->|"WhatsApp webhooks"| SB
    TG -->|"comandos do bot"| OC
    ASAAS -->|"webhooks de cobrança"| SB
    INF -->|"injeta secrets"| OC
    VCL -->|"CI/CD"| LV
```

## Legenda

| Componente | Papel |
|---|---|
| Lovable + Vercel | Interface do usuário, deploy automático |
| Supabase | Banco de dados, autenticação, realtime, edge functions |
| Bridge Server | Intermediário HTTP entre Supabase e OpenClaw |
| OpenClaw | Runtime dos agentes IA (CLI, porta 18789) |
| Claude API | LLM subjacente a todos os agentes |
| Evolution API | Envio/recebimento de mensagens WhatsApp |
| n8n | Automações de fluxo (webhooks, integrações) |
| Infisical | Cofre de secrets do time (self-hosted) |
| Asaas | Cobrança e pagamentos dos clientes |
| @DeliConsultBot | Interface Telegram para disparar agentes |
