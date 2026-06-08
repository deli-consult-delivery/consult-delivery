# HANDOFF — Frente AGENTES (Etapa C: Análise de Loja)
**Modelo: Sonnet 4.6 · Branches `feat/agentes-*` · Ler `COORDENACAO-MULTI-SESSAO.md` ANTES.**

## Missão
Construir o agente **AnÁLISE DE LOJA** (ex-F2) no padrão do agente Defesa — o 2º produto vendável da plataforma. Referência de arquitetura: `trigger/defesa/*` (analisar-caso + vigia) e telas `src/console/*` da F1. Já existe um agente antigo `analise-ifood` (tela clássica `AnaliseiFoodScreen` + `trigger/analise/` + `trigger/analise-ifood/`) — **estudar e REUSAR o que servir** (não duplicar lógica de análise existente; a missão é trazê-la ao Console v2 multi-tenant com o paradigma novo).

## Escopo (1 PR por etapa)
| PR | Entrega |
|----|---------|
| A1 | Levantamento: o que `trigger/analise*` já faz · o que o checklist EvoNexus pede · proposta de escopo enxuto ao Wandson (aguardar OK dele no chat) |
| A2 | Task(s) Trigger.dev `analise-loja-*` (claude-sonnet-4-6, custo real no logAgentRun) + seed catálogo (`agents` id 'analise-loja' specialist + `tenant_agents` consult) — **SQL → aprovação do Wandson** |
| A3 | Tela no Console v2 (grupo Agentes IA): pedir análise (loja + brief) · histórico · resultado renderizado · custo — dados reais |
| A4 | Gating comercial: habilitação por tenant (mesmo paywall/assinatura da Defesa quando o Wandson definir preço — perguntar) |

## Regras específicas
- NUNCA enviar nada a cliente — saídas viram tela/draft (canal painel).
- `ConsoleV2.jsx` e `trigger/_shared/*` = zona compartilhada (regra 4 da coordenação).
- Aceite: 1 análise real ponta-a-ponta em produção com log+custo (output bruto).
