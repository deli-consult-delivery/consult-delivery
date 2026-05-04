# Fluxo — Módulo Análise iFood

```mermaid
flowchart TD
    A([Consultor abre\ntela Análise iFood]) --> B[Seleciona cliente\ndo CRM]
    B --> C[Cola link\nGoogle Drive da loja]
    C --> D[Escolhe período\nDiária / Semanal / Mensal]
    D --> E[Clica\nIniciar Análise]

    E --> F{Tem transcrição\nlocal?}
    F -->|Sim| G[Lê arquivo .txt/.md\ndo servidor VPS]
    F -->|Não| H{Tem\nGOOGLE_API_KEY?}
    H -->|Sim| I[Busca arquivos\nvia Drive API]
    H -->|Não| J[Tenta scraping\npasta pública Drive]

    G & I & J --> K[Bridge Server\nmonta prompt + instruções]

    K --> K1["Instruções injetadas:
    - Correção ortográfica
    - Tom: perspectiva Consult Delivery
    - Sem estimativas de tempo
    - Correções aprendidas do tenant"]

    K1 --> L[OpenClaw CLI\nanalista-ifood]
    L --> M[Claude API\nclaude-sonnet-4-6]
    M --> L
    L --> N[Retorna JSON\nestruturado]

    N --> O{JSON\nválido?}
    O -->|Sim| P[Bridge Server\nposta resultado no Supabase]
    O -->|Não| Q[Salva texto bruto\n+ extrai mensagem_whatsapp]
    Q --> P

    P --> R[Edge Function\nanalista-callback\natualiza status → done]
    R --> S[Supabase Realtime\nnotifica frontend]
    S --> T[AnaliseResultado\nexibe na tela]

    T --> U{Ações disponíveis}
    U --> V[Selecionar pontos\ne enviar WhatsApp\nvia Evolution API]
    U --> W[Exportar críticos\npara Kanban]
    U --> X[Reportar erro\npor bloco\nsalva em agent_corrections]
    U --> Y[Sugerir melhoria\nà plataforma]

    V --> Z([Cliente recebe\nmensagem WhatsApp])
    W --> AA([Task criada\nno KanbanScreen])
    X --> AB([Correção injetada\nna próxima análise])
```

## Tabela de responsabilidades

| Etapa | Onde acontece | Arquivo principal |
|---|---|---|
| Formulário | Frontend (Lovable) | `src/screens/AnaliseiFoodScreen.jsx` |
| Disparo do job | Frontend → Bridge via HTTP | `src/screens/AnaliseiFoodScreen.jsx` |
| Busca de dados | Bridge Server | `.openclaw/bridge-server/index.js` |
| Execução do agente | VPS / OpenClaw | agente `analista-ifood` |
| Callback de resultado | Edge Function | `supabase/functions/analista-callback/` |
| Exibição e ações | Frontend | `src/components/AnaliseResultado.jsx` |
| Correções aprendidas | Supabase `agent_corrections` | `src/components/AgenteFeedbackModal.jsx` |
