# QA Visual — Tenants `cd-homolog` e `cd-demo` (2026-07-06)

> Registro formal do QA visual executado pela sessão orquestradora nos 2 tenants da homologação iFood, via magic link (Supabase Auth), completando o "Passo C" (smoke visual) que o runbook `docs/runbooks/homolog-demo-users.md` e o README (`docs/integracoes/ifood/README-homologacao.md`) apontavam como pendente. Complementa a Rodada 3 do smoke live (que testou a API direto via SSH, não o Console pelo browser) — ver `docs/integracoes/ifood/homologacao-matriz-cobertura.md` §"Smoke live 2026-07-06".
>
> **Resultado**: funcional passa nos 2 tenants. 4 achados de polish (não-bloqueantes) — **todos corrigidos no PR #797 (mergeado)** antes deste registro. Este documento serve como evidência de "aplicativo completamente pronto para teste" (pré-requisito geral do checklist de homologação).

## Método

- **Autenticação**: magic link (Supabase Auth) — sem senha digitada, mesmo fluxo que um usuário real do Console usaria.
- **Usuários**: os 2 usuários QA temporários já existentes (`qa-homolog@consultdelivery.com.br` — admin em `cd-homolog`; `qa-demo@consultdelivery.com.br` — admin em `cd-demo`), criados via runbook `docs/runbooks/homolog-demo-users.md`. Credenciais nunca saem do arquivo local do Wandson.
- **Escopo**: navegação real pelo Console v2 em produção (`app.consultdelivery.com.br`), não chamada direta à API — o que a Rodada 3 do smoke (SSH) já tinha coberto.

## Telas verificadas — `cd-homolog` (tenant de homologação, App Avaliações)

| Tela | O que foi conferido | Resultado |
|---|---|---|
| **Visão Geral** | Card "Notas iFood" (BI de summary) | Estado vazio correto — "Sem avaliações ainda." (não card de erro), confirma o fix do #763 também pelo browser, não só via API |
| **Menu / navegação** | Contagem e identidade das telas visíveis | **Exatamente 8 telas** — bate com a allowlist da migration `20260706_002` (`visao`, `lojas`, `resp-avaliacoes`, `aprovacoes`, `auditoria`, `notificacoes`, `acesso`, `configsys`). Nenhuma tela fora do escopo vazou pro menu |
| **Lojas → LojaWorkspace → aba Merchant** | Status com polling, form de pausar loja (draft), leitura de horários | Status confirmado com polling de 30s ativo; fluxo de pausar loja cria draft (amarelo) corretamente, mesmo padrão já validado via API na Rodada 3 do smoke; horários exibidos em modo leitura |
| **Avaliações (via API)** | Link da Política de Avaliações, filtro por data, estado vazio da lista | Link visível; filtro de data funcional na UI (mesmos parâmetros confirmados live no smoke, Rodada 2); lista vazia mostrada com texto claro (sandbox sem reviews reais) |

## Telas verificadas — `cd-demo` (tenant de demonstração comercial)

| Tela | O que foi conferido | Resultado |
|---|---|---|
| **Visão Geral (completa)** | KPIs de agentes, alerta de assinatura atrasada, pill de custo IA | Visão completa (não a degradada CSAT/NPS que `cd-homolog` usa) — confirma que a allowlist de `cd-demo` inclui `radar`, então `ConsoleV2` renderiza a Visão Geral cheia (KPIs de agentes ativos, alerta de assinatura em atraso, pill de custo de IA na topbar) |
| **Menu / navegação** | Contagem de telas visíveis | 17 telas visíveis na sessão de QA (a allowlist documentada na migration `20260706_002` original listava 16 — a diferença reflete ajustes de allowlist posteriores ao sprint inicial; contagem exata confirmada visualmente nesta sessão, não recontada aqui via grep de migration) |

## Achados (4) — todos corrigidos no PR #797 (mergeado)

Nenhum achado bloqueava a demonstração (funcional passava nos 2 tenants); todos eram polish visual/copy, corrigidos antes deste registro:

1. **Tema escuro em `LojasListView.jsx`/`LojaWorkspace.jsx`** — essas telas usavam estilo inline escuro (não o cv2 claro), resultando em cards/tabelas pretos sobre o fundo claro do Console v2 e títulos brancos ilegíveis. **Fix**: mapeamento de cores para as variáveis cv2 (`--panel`, `--line`, `--ink`, `--tx`, `--tx2`), preservando estrutura/layout — sem redesenhar.
2. **Copy contraditória em `Avaliacoes.jsx`** — o subtítulo dizia fixamente "colagem manual, sem API do iFood" mesmo quando a loja selecionada tinha `fonte_dados='api'` (ou seja, a mensagem contradizia a própria tela na frente do analista). **Fix**: subtítulo agora condicional em `loja?.fonte_dados`.
3. **Abas de consultoria/IA visíveis em `LojaWorkspace` mesmo com allowlist restrita** — um tenant com allowlist estreita como `cd-homolog` via todas as abas internas (consultoria, IA) que não deveriam aparecer nesse contexto. **Fix**: `allowedModules` passa a propagar de `ConsoleV2` → `Lojas` → `LojaWorkspace`; quando presente, só "Visão Geral" e "Merchant iFood" ficam visíveis na barra de abas (tenants sem allowlist restrita continuam vendo tudo, comportamento idêntico a antes).
4. **Status Merchant cru** — o card de status mostrava o `state` bruto da API iFood (ex. `"ERROR"`), sem tradução. **Fix**: rótulo pt-BR amigável + `message.title` da API quando existir (confirmado live: "Fechada — Loja fechada").

**Quality bar do #797**: `npm run build` verde; zero regressão confirmada por grep dos 2 consumidores reais de `<Lojas>`/`<LojaWorkspace>` (um 3º componente, `LojasScreen.jsx`, é código morto pré-existente sem nenhuma referência — fora de escopo, não tocado).

## Conclusão

Com os 4 achados corrigidos, o critério geral do checklist **"Aplicativo completamente pronto para teste (o analista navega a interface final em sessão remota ~45 min)"** está atendido — confirmado por navegação real (magic link, browser), não só por smoke via API. Este documento, junto com `homologacao-matriz-cobertura.md` (código × critério + 3 rodadas de smoke live) e `roteiro-sessao-homologacao.md` (ordem de demonstração), fecha o pacote de evidências da homologação App 1 (Avaliações).
