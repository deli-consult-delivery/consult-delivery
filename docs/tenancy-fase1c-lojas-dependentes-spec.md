# Tenancy — Fase 1c — Dados dependentes das lojas (cobranças, CSAT, NPS)

Data: 2026-07-01 | Status: **APROVADO** (decisões do Wandson registradas abaixo) | Migration: `supabase/migrations/20260701_011_tenancy_fase1c_loja_id_ref.sql`

Depende de: Fase 1b (16 lojas ativas → tenants store, PR #674).

---

## Descoberta que redefiniu a fase

O prompt inicial assumia "migrar dados dependentes das 16 lojas por `loja_id`". O mapeamento contra o banco real (`czyanilrverorwenikqw`) mostrou que **isso é em grande parte vazio**:

- Nenhuma das 3 tabelas (`cobrancas`, `atendimento_avaliacoes`, `nps_avaliacoes`) tem `loja_id`.
- **15 dos 16 stores têm 0 instância / 0 CSAT / 0 NPS** — não operam atendimento pela plataforma.
- **Karina Doceria** (único store ativo) **já está 100% isolada** (415 CSAT + 3 NPS no tenant próprio `e9fdaa66`, feito no go-live #670). O modelo-alvo já existe e funciona.
- Só existe **1 instância Evolution** (`consult-delivery`, na agência) — não há roteamento por loja.

### Mapeamento (output bruto)

| Tabela | Total | Na agência `9079bd4d` | Isolado em store | Natureza do dado |
|---|---|---|---|---|
| `cobrancas` | 2319 | 2319 (100%) | 0 | Agência cobrando as lojas (mensalidade da consultoria). `customer_name` = Café Container, Piazza, etc. Sem FK em `cliente_id`. |
| `atendimento_avaliacoes` (CSAT) | 461 | 46 | 415 → Karina | CSAT dos clientes finais da loja |
| `nps_avaliacoes` | 48 | 45 | 3 → Karina | NPS dos clientes finais da loja |

**91 CSAT/NPS órfãos na agência**: todos de 21–27/jun/2026, sem `agent_id`, atendente null / "Wandson Silva" / "lorena@consultdelivery.com.br" → teste/setup da própria consultoria, sem loja para derivar.

---

## Decisões do Wandson (2026-07-01)

1. **Cobranças ficam na agência.** São receita da consultoria, não dado operacional de loja. `tenant_id` continua `9079bd4d`. Ganham `loja_id` nullable **apenas como referência** para relatório ("quanto cada loja rende/deve"). Não muda RLS.
2. **Roteamento automático adiado (YAGNI).** 15 lojas têm 0 dado; Karina já isolada. Adiciona-se `loja_id` (nullable, FK) às 3 tabelas agora como preparo aditivo; o mecanismo de roteamento de avaliações novas será definido quando a **2ª loja** ativar atendimento.
3. **91 órfãos ficam na agência.** Sem `loja_id` nem instância, não há como derivar a loja com segurança. Permanecem no tenant agência como operação/teste interno. Reversível.

---

## GOAL

Adicionar vínculo opcional `loja_id` às 3 tabelas dependentes, sem mover nenhum dado real nem alterar isolamento, preparando o terreno para roteamento por loja quando novas lojas ativarem atendimento.

## QUALITY BAR

- [ ] Migration aplica sem erro (output bruto do `ADD COLUMN`).
- [ ] `loja_id uuid NULL REFERENCES lojas(id)` existe em `cobrancas`, `atendimento_avaliacoes`, `nps_avaliacoes`.
- [ ] **Nenhum `tenant_id` alterado** — contagens por tenant idênticas antes/depois.
- [ ] **Nenhuma policy RLS alterada** — `loja_id` não é referenciado por nenhuma policy.
- [ ] Karina continua isolada (415 CSAT + 3 NPS no tenant `e9fdaa66`).
- [ ] Idempotente (`IF NOT EXISTS`) — reaplicar não quebra.

## Plano de migração de dados

**Nenhum.** Esta fase não move dados. `loja_id` nasce `NULL` em todas as linhas. O preenchimento por loja acontece no futuro (Fase 1d / roteamento), fora deste escopo.

## Rollback

Bloco `DROP INDEX` + `DROP COLUMN IF EXISTS` no rodapé da migration. Como nenhuma linha foi tocada e nenhuma policy referencia `loja_id`, o rollback é limpo.

## Teste de isolamento

Não altera RLS → não há novo vetor de isolamento a testar. Validação = confirmar que as contagens por `tenant_id` das 3 tabelas são idênticas antes/depois (nenhum dado migrou) e que Karina segue isolada. Output bruto anexado na aplicação.

## Fora de escopo (Fase 1d — futuro)

- Mecanismo de roteamento de avaliações novas → tenant store correto.
- Preenchimento retroativo de `loja_id` nos 91 órfãos, se algum dia forem atribuídos.
- Portal do lojista exibindo a própria fatura (mudaria o modelo de acesso a `cobrancas`).
