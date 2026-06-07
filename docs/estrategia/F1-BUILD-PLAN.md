# F1 — Plano de Build · Defesa Comercial (copiloto)
**D6 ✅ APROVADA pelo Wandson em 2026-06-07** (direção + anti-dispersão + início imediato).
Design de referência: console v2 do Claude Design (projeto `claude.ai/design/p/12fd5f70…`, design system com Brand Guard).

## Ordem de PRs (1 PR por entrega, critério de aceite em cada um)
| PR | Entrega | Critério de aceite |
|----|---------|--------------------|
| **PR1** ✅ | Shell Console v2 + 3 telas F1 com dados de exemplo (rota `console-v2`, admin) | build passa · rota isolada não afeta app atual · visual = design system (Anton/Montserrat/#B70C00/4px) · grupos F2 travados na UI |
| **PR2** | Wiring Visão Geral: KPIs reais de `agent_runs` (execuções, custo) + contagem de casos | números batem com SQL direto no banco (output bruto) |
| **PR3** | Schema Defesa: migrations `defesa_casos` (tenant_id NOT NULL, RLS, estados rascunho→aprovado→enviado→resultado) + `defesa_metricas` — SQL aprovado antes (D5 v2) | isolamento por tenant provado (impersonação) |
| **PR4** | Agente Defesa v1 (Trigger.dev `defesa-analisar`): entrada manual/webhook de caso → análise → draft de contestação/resposta → grava caso | 1 caso real processado ponta-a-ponta com log+custo |
| **PR5** | Aprovação via WhatsApp (fluxo drafts existente) + envio assistido (“você só dá o OK”) | lojista aprova pelo WhatsApp e caso muda de estado |
| **PR6** | Painel “R$ defendido” (cesta: estornos + ranking + horas) + Radar grátis (diagnóstico semanal por rotina) | painel reflete casos reais; rotina semanal roda |
| **PR7** | Onboarding self-service mínimo + qualificação por volume (≥300 pedidos/mês ou ≥6 cancelamentos/mês) | loja nova ativa em ≤7 dias sem intervenção manual |

## Regras desta fase
- **Anti-dispersão (D6):** nada de F2 (Análise/Cardápio/Keeta/99Food/white-label) antes do gate D+90. Os grupos existem na UI mas travados — lembrete visual do foco.
- Carteira de consultoria **intocada** — beta não-pagante; venda só a lojas novas (R$147).
- Métricas D+90 no `DIRECIONAMENTO-SAAS-2026-06.md` §5; kill-switch da Cris §6.
- Chat ao Vivo atual NÃO é tocado na F1 (redesenho fica pra integração do console completo, pós-gate).
- Pendência de registro: gravar D6 nas Decisões Travadas do PLANO-MESTRE na próxima sessão de docs.
