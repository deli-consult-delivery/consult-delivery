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

---

## `visao` — Visão Geral — PENDENTE (aguardando navegação)

Do parte-a: dado real confirmado (`atendimento_avaliacoes`=1075,
`agent_runs`=106 pra Karina), falta:
- [ ] Comparar KPI exibido na tela com os números acima.
- [ ] Confirmar nenhuma linha vermelha/erro no Console.
- [ ] Estado vazio / ação, se aplicável.

## `csat` — Satisfação do Atendimento — PENDENTE (aguardando navegação)

Do parte-a: `count(*)=1075`, `respondidas=36`.
- [ ] Conferir se a tela mostra "36 de 1075" (ou equivalente) de forma consistente com o banco.
- [ ] Estado vazio / ação / erro visual.

## `defesa` — Defesa Comercial — PENDENTE (aguardando navegação)

Do parte-a: `defesa_casos.status='aguardando_ok'` = 0 pra Karina (fila real vazia, não falta de dado); `defesa_aprovadores` = 0 (sem aprovador cadastrado).
- [ ] Confirmar que a tela mostra estado vazio ("nenhum caso aguardando"), não erro.
- [ ] Confirmar se Defesa está habilitada pro tenant Karina (`tenant_agent_config`) — se não, checar paywall/mensagem correta em vez de tela quebrada.
- [ ] Cadastro de aprovador é ação de escrita — fora do escopo READ-ONLY; só confirmar que a UI de cadastro abre sem erro.

## `ativar` — Config de ativação (Defesa) — PENDENTE (aguardando navegação)

Não coberto em detalhe no parte-a — sem achado prévio a confirmar, avaliar junto na mesma sessão de browser se der tempo.

---

## Resumo desta rodada

| Item | Status |
|---|---|
| `nps` avg=0.00 | ✅ **Resolvido — não é bug, dado real + fórmula correta** |
| `visao` | ⏳ Aguardando navegação (Wandson) |
| `csat` | ⏳ Aguardando navegação (Wandson) |
| `defesa` | ⏳ Aguardando navegação (Wandson) |
| `ativar` | ⏳ Aguardando navegação (Wandson) |
