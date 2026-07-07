# QA C2-A — Confirmação via browser (achados PRECISA-BROWSER do parte-a)

Continuação de `docs/qa/RESULTADO-QA-C2-parte-a.md` (SQL read-only + grep
estático, sem browser). Este doc fecha os itens marcados PRECISA-BROWSER
navegando de verdade no Console com o tenant Karina.

**Tenant:** Karina — `e9fdaa66-cbe7-4dff-905b-afc4b10219ff`
**Magic link fresco (gerado 2026-07-06, expira conforme TTL padrão do Supabase Auth):**
```
https://czyanilrverorwenikqw.supabase.co/auth/v1/verify?token=f6bc910d848e4de977f799335efb07a45397c046ff3a99eb58409619&type=magiclink&redirect_to=https://app.consultdelivery.com.br
```

---

## `nps` — Lealdade da Marca (NPS) — ✅ RESOLVIDO, NÃO É BUG

**Item original (parte-a):** `count(*)=4`, `avg(nota)=0.00` — marcado FALHA-CANDIDATA
("média exatamente 0.00 com 4 registros" soava suspeito).

**Investigação (SQL real, tenant Karina):**

5 avaliações NPS no banco, não 4:
```
nota=10  (06/07)
nota=0   (01/07)
nota=null (x3)
```

**Por que o "avg=0.00" do doc original era um artefato, não o bug:**
O SQL de verificação do parte-a rodava `avg(nota)` sobre `nps_avaliacoes` —
uma métrica que **a tela nunca calcula e nunca exibe**. `NpsResultados.jsx`
(linhas 44-53) não mostra "média de nota": calcula o **NPS score** de
verdade —
```js
respondidas  = avaliacoes.filter(a => a.nota != null)   // trata null certo, exclui as 3 pendentes
promotores   = respondidas.filter(a => a.nota >= 9)      // nota 10 → 1 promotor
detratores   = respondidas.filter(a => a.nota <= 6)      // nota 0 → 1 detrator
nps          = round(pctPromotores - pctDetratores)      // 50% - 50% = 0
```
Com os dados reais atuais (1 promotor + 1 detrator, das 2 respondidas de 5),
**NPS = 0 é o valor matematicamente correto** — não é um bug de exibição,
é o resultado real da fórmula sobre o dado real. O "avg=0.00" do
levantamento original media outra coisa (média aritmética das notas
brutas, incluindo/excluindo nulls de forma diferente da fórmula de NPS) e
por coincidência bateu no mesmo número visualmente suspeito.

**Veredito: tela correta, dado real. Nenhuma correção necessária.**

**Confirmado via navegação ao vivo (Wandson, link fresco):** a tela mostra
score **"0"** com **"2 respondidas"** — bate exatamente com a fórmula
descrita acima (2 respondidas de 5, 1 promotor + 1 detrator → NPS=0).
Confirma definitivamente que o "avg=0.00" do doc original era artefato do
SQL de verificação, não um bug da UI.

---

## `visao` — Visão Geral — ✅ CONFIRMADO (navegação ao vivo)

Karina é tenant **Avaliações-only** — a Visão Geral renderiza a variante
sem os módulos que ela não tem (Defesa/Ativar não aparecem no menu, ver
seção final). Resultado: **CSAT 64%/36 respondidas (janela 30 dias)**,
**NPS 0/2 respondidas** — sem erro, sem linha vermelha, consistente com o
que a tela `csat`/`nps` mostram em detalhe (ver abaixo).

## `csat` — Satisfação do Atendimento — ✅ CONFIRMADO (navegação ao vivo)

Tela renderiza dado real: **65% / média 3.6 / 37 respondidas de 1093 /
taxa 3%**. Distribuição de notas soma certo: `13+0+0+1+23=37`. Régua LARA
mostra os **100 drafts pendentes de aprovação** (reengajamento CSAT, ver
PR #792/#822) — visibilidade correta, nenhum draft foi aprovado por esta
navegação.

**Discrepância menor, NÃO é bug:** Visão Geral mostra 36 respondidas
(filtro 30 dias) vs. tela CSAT mostra 37 (total, sem filtro de janela) —
é diferença de janela de tempo entre as duas telas, esperado e
consistente com o propósito de cada uma (Visão Geral = "últimos 30 dias",
CSAT = histórico completo).

## `defesa` / `ativar` — N/A (fora do escopo do tenant)

Karina é tenant **Avaliações-only** — Defesa Comercial e a tela de
Ativação de loja **não aparecem no menu** dela (módulos não habilitados
para esse tenant/perfil). Os itens do parte-a sobre `defesa`/`ativar`
não se aplicam a este tenant; permanecem como PRECISA-BROWSER genérico
pra quando alguém rodar QA num tenant que tenha esses módulos habilitados.

---

## Resumo desta rodada

| Item | Status |
|---|---|
| `nps` avg=0.00 | ✅ **Resolvido — não é bug, dado real + fórmula correta (confirmado ao vivo: score 0, 2 respondidas)** |
| `visao` | ✅ **Confirmado ao vivo — CSAT 64%/36 (30d), NPS 0/2, sem erro** |
| `csat` | ✅ **Confirmado ao vivo — 65%/média 3.6/37 de 1093/taxa 3%, distribuição bate, régua LARA visível (100 drafts pending)** |
| `defesa` | N/A — Karina é tenant Avaliações-only, módulo não habilitado |
| `ativar` | N/A — Karina é tenant Avaliações-only, módulo não habilitado |

## Veredito final: QA C2 parte A visual — **PASSA**

Nenhum bug encontrado. Nenhuma tela vermelha. O único item que parecia
suspeito (NPS avg=0.00) foi confirmado como artefato de SQL de
verificação, não falha da aplicação — a UI sempre esteve correta.
