# DELI — Fluxo de Monitoramento e Autonomia

Diagramas do agente DELI: como escuta eventos, avalia triggers e age conforme o semáforo.

---

## 1. Arquitetura geral

```mermaid
graph TB
    subgraph VPS["VPS 45.39.210.183"]
        BS["Bridge Server\nNode.js :3001"]
        OC["OpenClaw :18789\nAgente DELI"]
        BS -->|startRealtime| RT["Módulo Realtime\nrealtime.js"]
    end

    subgraph Supabase["Supabase (PostgreSQL + Realtime)"]
        WM["whatsapp_messages"]
        LM["loja_metricas"]
        CT["client_timeline"]
        AD["agent_drafts"]
        DT["deli_triggers"]
        PA["deli_pending_approvals"]
        AL["deli_actions_log"]
    end

    subgraph Canais["Canais de entrada"]
        EV["Evolution API\n(WhatsApp)"]
        N8N["n8n\n(métricas iFood)"]
    end

    subgraph Output["Saídas"]
        TG["Telegram\n(Wandson interno)"]
        PL["Painel\n(plataforma)"]
    end

    EV -->|webhook| EF["Edge Function\nevolution-webhook"]
    EF --> WM
    N8N --> LM

    WM -->|INSERT| RT
    LM -->|INSERT| RT
    CT -->|INSERT| RT
    AD -->|UPDATE status| RT

    RT -->|avalia| DT
    RT -->|Verde: executa| AL
    RT -->|Verde: registra| CT
    RT -->|Amarelo/Vermelho| PA

    PA -->|notifica| OC
    OC -->|responde| TG
    OC -->|cria draft| AD

    TG -->|"ok" ou código| BS
    BS -->|"/deli/approve"| RT
    RT -->|executa ação aprovada| AL
```

---

## 2. Fluxo de mensagem WhatsApp recebida

```mermaid
sequenceDiagram
    participant WA as WhatsApp (Evolution)
    participant EF as Edge Function<br/>evolution-webhook
    participant SB as Supabase<br/>whatsapp_messages
    participant RT as Bridge Realtime
    participant DT as deli_triggers
    participant OC as DELI (OpenClaw)
    participant WD as Wandson (Telegram)

    WA->>EF: POST webhook (mensagem recebida)
    EF->>EF: Identifica grupo/PV via JID
    EF->>EF: Upsert whatsapp_contacts
    EF->>EF: Upsert whatsapp_groups (se grupo)
    EF->>EF: Detecta menção (@agente)
    EF->>SB: INSERT whatsapp_messages<br/>(is_mention_to_bot, mentioned_agent)
    SB-->>RT: Realtime INSERT event

    RT->>DT: Avalia triggers habilitados
    alt Trigger Verde matched
        RT->>SB: INSERT client_timeline
        RT->>SB: INSERT deli_actions_log
        RT->>OC: Notifica (heartbeat context)
        OC->>WD: 🟢 "Timeline atualizada — [loja]"
    else Trigger Amarelo matched
        RT->>SB: INSERT deli_pending_approvals
        OC->>WD: 🟡 "Proposta: [ação]. Ok?"
        WD->>OC: "ok"
        OC->>RT: POST /deli/approve {decision: approved}
        RT->>RT: executeApprovedAction()
        RT->>SB: INSERT deli_actions_log
    else Menção a agente (não DELI)
        EF->>RT: POST /analise (enqueue invoke)
        RT->>OC: openclaw agent --agent analista-ifood
    end
```

---

## 3. Semáforo de autonomia DELI

```mermaid
flowchart LR
    EV[Evento detectado] --> AV{Avalia trigger}

    AV -->|autonomy_level = verde| VE[🟢 Verde]
    AV -->|autonomy_level = amarelo| AM[🟡 Amarelo]
    AV -->|autonomy_level = vermelho| VR[🔴 Vermelho]

    VE --> EX[Executa imediatamente]
    EX --> AL1[(deli_actions_log)]
    EX --> WD1[Notifica Wandson<br/>após execução]

    AM --> PA1[(deli_pending_approvals)]
    PA1 --> WD2[Wandson recebe proposta]
    WD2 -->|responde 'ok'| APR[/deli/approve]
    APR --> EX2[Executa ação]
    EX2 --> AL2[(deli_actions_log)]

    VR --> PA2[(deli_pending_approvals)]
    PA2 --> WD3[Wandson recebe alerta crítico]
    WD3 -->|responde 'APROVADO VERMELHO apr-xxx'| APR2[/deli/approve + código]
    APR2 --> EX3[Executa ação de alto impacto]
    EX3 --> AL3[(deli_actions_log)]

    style VE fill:#22c55e,color:#fff
    style AM fill:#f59e0b,color:#fff
    style VR fill:#ef4444,color:#fff
```

---

## 4. Restrição de canais DELI

```mermaid
graph LR
    DELI["DELI\n(COO Digital)"]

    DELI -->|"✅ pode"| TI["telegram_interno\nchat_id: 8745522380"]
    DELI -->|"✅ pode"| PL["painel\n(agent_drafts channel='painel')"]
    DELI -->|"❌ nunca"| WG["whatsapp_grupo\n(clientes)"]
    DELI -->|"❌ nunca"| WP["whatsapp_pv\n(clientes)"]

    style TI fill:#22c55e,color:#fff
    style PL fill:#22c55e,color:#fff
    style WG fill:#ef4444,color:#fff
    style WP fill:#ef4444,color:#fff
```

---

## 5. Estrutura do agente DELI no OpenClaw

```mermaid
graph TD
    subgraph VPS["/root/.openclaw/agents/deli/"]
        WS["workspace/"]
        WS --> AG["AGENTS.md — regras e Red Lines"]
        WS --> SO["SOUL.md — personalidade"]
        WS --> US["USER.md — Wandson (único usuário)"]
        WS --> SP["system_prompt.md — queries SQL, fluxo técnico"]
        WS --> RE["README.md — visão geral"]
    end

    OC["OpenClaw :18789"] -->|"openclaw agents add deli"| VPS
    TG["Telegram\n(@DeliConsultBot)"] -->|"chat_id: 8745522380 only"| OC
```

---

_Gerado em 04/05/2026. Atualizar quando novos triggers ou canais forem adicionados._
