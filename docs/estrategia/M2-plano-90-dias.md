# 📊 M2 — Plano Estratégico de Uso da Plataforma · 90 dias (interno-first)

> **Base factual:** auditoria M1 (`docs/auditoria/AUDITORIA-PLATAFORMA-2026-06.md`, 2026-06-11). Nada aqui assume capacidade que não foi verificada — cada peça do plano referencia o que a auditoria provou existir (G1–G9, B-01..B-09).
> **Prioridade decidida:** consultoria interna primeiro (CD operando clientes); revenda em preparação na onda 3.
> **Quem opera:** Wandson + Lorena (2 pessoas — a Wélida saiu da empresa) + os agentes. O plano é desenhado pra esse tamanho — IA faz o volume, humano aprova e decide.

---

## 0. A tese (uma linha)

A auditoria provou que **a plataforma já cobre G1–G7** (tarefas, conhecimento, régua, dashboards, suporte, conteúdo, prospecção) — o gargalo não é construir mais, é **operar o que existe como rotina disciplinada** e transformar isso em resultado visível pro cliente (retenção) e pra CD (margem em automação).

---

## 1. Pré-requisitos da rotina (semana 1 — fixes que destravam o resto)

Sem isso, partes do plano rodam capengas. São os P1 da auditoria:

| # | Fix | Por que destrava | Status (verificado 2026-06-12) |
|---|-----|------------------|-------------------------------|
| B-04 | Corrigir model id do Estúdio (`openai/gpt-image-2` inválido) | Religa geração de arte (G6) — parada desde 08/06 | ✅ JÁ FEITO — PR #195 (slug `openai/gpt-5.4-image-2`); run `success` em 08/06 03:54 UTC pós-fix |
| B-08 | Alerta de saldo OpenRouter | Evita repetir o apagão de créditos de 29/05 que derrubou Encerramento/Estúdio | 🔧 em execução (sessão 2026-06-12) |
| B-01 | Religar cron `deli-orchestrator-5min` **com anti-spam** | DELI volta a orquestrar de verdade (hoje o cérebro está em manual) | ✅ JÁ FEITO — PRs #305/#306/#308: cron `*/30` + trava anti-spam; 50 runs `success` nas últimas 36h |
| B-02 | Apertar policy de `evolution_instances` | Config do WhatsApp não pode ficar exposta a qualquer autenticado | 🔧 em execução (sessão 2026-06-12) |

*(B-03/B-05/B-06/B-07/B-09 seguem no backlog, onda 2 — não bloqueiam rotina.)*

---

## 2. A rotina operacional da CD (o coração do plano)

### 2.1 Dia típico (Wandson)

| Hora | O quê | Onde / agente |
|------|-------|----------------|
| ~07h | **BomDia** roda sozinho (já roda) → resumo do dia por loja | automático |
| 08h | **Revisar fila de aprovações** (drafts de BRENO/LARA/MIA) — aprovar/editar/rejeitar em lote | Console → Aprovações Unificadas |
| 08h15 | Olhar **Visão Geral** (KPIs) + **Radar**: anomalias de loja (queda de pedidos, avaliação) | Console → visao/radar |
| 08h30 | **Tarefas do dia por loja** (o que precisa ser feito em qual cliente) | Console → tarefas/kanban |
| Durante o dia | Atendimento humano só no que o BRENO escalou; resto é exceção | Chat ao vivo |
| ~21h | **Encerramento** roda sozinho → fechamento do dia | automático |
| Assíncrono | Perguntas de gestão ("como tá a loja X?", "o que ficou pendente?") → **Hermes** no Telegram | copiloto CEO |

### 2.2 Dia típico (Lorena — marketing/CRM)

- Manhã: revisar/aprovar **conteúdo do Estúdio + legendas LARA** (pós B-04) — ela edita, não cria do zero.
- **Régua LARA**: acompanhar drips ativos por tenant, aprovar mensagens da régua (G3 — existe, falta configurar por cliente).
- **CRM**: pipeline + follow-ups que a SOFIA sugerir (G7).
- **MIA**: revisar sugestões de conversa a cada ciclo (já roda 15min) — só as marcadas como relevantes.

### 2.3 Semana típica

| Dia | Ritual | Suporte da plataforma |
|-----|--------|----------------------|
| Seg | Planejamento: tarefas da semana por loja | Kanban + DELI distribui |
| Qua | Revisão de métricas por cliente (15min/cliente nas contas Performance) | Dashboards G4 + VERA |
| Sex | **VERA gera o resumo semanal por cliente** → vira mensagem de valor pro cliente (aprovada antes de enviar) | VERA (83 runs/7d — já produz) |
| Sex | Atualizar Tracker (PLANO-MESTRE) — onde parou, próxima ação | disciplina de sessão |
| Mensal | Relatório de resultado por cliente (retenção!) + revisão de custos IA | VERA + tela Custos |

**Regra de ouro operacional:** nenhuma mensagem sai pra cliente sem aprovação humana (propõe-e-aprova) — já é o padrão da plataforma; o plano só o torna ritual.

---

## 3. Frentes de valor (o que cada capacidade entrega e pra quem)

### F1 — Retenção dos ~16 clientes de consultoria (ataca o churn ~33%)
A causa típica de churn em consultoria é **valor invisível**. Antídoto: artefatos semanais.
- **VERA** → resumo semanal por loja (números + o que foi feito + próximos passos). Hoje os runs existem; falta virar **entrega ritual ao cliente**.
- **Histórico por loja (G1)**: tudo que foi feito registrado em timeline — vira munição de renovação ("nos últimos 90 dias fizemos X, Y, Z").
- **Radar**: detectar queda antes do cliente reclamar → contato proativo (a consultoria que liga antes é a que renova).

