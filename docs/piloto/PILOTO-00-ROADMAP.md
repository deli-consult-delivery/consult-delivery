# PILOTO — Roadmap Completo de Execução

**Feature:** Pipeline de Consultoria iFood com Loja-GPT
**Codinome:** PILOTO
**Data:** 14/05/2026
**Status:** Em planejamento detalhado
**Decisões registradas:**
- Modo de entrega: tudo de uma vez (risco assumido pelo Wandson)
- Consultores mão-na-massa: 3-5 (com plano de escala)
- Loja-GPT: agente compartilhado com contexto injetado em runtime

---

## 📋 Visão geral das 4 ondas

| Onda | Nome | Duração | O que entrega | Status |
|---|---|---|---|---|
| **01** | Fundação — Loja como Entidade | 1 semana | Schema lojas + workspace básico + RBAC + multi-consultor | ⏳ Próxima |
| **02** | Pipeline de Tarefas | 1-2 semanas | Tarefas por loja, aprovação, prints, comentários | ⏳ Aguarda Onda 01 |
| **03** | Loja-GPT v1 | 1-2 semanas | Agente compartilhado com RAG sobre conhecimento iFood + memórias da loja | ⏳ Aguarda Onda 02 |
| **04** | WhatsApp Aprovação + Loom→Relatório | 2 semanas | Cliente aprova via WhatsApp; Loom transcript vira relatório | ⏳ Aguarda Onda 03 |

**Total MVP:** 5-7 semanas
**Total feature completa:** 7-9 semanas

---

## 🚦 Gates obrigatórios entre ondas

**Cada onda fecha quando:**

1. ✅ `@cd-validator` passa com VEREDITO ✅ ou ⚠️ aceitável
2. ✅ Smoke test end-to-end funciona (output bruto documentado)
3. ✅ Pelo menos 1 cliente real (Wandson ou Wélida) testou no ambiente de produção
4. ✅ PR mergeada na `main`
5. ✅ Bugs críticos resolvidos

**Se algum item falhar, NÃO avança pra próxima onda.**

---

## 🗂️ Estrutura dos arquivos entregues

```
/mnt/user-data/outputs/
├── PILOTO-00-ROADMAP.md              ← este arquivo
├── PILOTO-01-FUNDACAO.md             ← Onda 01: prompt + schemas
├── PILOTO-02-PIPELINE-TAREFAS.md     ← Onda 02: prompt + schemas
├── PILOTO-03-LOJA-GPT.md             ← Onda 03: prompt + schemas
└── PILOTO-04-WHATSAPP-LOOM.md        ← Onda 04: prompt + schemas
```

Cada arquivo de onda contém:
- Contexto e pré-requisitos
- Prompt completo para Claude Code (pronto pra colar)
- Schemas SQL completos (revisar antes de aprovar migration)
- Critérios de aceite detalhados
- Smoke tests obrigatórios
- Checklist de validação

---

## 📅 Cronograma sugerido

| Semana | Onda | O que está rodando | Quem aprova |
|---|---|---|---|
| 1 | 01 — Fundação | Schemas + workspace básico | Wandson |
| 2 | 02 — Pipeline | Tarefas + aprovação interna | Wandson + 1 outro consultor |
| 3-4 | 03 — Loja-GPT | RAG + base conhecimento iFood (popular) | Wandson + Wélida |
| 5-6 | 04 — WhatsApp + Loom | Aprovação cliente + Loom transcript | Wandson + 1 cliente real (Uraka Burger?) |

---

## 🚧 Suposições assumidas (você não pôde validar)

**Importante:** essas suposições podem precisar de ajuste durante execução. Cada onda assume o seguinte. **Se alguma estiver errada, me avisa ANTES de disparar Claude Code.**

### Suposição 1 — Multi-consultor com atribuição de loja
3-5 consultores hoje. Cada consultor pode ser **atribuído a N lojas**. Uma loja tem **1 consultor principal** + N colaboradores. Admin (Wandson) vê tudo. Wélida (marketing) tem acesso de leitura + edição em campos de marketing. Eduardo (atendimento) tem acesso de leitura.

### Suposição 2 — Tarefas estruturadas em "blocos"
Padrão Uraka Burger: 6 blocos pré-definidos (Identidade, Cardápio, Operação, Avaliações, Marketing, Suporte). Cada bloco contém N tarefas. Tarefas têm prioridade (Quick Win / Estrutural / Material do Cliente). Templates pré-criados.

### Suposição 3 — Cliente aprova item-a-item OU em bloco
WhatsApp interativo permite as duas formas. Cliente responde "OK tarefa 5" ou "OK bloco 2 inteiro". Sistema parseia ambos.

### Suposição 4 — Loja-GPT consome 3 fontes
1. Repo `consult-delivery-knowledge` (estático iFood — você populará)
2. Tabela `agent_memories` (dinâmico por loja)
3. Tabela `loja_metricas_snapshot` (métricas iFood — manual MVP, automático V3)

### Suposição 5 — Prints upload manual no MVP
Consultor sobe print pra cada tarefa concluída. Supabase Storage. Sem automação iFood na Onda 01-04. Automação fica pra V3 da feature.

### Suposição 6 — Loom transcript é texto colado, não arquivo
Wélida/consultor cola transcrição do Loom no campo. IA processa texto. Upload de arquivo de áudio/vídeo NÃO está no escopo (custo de transcrição + complexidade).

### Suposição 7 — Multi-tenant é a Consult Delivery
Cada loja consultoriada pertence ao tenant `consult` (slug). Não estamos construindo SaaS pra OUTRAS consultorias usarem ainda — isso é V3+ do produto inteiro.

---

## 🔁 Como retomar V2 anterior depois

Quando PILOTO terminar, retomar nesta ordem:
1. **CORA Tarefa 3-10** (já tem Asaas configurado + smoke test 3 tasks passou)
2. **BRENO + WhatsApp automático** (V2-2)
3. **SOFIA** (precisa de ICP — definir antes)
4. **VERA** (precisa KPIs — definir antes)

V2-5 (UI Memória) **NÃO é mais necessário** — vira parte do Loja-GPT (Onda 03).

---

## 🛡️ O que esse roadmap PROTEGE você de

Sem este roadmap, o risco real é:
- Disparar prompt gigante no Claude Code
- Em 30 minutos esgotar contexto
- Claude alucinar partes do schema
- Você não conseguir auditar 50 arquivos novos de uma vez
- Em 4 semanas perceber que metade tá errado
- Refazer tudo

Com este roadmap:
- 4 ondas pequenas, validáveis
- `@cd-validator` em cada gate
- Você usa o sistema em produção desde a Onda 02
- Bugs aparecem cedo, custam barato

---

## ✅ Próximo passo

1. Lê PILOTO-01-FUNDACAO.md
2. Lê os schemas (Onda 01)
3. Confirma ou ajusta
4. Cria branch `feature/piloto-01-fundacao`
5. Cola o prompt no Claude Code
6. Acompanha execução, valida com `@cd-validator`
7. Smoke test
8. PR + merge
9. **Aí sim** parte pra Onda 02

**Não dispara as 4 ondas em paralelo.** Sequencial.
