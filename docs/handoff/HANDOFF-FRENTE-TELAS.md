# HANDOFF — Frente TELAS (Etapa B: telas GAP do Console v2)
**Modelo: Sonnet 4.6 · Branches `feat/telas-*` · Ler `COORDENACAO-MULTI-SESSAO.md` ANTES.**

## Missão
Levar o Console v2 (design definitivo, classes `cv2-*`) ao feature-surface do EvoNexus nas telas de OPERAÇÃO de agentes. Fontes de verdade: `PLANO-MESTRE.md` (CHECKLIST MESTRE) · mapa de telas T3 v1 (#163, em `docs/`) · protótipo `docs/prototipo/console-v2.html` · design aprovado no Claude Design.

## Estado herdado (não refazer)
Console v2 já tem REAIS: Visão Geral · Defesa Comercial (fila completa) · Ativar loja (+Aprovadores) · Clientes (multi-tenant + assinaturas Asaas) · paywall D7. Radar é exemplo rotulado (fica com a sessão principal). Grupos travados na sidebar: Agentes IA (Estúdio virá da outra sessão) · Dados · White-label.

## Fila de PRs (1 tela = 1 PR, com critério de aceite e dados REAIS — zero mock sem rótulo)
| PR | Tela | Fonte de dados |
|----|------|----------------|
| T1 | **Custos de IA** (grupo Dados): custo por agente/dia/tenant, 30d, tabela + total; alerta de pico | `agent_runs.cost_usd` (agregação NO BANCO — P6!) |
| T2 | **Painel de Agentes v2**: catálogo global + toggle por tenant + última execução/custo por agente | `agents` · `tenant_agents` · `agent_runs` |
| T3 | **Execuções (runs)**: histórico filtrável por agente/status com duração/custo, detalhe input/output | `agent_runs` |
| T4 | **Aprovações unificadas**: fila de `agent_drafts` pending (todos os agentes) com aprovar/rejeitar — reusar regras do DraftsPendentes clássico | `agent_drafts` |
| T5+ | Habilidades · Rotinas · Gatilhos (consultar checklist/mapa antes; podem precisar de SQL novo → aprovação do Wandson) | a definir no mapa |

## Regras específicas
- `ConsoleV2.jsx` é ZONA COMPARTILHADA: buscar da main na hora, adicionar item/rota, mergear imediato.
- Telas novas = arquivos novos em `src/console/` (sem colisão).
- RBAC: telas administrativas visíveis conforme papel (ver `usePermissions`).
- Aceite por PR: bundle verificado + números batendo com SQL direto (output bruto no PR).