### F2 — Suporte que não consome o time
- **BRENO** (807 runs/7d — o cavalo de batalha) cobre off-hours e triagem. Expandir: base de conhecimento (G2) alimentada com FAQs dos sistemas que vocês revendem → BRENO responde nível 1 de suporte de sistema também.
- **Agentes especialistas (G2)**: um por domínio — iFood (existe: analise-loja), sistemas revendidos (criar via Oracle quando MVP sair), automação. Time consulta o especialista antes de escalar pro Wandson.

### F3 — Receita: mix pró-automação (maior margem)
- A própria operação da CD vira **vitrine**: "a gente opera 16 clientes com 2 pessoas usando isso". Casos reais de BRENO/régua/BomDia = material de venda do produto de automação (R$2,5k setup + R$1,5k/mês).
- **SOFIA (G7)**: ativar pipeline com fonte de leads + cadência (feature pequena) → prospecção contínua sem ocupar o Wandson.
- **LARA régua (G3)**: configurar por tenant → recorrência/fidelização WhatsApp como serviço empacotado.

### F4 — Cobrança
- **CORA está parada desde 15/05** (POC). Decisão de produto pendente: religar como rotina de inadimplência (tela Inadimplentes existe) ou manter manual via Asaas. Recomendo religar **só leitura+draft** primeiro (propõe cobrança, humano envia).

---

## 4. Integrações — como cada peça externa se encaixa

| Peça | Papel no dia a dia | Estado |
|------|--------------------|--------|
| **Hermes (Telegram)** | Copiloto do CEO: perguntas de gestão, lembretes, visão das lojas **via admin MCP (3B)** — é o que falta pra ele "enxergar" a CD | 3A ✅ · 3B bloqueado por rotação GATE 0 + spec do admin MCP |
| **MCP GitHub + Supabase (neste chat e no Cowork)** | Verificação independente, queries ad hoc, revisão de PR sem abrir sessão | ✅ funcionando (usado nesta sessão) |
| **EvoNexus** | Referência de paradigma (FASE 0 concluída) — **não** integra em runtime | papel encerrado como fonte; lab continua read-only |
| **Evolution API** | Canal WhatsApp de tudo (BRENO, régua, MIA) | ✅ em produção |
| **Asaas** | Billing; CORA propõe em cima | ✅ |
| **Trigger.dev** | Orquestração de rotinas | ✅ (B-01 religa o DELI cron) |
| **Skill LLM Council** | Decisões caras (pricing, priorização G8 vs G9, mudanças de posicionamento) — não usar pra tarefa corriqueira | instalada |

---

## 5. Os 90 dias em 3 ondas

### 🌊 Onda 1 (dias 1–30) — "Operar o que existe"
1. Fixes B-01, B-02, B-04, B-08 (semana 1).
2. Rotina §2 rodando na disciplina (Wandson + Lorena) — 2 semanas de rodagem.
3. VERA → resumo semanal **entregue a 3 clientes piloto** (Performance) e medir reação.
4. LARA régua configurada em 1 tenant piloto.
5. Histórico/timeline por loja sendo alimentado em toda interação.
**Critério de saída:** rotina diária < 2h de tempo humano; 3 clientes recebendo artefato semanal.

### 🌊 Onda 2 (dias 31–60) — "Escalar valor visível"
1. Resumo semanal pra **todos os clientes Performance/Enterprise**.
2. SOFIA com pipeline ativo (fonte de leads + cadência aprovada).
3. CORA religada em modo propõe-e-aprova (se decidido).
4. Oracle da CD — **MVP implementado** (spec M3 aprovada): criar agente especialista nos sistemas revendidos como primeiro caso real.
5. Backlog segurança restante (B-03, B-05, B-06, B-07, B-09).
**Critério de saída:** churn do trimestre < churn anterior; 1º agente criado pelo Oracle em uso.

### 🌊 Onda 3 (dias 61–90) — "Preparar a revenda"
1. Empacotar a operação como produto: onboarding de tenant documentado (a FASE 2 multi-tenant já preparou o terreno; RLS residual fechada).
2. **Decisão G8 vs G9** (multi-plataforma vs venda direta WhatsApp) — caso clássico pro **council** com dados das ondas 1–2.
3. Piloto de revenda: 1 consultoria parceira ou 1 franquia operando como segundo tenant real.
4. Material comercial derivado dos casos internos (números reais das ondas 1–2).
**Critério de saída:** segundo tenant real onboardado sem vazamento (RLS validada com teste cruzado — o que a auditoria não pôde fazer).

---

## 6. Métricas (poucas, mas medidas)

| Métrica | Hoje (baseline) | Alvo 90d |
|---|---|---|
| Churn mensal consultoria | ~33% | < 20% |
| Tempo humano/dia em operação | (medir semana 1) | < 2h |
| Clientes recebendo artefato semanal | 0 | 100% Performance+ |
| Receita automação (R$/mês) | atual | +2 contratos |
| Runs com falha por causa externa | créditos zeraram 1× | 0 apagões (alerta B-08) |

---

## 7. Governança do plano

- Este doc entra no repo (`docs/estrategia/M2-plano-90-dias.md`) e vira track no **Tracker** (T10?).
- Revisão quinzenal de 30min: o que rodou, o que travou, ajustar onda.
- Decisões caras (pricing, G8 vs G9, mudanças de tier) → **council** antes, com dados.
- Regra permanente: plano muda quando a evidência mudar — nunca por empolgação.
