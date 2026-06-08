# Coordenação multi-sessão — regras comuns (LER PRIMEIRO em toda frente)
**Vale para TODAS as sessões paralelas. A sessão principal (Opus) coordena; frentes rodam em Sonnet 4.6.**

## Sessões ativas
| Sessão | Frente | Handoff | Branches |
|--------|--------|---------|----------|
| Principal (Opus) | Coordenação · Radar real · merges de zona compartilhada | — | `feat/pr*`, `docs/*` |
| Estúdio | Estúdio de Conteúdo (GPT Image 2/OpenRouter) | `HANDOFF-ESTUDIO-CONTEUDO.md` | `feat/estudio-*` |
| Telas | Etapa B — telas GAP do Console v2 | `HANDOFF-FRENTE-TELAS.md` | `feat/telas-*` |
| Agentes | Etapa C — agente Análise de Loja | `HANDOFF-FRENTE-AGENTES.md` | `feat/agentes-*` |
| Segurança | FASE 2 onda 2 (P-2..P-5) | `HANDOFF-FRENTE-SEGURANCA.md` | `feat/seguranca-*` |

## Regras inegociáveis (D5 v2 + lições das sessões 1-13)
1. **Protocolo:** ler `CLAUDE.md` + `WikiBrain/wiki/PLANO-MESTRE — Tracker.md` + o handoff da frente ANTES de codar. Atualizar o Tracker ao terminar (só a seção de log + 1 bullet em Onde parou; buscar SHA fresco na hora — outras sessões também escrevem nele).
2. **Git:** branch com o prefixo da frente · nunca commitar na main · nunca reusar branch squash-merged (#155) · PR pode ser mergeado pela própria sessão (D5 v2), EXCETO se tocar zona compartilhada (regra 4).
3. **SQL:** redigir + versionar + **pedir aprovação explícita do Wandson no chat** antes de aplicar · 1 arquivo por vez · output bruto · teste de isolamento se tocar RLS. Nome de migration: `YYYYMMDD_NNN_frente_descricao.sql` (NNN único — conferir os existentes na main na hora).
4. **Zona compartilhada** (= arquivos que mais de uma frente toca): `src/console/ConsoleV2.jsx`, `src/console/console.css`, `src/App.jsx`, `src/components/Sidebar.jsx`, `trigger/_shared/*`, `scripts/qa-knowledge.md`. Regra: buscar a versão DA MAIN pela API do GitHub na hora do edit · mudança mínima · mergear IMEDIATAMENTE (não deixar PR aberto envelhecendo) · se o push falhar por conflito, refazer do zero a partir da main nova.
5. **Deploys são automáticos** no merge à main (Pages + worker Trigger.dev + bridge self-hosted). QA: verificar bundle/worker com output bruto (padrão das sessões anteriores; cap de 1000 linhas = P6 do qa-knowledge).
6. **Brand Guard:** Anton CAIXA ALTA + Montserrat · #B70C00/#0D0D0D/#E9E6E0 · raio 4px · ZERO emoji · "oferta" nunca "promoção". Console v2 usa classes `cv2-*` de `console.css`.
7. **Agentes:** novos só em `trigger/` (Trigger.dev) · lazy getters · Zod Input/Output · `logAgentRun` com custo · catálogo `agents` (category: orchestrator|specialist) + `tenant_agents` · drafts para qualquer mensagem a cliente.
8. **Reservado ao Wandson:** aprovar SQL · DROP/destrutivo · drafts a clientes · credenciais · VPS · reabrir decisões.

## Contrato de completude (pergunta do Wandson: "o EvoNexus vai estar pronto?")
O **CHECKLIST MESTRE do `PLANO-MESTRE.md` (raiz)** é o contrato — nada de tela pulada em silêncio. Quando as frentes Telas + Agentes + Estúdio + Segurança + white-label (Etapa D, após as demais) terminarem, a sessão principal roda uma **auditoria final linha a linha do checklist** e reporta ao Wandson o que está ✅/⚠️/❌ antes de declarar pronto.
