# TD#55 — Triagem das branches remotas unmerged (2026-07-06)

> Gerado durante a limpeza de TD#54/#55 (brief `brief-85-branches-deadroute.md`). Critério de segurança: só foram **deletadas automaticamente** branches com `git diff origin/main...branch` vazio OU cujos arquivos alterados já são byte-idênticos no `main` atual (squash-merge comprovado) — 30 branches, ver `report-85-branches.md` para a lista completa e o output bruto.
>
> As 33 branches abaixo têm diff real contra `main` — **nenhuma foi deletada**. Decisão final é do Wandson, por grupo.

## Grupo A — Sessões cloud automáticas (`claude/*`), prováveis experimentos (4)

Nome no padrão `claude/<adjetivo>-<nome>-<hash>` = sessão criada automaticamente pelo Claude Code cloud, não por um worker/branch deliberado.

| Branch | Autor | Último commit | Recomendação |
|---|---|---|---|
| `claude/gifted-borg-53f2a8` | Consult Delivery | 2026-06-16 | Revisar conteúdo rápido; se experimento sem valor, deletar |
| `claude/jolly-heisenberg-230ace` | Consult Delivery | 2026-06-18 | idem |
| `claude/magical-wescoff-2e77af` | Consult Delivery | 2026-06-14 | idem |
| `claude/tender-lalande-14723f` | deli-consult-delivery | 2026-06-29 | idem |

## Grupo B — Stale >30 dias, contexto de sprint antigo (8)

| Branch | Autor | Último commit | Dias | Recomendação |
|---|---|---|---|---|
| `wandson/local-state-19-mai-2026` | GSD Agent | 2026-05-19 | 48 | Nome sugere estado local pontual — provável descarte |
| `chore/g06-vps-hardening` | GSD Agent | 2026-05-25 | 42 | Sprint G06 antigo — conferir se hardening já foi aplicado por outro caminho antes de descartar |
| `feat/onda07-f3-confirmacao` | GSD Agent | 2026-05-26 | 41 | Onda 07 antiga — provável já superada |
| `feat/s2-g06-memoria-central` | GSD Agent | 2026-05-30 | 37 | Memória central já é feature em produção (`docs/deli-memory/principles/agent-memory.md`) — conferir se esta branch é o histórico da implementação (descartável) ou tem algo não incorporado |
| `wandson/reset-password` | GSD Agent | 2026-06-01 | 35 | Feature de reset de senha — conferir se já existe em produção sob outro nome/PR |
| `wandson/evonexus-decisao-d1` | GSD Agent | 2026-06-03 | 33 | Decisão já documentada em `docs/evonexus-replica/DECISAO-001-...md` (mergeada) — branch provavelmente só o histórico de discussão, descartável |
| `wandson/fix-outros-horarios` | GSD Agent | 2026-06-04 | 32 | Nome conflita com feature já mergeada (`feat/agentes-bot-outros-horarios`, já deletada nesta limpeza) — conferir se é duplicata abandonada |
| `wandson/kanban-tasks-panel` | GSD Agent | 2026-06-06 | 30 | Painel Kanban já existe no Console (`ChatTasksPanel.jsx` etc.) — conferir se incorporado por outro PR |

## Grupo C — Sprint recente (11-17 dias), não integrado (6)

| Branch | Autor | Último commit | Dias | Recomendação |
|---|---|---|---|---|
| `wandson/sidebar-fix-hidden-state` | Consult Delivery | 2026-06-19 | 17 | Fix de sidebar — conferir se o bug ainda existe em produção |
| `wandson/avaliacao-karina` | Consult Delivery | 2026-06-24 | 12 | Contexto específico (Karina) — confirmar com o Wandson se ainda relevante |
| `wandson/eslint-jsx-guard` | Consult Delivery | 2026-06-24 | 12 | Guard de lint — conferir se já coberto por config atual |
| `wandson/realtime-replica-identity` | Consult Delivery | 2026-06-24 | 12 | Ajuste de replica identity (Supabase Realtime) — conferir se aplicado via migration já mergeada |
| `wandson/nps-datacrazy` | Consult Delivery | 2026-06-25 | 11 | Integração NPS/Datacrazy — conferir status |
| `wandson/ao-board-integration` | GSD Agent | 2026-06-30 | 6 | Integração recente — provável WIP, conferir antes de descartar |

## Grupo D — Sprint desta madrugada 2026-07-06, sem PR aberto (15)

Todas de hoje, autor `GSD Agent`. Vários nomes têm uma "gêmea" que **já foi squash-mergeada e deletada** nesta limpeza (ex.: `matriz-financas` vs. a já-deletada `matriz-financas-live`) — provável branch de rascunho/iteração anterior à versão que de fato entrou em `main`. **Recomendação geral: antes de decidir, conferir rapidamente se o conteúdo específico de cada uma já está coberto pela versão mergeada equivalente — se sim, deletar; se houver algo não incorporado, resgatar antes.**

| Branch | Possível equivalente já mergeado (deletado nesta limpeza) |
|---|---|
| `wandson/matriz-financas` | `wandson/matriz-financas-live` |
| `wandson/matriz-catalogo` | `wandson/matriz-catalogo-v2` |
| `wandson/readme-homolog` | `wandson/readme-homolog-v2` |
| `wandson/financeiro-ifood` | `wandson/financeiro-polish` (e a tela original pode ter entrado por outro PR) |
| `wandson/qa-visual-fixes` | PR #797 (mergeado) — conferir se esta branch é anterior/idêntica em conteúdo |
| `wandson/financas-ifood-financial-bridge` | possivelmente incorporada nos PRs #790/#796 do App 2 Finanças |
| `wandson/financas-ifood-smoke-fix` | possivelmente incorporada no PR #796 |
| `wandson/ifood-financas-events` | possivelmente incorporada no PR #791 |
| `wandson/rls-audit-0607` | possivelmente incorporada no PR #776/#784 (auditoria RLS) |
| `wandson/ux-latencia-interruptions` | possivelmente incorporada no PR #778 |
| `wandson/cardapio-api` | sem equivalente óbvio — conferir |
| `wandson/catalogo-client` | sem equivalente óbvio — conferir (App 3 Catálogo ainda em build) |
| `wandson/cleanup-0607` | sem equivalente óbvio — conferir |
| `wandson/fix-loop-triggered-by` | possivelmente incorporada no PR #783 |
| `wandson/lara-csat-reengajamento` | possivelmente incorporada no PR #775/#781 |

## Resumo

| Grupo | Qtd | Ação recomendada |
|---|---|---|
| A — sessões cloud automáticas | 4 | Revisar e provavelmente deletar |
| B — stale >30d | 8 | Revisar 1x cada; maioria provável descarte (feature já reimplementada/mergeada por outro caminho) |
| C — sprint recente, sem PR | 6 | Confirmar com o Wandson se ainda relevante |
| D — sprint 07-06, possível duplicata de branch já mergeada | 15 | Conferir se o conteúdo já está em `main` via a branch irmã; deletar se sim |
| **Total** | **33** | Nenhuma deletada nesta rodada — decisão do Wandson |
