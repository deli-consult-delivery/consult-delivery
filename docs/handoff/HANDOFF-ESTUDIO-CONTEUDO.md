# HANDOFF — Estúdio de Conteúdo (sessão paralela)
**Criado em 2026-06-08 pela sessão principal (F1/PR10). Leia este arquivo INTEIRO antes de qualquer ação.**

## Protocolo obrigatório
1. Ler `CLAUDE.md` (raiz) · `WikiBrain/wiki/PLANO-MESTRE — Tracker.md` · este handoff.
2. Mandato Cowork D5 v2 vale aqui: branch → PR → merge liberados; **SQL só com aprovação explícita do Wandson antes de aplicar**; output bruto sempre; nunca commitar na main; nunca reusar branch squash-merged; QA: bundle/worker verificados após deploy (automático via Actions no push à main — frontend GitHub Pages + worker Trigger.dev, ~3-5min).
3. Brand Guard travado: Anton (títulos CAIXA ALTA) + Montserrat 500/600 · vermelho #B70C00 (hover #8A0900) · preto #0D0D0D · off-white #E9E6E0 · raio 4px (pílulas 999px) · **ZERO emoji** · "oferta" nunca "promoção".
4. Ao terminar a sessão: atualizar Tracker (Onde parou/Próxima ação/Log) via PR.

## O que é o Estúdio (decisões já tomadas pelo Wandson — NÃO reperguntar)
- Agente de **criação de conteúdo com IA** dentro do Console v2 (grupo **Agentes IA**, primeiro item desbloqueado).
- **Geração de IMAGEM**: modelo **GPT Image 2 via OpenRouter** (verificar slug exato na doc do OpenRouter na hora do build; a env var **`OPENROUTER_API_KEY` JÁ EXISTE** no Trigger.dev prod desde maio — não pedir chave).
- Tipos de conteúdo: Post Instagram 1:1 · Story/**Vaga de emprego 9:16** · **Capa YouTube 16:9** · Oferta WhatsApp · Cardápio (copy) · Calendário editorial do mês.
- Público: **interno (Consult) agora, produto para tenants depois** → construir multi-tenant desde já (catálogo `agents` + `tenant_agents`, padrão do agente 'defesa'), habilitado só para o tenant consult (`9079bd4d-4df7-4023-90fb-d79c8ba7e900`).
- Identidade visual da Consult/loja aplicada às artes (toggle "usar identidade da loja": logo + cores; lojas têm `logo_url` na tabela `lojas`).

## Estado atual
- **Design**: tela sendo gerada no Claude Design — projeto `claude.ai/design/p/12fd5f70-32c7-4b54-8e12-f07c90895637`, chat novo iniciado em 2026-06-08 com brief completo (3 colunas: BRIEF · RESULTADO · BIBLIOTECA; estados vazio/gerando/erro de saldo; indicador de custo por imagem). **Aguardando o Wandson aprovar o design lá.**
- Nada de código do Estúdio existe ainda no repo.

## Plano de build (após OK do Wandson no design)
| PR | Entrega | Observações |
|----|---------|-------------|
| E1 | Migration `estudio_criacoes` (id, tenant_id NOT NULL, loja_id?, tipo, formato, brief, tom, texto_gerado, imagem_url, custo_usd, criado_por, status rascunho/aprovado, timestamps) + RLS member + storage bucket p/ PNGs — **SQL ao Wandson antes de aplicar** | seed catálogo: insert agents ('estudio','specialist') + tenant_agents consult — lembrar: `agents.category` só aceita orchestrator\|specialist |
| E2 | Task Trigger.dev `estudio-gerar` (padrão `trigger/defesa/analisar-caso.ts`): texto com claude-sonnet-4-6 (legenda/copy no Brand Guard) + imagem via OpenRouter (fetch API OpenAI-compat, modelo GPT Image 2; salvar PNG no Supabase Storage) + `logAgentRun` com custo real | lazy getters; nunca throw no topo; Zod Input/Output |
| E3 | Tela `src/console/Estudio.jsx` fiel ao design aprovado + rota no ConsoleV2 (grupo Agentes IA desbloqueado) + disparo da task (padrão do app: ver como AgentsPage/bridge invocam tasks; alternativa: insert em fila + cron) | reusar `console.css` (classes cv2-*) |
| E4 | Biblioteca (grid das criações, busca) + "Enviar como rascunho de campanha" → `agent_drafts` canal painel (nada postado direto — regra drafts) | |

## Aceite (output bruto obrigatório)
1 geração e2e em produção: brief → imagem PNG salva + legenda → linha em `estudio_criacoes` + `agent_runs` com custo → thumbnail na biblioteca. Bundle/worker verificados.

## Coordenação com a sessão principal
A sessão principal segue no **PR10 (assinaturas Asaas da Defesa)** e adiante. Não tocar em: `trigger/defesa/*`, `trigger/asaas/*`, `src/console/ConsoleV2.jsx` SEM rebase — se precisar mexer no ConsoleV2 (rota nova), **buscar a versão da main na hora** (outras PRs podem tê-lo alterado; conflito fantasma = caso #155). Branches: prefixo `feat/estudio-*`.
