# SPEC — Tenancy Fase 1c: dados dependentes das 16 lojas (cobranças / atendimento / nps)

Status: **✅ DECIDIDO — Opção A (NO-OP de migração)** (Wandson, 2026-07-01). Nada aplicado no banco.
Autor: sessão consult-delivery-22 | Data: 2026-07-01 | Projeto Supabase: `czyanilrverorwenikqw`
Antecede: `docs/tenancy-fase1b-lojas-para-tenant-spec.md` (✅ aplicado, migration `20260701_010`).

---

## TL;DR

A Fase 1b isolou as **lojas** (CRM) em tenants `store`. A dúvida da Fase 1c era migrar os **dados
operacionais** (cobranças, atendimento/CSAT, NPS) das 16 lojas para os store tenants. A investigação
ao vivo mostra que **isso não é viável nem, provavelmente, desejado**:

1. As tabelas **já têm** a coluna `loja_id` (a memória antiga dizia que não tinham) — mas ela está
   **100% NULL** nos dados que existem. Por isso o passo 2 da migration 010 (que amarra via
   `d.loja_id = l.id`) não migrou nenhuma dessas linhas.
2. **Não existe chave confiável** para popular `loja_id` retroativamente (medições abaixo).
3. A **decisão B da Fase 1b** (registrada no cabeçalho da migration 010, aprovada pelo Wandson em
   2026-07-01) já determina: *"cobranças/atendimento/nps ficam na agência"*. Ou seja, migrar o
   `tenant_id` dessas tabelas **contraria uma decisão já tomada**.

**Recomendação:** fechar a Fase 1c como **NO-OP de migração** (dados operacionais permanecem no tenant
da agência, por design) e tratar `loja_id` apenas como **campo de segmentação de relatório, populado
daqui pra frente pelo app** — não por backfill histórico. Detalhe e alternativas abaixo.

---

## ESTADO REAL (levantado ao vivo — output bruto)

### Coluna `loja_id` existe em todas as tabelas dependentes, mas está NULL
```
tabela                    linhas  loja_id_null  das_16_lojas  no_store  na_agencia
avaliacoes                     0       -             0            0         0
nps_avaliacoes                48      48             0            0         0
cobrancas                   2319    2319             0            0         0
atendimento_avaliacoes       461     461             0            0         0
client_facts                   1       0             0            0         0   (loja fora das 16)
client_timeline                1       0             0            0         0   (loja fora das 16)
```
Todas as 6 tabelas têm `loja_id` + `tenant_id`. `cobrancas` tem FK `loja_id → lojas(id)` e
`tenant_id → tenants(id)`; `cliente_id` **não** tem FK e está **100% vazio** (0/2319).

### Natureza dos dados
- **cobranças** = a agência Consult Delivery cobrando as **lojas-clientes** pela consultoria
  (`customer_name` = nome da loja/dono; valores ~R$100–230/mês). Ex.: "Café Container" (123),
  "Mikelly Pizzaria" (41), "NIKKEI SUSHI ALIMENTOS LTDA" (48). 214 nomes distintos, 1 só tenant.
- **atendimento_avaliacoes / nps** = CSAT/NPS com o **consumidor final** (`contact_phone` é do
  consumidor, não da loja). Nenhuma coluna aponta para a loja que originou a pesquisa.

### Teste das chaves candidatas (por que o backfill automático é inviável)
```
cobranças  · customer_name × lojas.nome (match exato, case-insensitive):
             casa 2 de 16 lojas · 145 de 2319 linhas (6%) · cliente_id 0/2319 · customer_phone é do cliente
atendimento· agent_id 0/461 · assigned_to 6/461 · conversation_id 46/461      → sem âncora de loja
nps        · agent_id 0/48  · assigned_to 0/48  · conversation_id 45/48 · contact_phone 0 válidos
lojas      · das 16 ativas, só 1 tem whatsapp cadastrado                       → telefone não serve de chave
```
Qualquer migração automática cobriria ≤6% e por chave frágil (nome fantasia vs nome do dono,
"Consultoria IFood - Makay e Supper Sushi" agregando duas lojas, etc).

---

## GOAL (revisado pela investigação)

Decidir o destino dos dados operacionais das 16 lojas — **não** presumir migração. As opções reais:

