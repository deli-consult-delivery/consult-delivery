# HANDOFF — Frente SEGURANÇA (FASE 2 onda 2 — P-2..P-5)
**Modelo: Sonnet 4.6 · Branches `feat/seguranca-*` · Ler `COORDENACAO-MULTI-SESSAO.md` ANTES.**

## Missão
Fechar a dívida da FASE 2 (EvoNexus-replica, track T2). Fontes: `PLANO-MESTRE.md` §FASE 2 · `docs/evonexus-replica/FASE-2-onda1-plano.md` (pendências P-1..P-5; P-1 já resolvida) · migrations `20260607_001..005`.

## Escopo (TODA migration: redigir → versionar → APROVAÇÃO DO WANDSON NO CHAT → aplicar 1 a 1 → isolamento)
| PR | Entrega |
|----|---------|
| S1 | **P-2**: cutover `logAgentRun` — tenant_id obrigatório nas tasks que ainda mandam null · backfill restante · `agent_runs.tenant_id SET NOT NULL` (atual: ainda nullable com policy p/ legado null) |
| S2 | **P-3**: contrato `user_agent_access` — alinhar slugs com catálogo `agents` (FK agent_id já existe; remover/migrar `agent_name` legado onde usado — cuidado: `usePermissions.js` lê `agent_name`) |
| S3 | **P-4**: `tenant_agent_config` (config por tenant/agente: modo, provider, limites) + leitura nos agentes · **P-5**: revogar grants órfãos dos ex-membros (Wélida/Eduardo/Yasmin) — LISTAR e pedir OK do Wandson antes (mexe em acesso) |
| S4 | Varredura final: `get_advisors` (security) do Supabase + rodada de RLS em tabelas novas (estudio_*, defesa_*) + atualizar `scripts/qa-knowledge.md` |

## Regras específicas
- Nada de `DROP` — se precisar, parar e perguntar ao Wandson.
- Toda mudança de RLS: teste de impersonação `BEGIN; SET LOCAL role authenticated; SET LOCAL request.jwt.claims ...` (CTE com set_config dá falso positivo — lição registrada no qa-knowledge).
- Não tocar `src/` sem checar a frente Telas (zona compartilhada mediante coordenação).
