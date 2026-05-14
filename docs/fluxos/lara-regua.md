# Fluxo — LARA Agente Régua de Disparo

> Documento de arquitetura da LARA (especialista em CRM food service e régua de disparo).
> Localização do agente: OpenClaw 2026.5.2 — VPS 187.127.25.24:18789
> Versão: 1.0 — 06/05/2026

---

## 1. Visão geral (alto nível)

```mermaid
flowchart LR
    UI[Aba Régua/Disparo<br/>React] -->|chat| BS[Bridge Server :3001]
    BS -->|invoke| OC[OpenClaw VPS:18789]
    OC -->|agente| LARA[LARA<br/>orquestradora]

    LARA -->|tool: pesquisa| NX1[Nexus<br/>Sub-agente Pesquisa]
    LARA -->|tool: regua| NX2[Nexus<br/>Sub-agente Régua]
    LARA -->|tool: midia| NX3[Nexus<br/>Sub-agente Mídia]

    NX1 -.callback async.-> CB[/api/nexus-callback/]
    NX2 -.callback async.-> CB
    NX3 -.callback async.-> CB
    CB -->|persist| SB[(Supabase<br/>marca_pesquisa<br/>reguas<br/>campanhas<br/>campanha_ativos)]
    SB -->|realtime| UI

    LARA -->|drafts| DR[(agent_drafts)]
    LARA -->|fatos| CF[(client_facts<br/>client_timeline)]
    LARA -->|log| AL[(audit_log)]
```

---

## 2. Sequência detalhada — geração de régua nova

```mermaid
sequenceDiagram
    autonumber
    participant W as Wélida
    participant UI as Aba Régua
    participant BS as Bridge Server
    participant L as LARA (OpenClaw)
    participant N1 as Nexus-Pesquisa
    participant N2 as Nexus-Régua
    participant N3 as Nexus-Mídia
    participant CB as nexus-callback
    participant DB as Supabase

    W->>UI: "preciso de régua para Loja X"
    UI->>BS: POST /invoke/lara
    BS->>L: forward com JWT + contexto
    L->>W: "Vou precisar de alguns dados..."

    Note over W,L: ONBOARDING (manual nesta v1)
    W->>L: cola dados da loja
    L->>DB: SELECT lojas, client_facts (loja já conhecida?)

    Note over L,N1: ETAPA 1 - PESQUISA PROFUNDA
    L->>BS: tool nexus_pesquisa(loja_id, dados_iniciais)
    BS->>N1: webhook async
    N1-->>CB: callback {pesquisa_id, documento_jsonb}
    CB->>DB: INSERT marca_pesquisa
    DB-->>L: realtime notify
    L->>W: "Pesquisa concluída — quer revisar antes da régua?"
    W->>L: "ok, segue"

    Note over L,N2: ETAPA 2 - GERA RÉGUA
    L->>BS: tool nexus_regua(pesquisa_id)
    BS->>N2: webhook async
    N2-->>CB: callback {regua_id, campanhas[]}
    CB->>DB: INSERT reguas + campanhas
    DB-->>L: realtime notify
    L->>W: "Régua de 90 dias pronta. 28 campanhas. Aprovar antes de gerar mídias?"
    W->>L: "aprovar régua"

    Note over L,N3: ETAPA 3 - GERA MÍDIAS (loop por campanha)
    loop para cada campanha aprovada
        L->>BS: tool nexus_midia(campanha_id)
        BS->>N3: webhook async
        N3-->>CB: callback {ativos[3]}
        CB->>DB: INSERT campanha_ativos
    end
    DB-->>UI: realtime: dashboard atualiza

    L->>DB: INSERT agent_drafts (pacote completo)
    L->>W: "Pacote pronto. Drafts criados, aguardando aprovação."
    L->>DB: INSERT client_timeline (regua_gerada)
```

---

## 3. Estados da Régua

```mermaid
stateDiagram-v2
    [*] --> rascunho: LARA cria
    rascunho --> revisao: pesquisa concluída
    revisao --> aprovada: Wélida aprova régua (sem mídias ainda)
    aprovada --> em_geracao: dispara geração de mídias
    em_geracao --> revisao_midias: Nexus retornou todas mídias
    revisao_midias --> em_execucao: Wélida aprova drafts no Repediu/Retorne
    em_execucao --> concluida: 90 dias passaram
    revisao_midias --> rascunho: rejeitar e refazer
    aprovada --> rascunho: rejeitar antes de gerar
```

---

## 4. Comunicação LARA ↔ Nexus (assíncrona)

| Etapa | Tool LARA chama | Endpoint Nexus | Callback recebe |
|---|---|---|---|
| Pesquisa | `nexus_pesquisa` | `POST {NEXUS_BASE}/agents/pesquisa/run` | `marca_pesquisa` salvo |
| Régua | `nexus_regua` | `POST {NEXUS_BASE}/agents/regua/run` | `reguas` + `campanhas` salvos |
| Mídia (1 por campanha) | `nexus_midia` | `POST {NEXUS_BASE}/agents/midia/run` | `campanha_ativos` (3 variações) salvo |

**Webhook único de retorno:** `https://app.consultdelivery.com.br/api/nexus-callback`

**Autenticação do callback:** header `X-Nexus-Signature` (HMAC-SHA256 com secret compartilhado, armazenado no Infisical).

---

## 5. Permissões (RBAC)

| Papel | lara:invoke | lara:approve_drafts |
|---|:---:|:---:|
| admin | ✅ | ✅ |
| marketing (Wélida) | ✅ | ✅ |
| atendimento | | |
| dev | | |
| financeiro | | |

Configurado em `user_agent_access` (vide `supabase/migrations/20260504_001_rbac.sql`).

---

## 6. Memória da LARA

| Camada | Onde vive | Conteúdo |
|---|---|---|
| Curto prazo (sessão) | OpenClaw context window | Conversa atual com a Wélida |
| Médio prazo (cliente) | `client_facts` + `client_timeline` | Fatos sobre a loja (tom de voz, produto carro-chefe, sazonalidade) |
| Longo prazo (régua) | `marca_pesquisa` + `reguas` + `campanhas` + `campanha_ativos` | Pesquisa profunda + régua estruturada + mídias |
| Aprendizado entre lojas | `client_facts` com `category='lara_aprendizados'` | O que funcionou bem em outras lojas (heurísticas) |

LARA SEMPRE consulta `client_facts` ANTES de iniciar onboarding — se a loja já existe, não pede dados que já tem.

---

## 7. Pontos de falha conhecidos e mitigação

| Risco | Mitigação |
|---|---|
| Nexus demora muito (>5min) | Callback assíncrono. LARA avisa "Nexus está processando, te aviso quando terminar." |
| Imagem da Mídia volta com produto que não é o da loja | Validação no callback: comparar `produto_destaque` da campanha vs alt-text/metadados da imagem |
| 30 campanhas × 3 mídias = 90 imagens (custo alto) | Pausa obrigatória em "régua aprovada" antes de gerar mídias. Wélida pode reduzir escopo |
| Wélida aprovou régua mas Nexus está fora do ar | Estado `em_geracao` + retry com backoff exponencial (3 tentativas) |
| Alucinação em CNPJ ou dados de contato | Regra de prompt: "se dado não foi fornecido, escreve 'dado não coletado'. NUNCA inventa." |

---

*Documento gerado em 06/05/2026. Atualizar quando arquitetura mudar.*