| Opção | O que faz | Custo | Isolamento resultante |
|---|---|---|---|
| **A — NO-OP (recomendada)** | Nada no banco. Confirma decisão B: cobranças/atendimento/nps ficam no tenant da agência. `loja_id` passa a ser populado só pelo app em registros **novos**, para relatório por loja. | Zero migração; 1 ajuste no app na criação dos registros (fora do escopo de SQL). | Financeiro/atendimento seguem operados pela consultoria no nível agência (correto para o negócio). |
| **B — Backfill por mapa manual** | Wandson aprova um de-para `customer_name → loja_id` (214 nomes → 16 lojas) para cobranças; popula `loja_id`; **mantém** `tenant_id` na agência (só segmenta relatório, não isola). | Alto (curadoria manual dos 214 nomes). Atendimento/nps ficam sem âncora → permanecem na agência. | Igual à A no isolamento; ganha só segmentação retroativa de cobranças. |
| **C — Migrar tenant_id p/ store** | Além do backfill, mover `tenant_id` das linhas casadas para o store. | Alto + **contraria a decisão B** + mexe em dados financeiros reais. | Isola cobranças por loja, mas quebra a visão financeira consolidada da consultoria. **Não recomendada.** |

**Recomendação: Opção A.** Motivo: a decisão B já foi tomada; não há chave para backfill confiável;
e o financeiro/atendimento é operação da própria consultoria, cujo lugar natural é o tenant da agência.

### ✅ DECISÃO (Wandson, 2026-07-01) — Opção A
As cobranças ficam na agência. Esclarecimento do Wandson: **essas cobranças são feitas para os clientes
ativos da agência — de consultoria E de outros serviços também**, não apenas das 16 lojas de consultoria.
Isso confirma A e **descarta B/C**: uma cobrança pode ser de um serviço que não pertence a nenhuma das 16
lojas, então amarrar `tenant_id`/`loja_id` por loja seria semanticamente incorreto. Financeiro, atendimento
e NPS permanecem operados no nível do tenant da agência. Nenhuma migration necessária. `loja_id` fica
disponível como campo opcional de segmentação de relatório, populado pelo app quando (e se) fizer sentido —
backlog, sem backfill histórico.

---

## PLANO (só se Wandson escolher A)

A Opção A **não requer migration SQL**. Ações:
1. Documentar a decisão aqui e no Tracker do PLANO-MESTRE.
2. (App, fora deste SPEC) garantir que a criação de cobrança/atendimento/nps grave `loja_id` quando a
   loja for conhecida no contexto — para segmentação de relatório futura. Backlog, não bloqueia.
3. Corrigir a memória `project_tenancy_fase1b_aplicada` (afirma "sem loja_id"; na verdade a coluna
   existe e está NULL).

Se escolher **B**, o SPEC ganha: (b1) tabela de de-para aprovada; (b2) migration aditiva populando
`loja_id` só nas linhas com match aprovado, idempotente (`WHERE loja_id IS NULL`); (b3) validação com
contagem de casados/não-casados; (b4) rollback = `UPDATE ... SET loja_id = NULL WHERE loja_id IN (mapa)`.
Sem tocar `tenant_id`.

## QUALITY BAR (para quando houver execução)
- [ ] Decisão A/B/C registrada e aprovada pelo Wandson
- [ ] (se B) SQL aditivo/reversível, 1 arquivo, `WHERE loja_id IS NULL`, output bruto de casados/não-casados
- [ ] `tenant_id` das tabelas financeiras **não** alterado sem aprovação explícita (decisão B)
- [ ] Nenhuma das 1177 lojas / dados de outras lojas afetada
- [ ] Memória `project_tenancy_fase1b_aplicada` corrigida (coluna loja_id existe, está NULL)

---

## NÃO-VIABILIDADE registrada (evita reinvestigação futura)
- `cobrancas.cliente_id` está vazio — **não** use como chave.
- `contact_phone` (atendimento/nps) é do consumidor final — **não** identifica a loja.
- `lojas.whatsapp` só existe em 1 das 16 — **não** serve de chave.
- match `customer_name × lojas.nome` cobre 6% — só serve com curadoria manual (Opção B).
