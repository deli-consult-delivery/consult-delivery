# V2 — Plano de Execução Completo

**Data:** 14/05/2026
**Decisão:** Wandson confirmou "tudo do V2 agora", sem smoke test prévio dos agentes não-validados (ressalva registrada).
**Doc autoritativo:** RESTRUCTURE.md (seções 11, 12 — agentes futuros e anti-padrões).

---

## 4 Features do V2

| # | Feature | Tempo estimado | Pré-requisito |
|---|---|---|---|
| 1 | **CORA + Asaas** (cobrança end-to-end) | 1-2 semanas | Conta Asaas + webhook configurado |
| 2 | **BRENO + WhatsApp automático** | 1 semana | Evolution API webhook receptor |
| 3 | **SOFIA** (SDR/prospecção, do zero) | 2 semanas | Decisão de fonte de leads |
| 4 | **VERA** (BI/relatórios, do zero) | 2 semanas | Definição de KPIs |

**Total sequencial:** 6-7 semanas.
**Total com worktrees (max 2 paralelas):** 4-5 semanas.

---

## Ordem recomendada

```
Semana 1-2: CORA + Asaas
  └── Trava dinheiro do cliente. Feito primeiro pq risco alto se atrasar.

Semana 2-3: BRENO + WhatsApp auto  (PARALELO com final de CORA)
  └── Libera Eduardo. ROI operacional alto.

Semana 4-5: SOFIA
  └── Prospecção. Pode rodar em paralelo com VERA?

Semana 5-6: VERA
  └── BI. Depende de ter dados acumulados em produção.
```

---

## Paralelização com worktrees

| Fase | Worktree A (main) | Worktree B |
|---|---|---|
| Sem 1 | CORA+Asaas | — |
| Sem 2 | CORA+Asaas (fim) | BRENO+WhatsApp (início) |
| Sem 3 | BRENO+WhatsApp (fim) | SOFIA (início) |
| Sem 4 | SOFIA (fim) | VERA (início) |
| Sem 5 | VERA (fim) | — |

Cada worktree = 1 prompt. Sequência:

1. `V2-1-CORA-ASAAS.md` — começa agora
2. `V2-2-BRENO-WHATSAPP-AUTO.md` — começa quando CORA estiver ~70%
3. `V2-3-SOFIA.md` — começa quando CORA mergear
4. `V2-4-VERA.md` — começa quando BRENO mergear

---

## Decisões pendentes que travam SOFIA e VERA

Antes de iniciar essas duas, **você precisa decidir**:

### SOFIA — fonte de leads
- [ ] Apify scraping (custo: ~US$50/mês)
- [ ] Google Maps API (custo: ~US$200/mês para volume alto)
- [ ] Upload manual de CSV (custo: zero, fricção alta)
- [ ] LinkedIn Sales Navigator (custo: ~US$100/mês por seat)

### VERA — KPIs do dashboard
- [ ] Quais métricas calcular automaticamente?
- [ ] Periodicidade do relatório (diário/semanal/mensal)?
- [ ] Quem recebe (Wandson? Wélida? Cliente final?)?

Sugiro discutir essas decisões **antes** de chegar nessas features (semana 4).

---

## Antes de começar V2 — Pendência crítica

**ChatScreen.jsx tem mudanças não-commitadas em main.** Risco de perder trabalho. 2 minutos:

```powershell
cd "C:\Users\Consult Delivery\consult-delivery"
git checkout -b feature/chat-screen-assignment
git add src/screens/ChatScreen.jsx
git commit -m "feat(chat): adiciona convAssignedTo e isNewAssignment"
git push -u origin feature/chat-screen-assignment
git checkout main
```

PR abre depois quando der.

---

## Cada feature segue o mesmo método

1. Cria branch dedicada (ou worktree)
2. Cola o prompt da feature no Claude Code
3. Claude Code invoca `@cd-task-creator` e `@cd-migration-creator` quando apropriado
4. No final, **obrigatório** rodar `@cd-validator`
5. Se passar → PR → review → merge
6. Se não passar → corrige até passar

Sem desvio. Sem "ah, deixa pra depois".

---

## Riscos assumidos (ressalva da decisão)

- Os agentes existentes (CORA, BRENO, NOVA) têm `new Anthropic()` no top-level (anti-padrão #4 do CLAUDE.md). Decidiu não corrigir antes — risco: regressão silenciosa pode aparecer durante V2 e ser confundida com bug novo.
- 6 agentes (breno/cora/nova) nunca foram executados em produção real. Decidiu não fazer smoke test antes — risco: 1ª execução pode falhar e parecer "feature nova quebrou", quando na verdade a base já estava ruim.

Esses riscos **não bloqueiam V2** — mas estão documentados. Se aparecer bug estranho durante V2, lembrar de revisitar.
