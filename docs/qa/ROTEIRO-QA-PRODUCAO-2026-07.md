# ROTEIRO DE QA DE PRODUÇÃO — Console v2 (por tela)
Frente C2 · `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §4 item 2
Gerado: 2026-07-05 | Fonte de verdade das telas: `src/console/moduleCatalog.js` (`GRUPOS`)

## Como usar

Cada tela tem 4 passos binários: **dado real → ação → estado vazio → erro**. "PASSA" é
sempre uma condição objetiva (número bate, mensagem aparece, request específica disparou) —
nunca "verificar se está ok". Rode na ordem das prioridades; o resto do menu pode ser
paralelizado (uma sessão por grupo do menu).

Tenants de referência:
- **Karina Doceria** (cliente pagante piloto, store): `tenant_id = e9fdaa66-cbe7-4dff-905b-afc4b10219ff`
- **Consult** (agência/plataforma, dono da maioria dos dados internos/agentes): `tenant_id = 9079bd4d-4df7-4023-90fb-d79c8ba7e900`

Rodar SQL via MCP Supabase (projeto `czyanilrverorwenikqw`) ou `psql`. Console do browser
sempre aberto (F12 → Console + Network) durante todo o roteiro.

## Checks transversais (aplicar em TODA tela, além do check específico)

Do `scripts/qa-knowledge.md`, aplicáveis a qualquer tela que liste/some dados:

- **P1** — nenhuma linha vermelha de erro Postgres no Console (coluna inexistente em `.select()`).
- **P2** — `npm run build` termina em `✓ built in` antes de testar em prod (bundle atual).
- **P3** — bundle de prod bate com o commit testado (`scripts/verify-deploy.sh` ou hash do `<script>` no HTML).
- **P6** — se a tela soma/conta client-side, comparar com `count(*)`/`sum()` direto no banco — nunca confiar em contagem de array paginado (cap de 1000 do PostgREST).
- **P9** — telas LEGADO embutidas (`chat-legado`): testar com `cd-theme` = claro E escuro no localStorage — não pode ficar preta/branco-no-branco.
- **P10** — se a tela mostra "X de Y", `Y` não pode ser o mesmo número de um `.limit()` de outra lista da mesma tela.
- **P11** — antes de editar/testar um componente, `grep -rn "<título exato>" src/` — confirmar que é o componente montado (App.jsx só renderiza `<ConsoleV2/>`), não uma cópia morta.

**PASSA transversal** = nenhum dos itens acima falha, em qualquer tela testada.

---

## PRIORIDADE 1 — Caminho do cliente pagante (Karina Doceria)

### `visao` — Visão Geral
**Componente:** `VisaoGeral` (inline em `src/console/ConsoleV2.jsx:437`) — variante avaliação-only (`VisaoGeralAvaliacao`, linha 403) quando o tenant só tem módulos de Avaliações habilitados.
**Tabelas:** `agent_runs`, `internal_notifications`, `tenants`, `tenant_agents`, `defesa_metricas_mensal`, `defesa_casos`, `defesa_assinaturas`, `radar_fontes`, `atendimento_avaliacoes`, `nps_avaliacoes`.
- **Dado real:** logar como usuário da Karina → abrir `visao`. SQL: `select count(*) from atendimento_avaliacoes where tenant_id='e9fdaa66-cbe7-4dff-905b-afc4b10219ff'` e comparar com o KPI de CSAT exibido.
- **Ação:** clicar no KPI "Casos aguardando seu OK" → deve navegar para `defesa`.
- **Estado vazio:** logar com um tenant sem `agent_runs`/`defesa_casos` (store novo recém-onboardado) → KPIs mostram `0`/`—`, não `undefined`/`NaN`/spinner infinito.
- **Erro:** desligar a rede (DevTools → offline) e recarregar → tela mostra erro tratado, não tela branca.
- **PASSA quando:** todos os KPIs batem com SQL direto (P6) e nenhum mostra `NaN`/`undefined`.

### `csat` — Satisfação do Atendimento (CSAT)
**Componente:** `src/console/AtendimentoAvaliacoes.jsx`
**Tabela:** `atendimento_avaliacoes`
- **Dado real:** SQL `select count(*) filter (where status='respondida') as respondidas, count(*) from atendimento_avaliacoes where tenant_id='e9fdaa66-...'` → comparar com "X respondidas de Y" na tela.
- **Ação:** filtrar por período (7/30/90 dias) → contagem muda e bate com `created_at` filtrado no SQL.
- **Estado vazio:** filtrar um período sem avaliações (ex.: ano passado) → mensagem de "nenhuma avaliação no período", sem tabela quebrada.
- **Erro:** confirmar no Network que a query não usa `.limit(200)` reaproveitado para o KPI de topo (caso real P10, já corrigido 2026-07-01 — regressão se voltar).
- **PASSA quando:** "respondidas" bate exatamente com `count(*) filter (...)` do SQL, mesmo com >200 avaliações no tenant.

### `nps` — Lealdade da Marca (NPS)
**Componente:** `src/console/NpsResultados.jsx`
**Tabela:** `nps_avaliacoes`
- **Dado real:** SQL `select count(*), avg(nota) from nps_avaliacoes where tenant_id='e9fdaa66-...'` → comparar contagem e nota média com a tela.
- **Ação:** trocar o filtro de período → NPS recalcula (promotores − detratores) e bate com o SQL do mesmo filtro.
- **Estado vazio:** tenant/período sem respostas → mostra "sem dados" e não `NaN%`.
- **Erro:** simular resposta duplicada (2 registros do mesmo `pedido_ref`) → tela não deve contar em dobro (checar se há dedupe).
- **PASSA quando:** score exibido = `(promotores - detratores) / total * 100` calculado a partir do mesmo SQL, arredondamento incluído.

---

## PRIORIDADE 2 — Caminho de venda (Defesa Comercial, R$147, D6)

### `defesa` — Defesa Comercial
**Componente:** `Defesa` (inline `ConsoleV2.jsx:527`) — ou `PaywallDefesa` (`ConsoleV2.jsx:487`) se `defesaOn === false`.
**Tabela:** `defesa_casos` (única lida/escrita pelo componente `Defesa`, `ConsoleV2.jsx:541-553`). `defesa_assinaturas`/`defesa_metricas_mensal` são lidas pela tela `visao` (KPIs), não por esta; `defesa_aprovadores` é configurado em `AtivarLoja.jsx` (ver abaixo).
- **Dado real:** tenant COM `tenant_agent_config` para `defesa` habilitado e `count(*) from defesa_casos where tenant_id=... and status='aguardando_ok' > 0` → fila real aparece com os mesmos casos.
- **Ação:** abrir um caso `aguardando_ok` → aprovar/rejeitar → `status` muda no banco (`defesa_casos.status`, `aprovado_por`, `aprovado_em` preenchidos) e o card some da fila.
- **Estado vazio:** tenant sem nenhum `defesa_casos` → fila mostra "nenhum caso aguardando", não erro nem loop de loading.
- **Erro/Paywall:** tenant SEM Defesa contratada (`defesaOn === false`, ver `ConsoleV2.jsx:675`) → deve renderizar `PaywallDefesa` com CTA de e-mail, nunca a fila real nem crash.
- **PASSA quando:** (a) paywall aparece exatamente para tenants sem o agente habilitado e (b) a fila real bate 1:1 com `defesa_casos` filtrado por `tenant_id` + `status='aguardando_ok'`.

### Config de ativação (suporte à Defesa) — `ativar`
**Componente:** `src/console/AtivarLoja.jsx`
**Tabelas:** `lojas`, `whatsapp_groups`, `defesa_aprovadores`
- **Dado real:** cadastrar um aprovador de Defesa para a loja → linha nova em `defesa_aprovadores` com `tenant_id` correto.
- **Estado vazio:** loja sem grupo WhatsApp vinculado → tela indica "sem grupo", não trava o formulário.
- **Erro:** cadastrar aprovador com e-mail/telefone inválido → validação client-side bloqueia antes do `insert`.
- **PASSA quando:** o aprovador cadastrado aqui aparece imediatamente na tela `defesa` como quem pode assinar (`defesa_assinaturas`).

---

## RESTO DO MENU (por grupo do cv2)

Formato tabela — colunas: **Tela** (id) · **Componente** · **Tabela/fonte de dados** · **Dado real** · **Estado vazio** · **Erro** · **PASSA**.
"Bridge" = chama `bridge-server` (fetch autenticado por JWT), não Supabase direto — não dá para checar via SQL isolado, checar via Network tab (status 200 + payload) e log do PM2 na VPS.

### Início (1 restante — `visao` já coberta na Prioridade 1)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `deli` | `src/console/Deli.jsx` | `agent_runs`, `vera_anomalias`, `deli_agenda`, `deli_messages` | `count(*) from agent_runs where tenant_id=...` bate com feed de atividade | tenant sem `agent_runs` → feed vazio, sem crash | matar rede → feed mostra erro tratado | feed bate com SQL e não trava em loading infinito |

### Operação (17 restantes — `defesa`/`ativar` já cobertas na Prioridade 2)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `crm` | `CRM.jsx` → `screens/CRMScreen.jsx` | `customers`, `leads`, `crm_notas` | `count(*) from customers where tenant_id=...` bate com lista | tenant novo sem clientes → estado vazio, não tabela quebrada | buscar por nome inexistente → "nenhum resultado", sem erro no console | contagem da lista bate com SQL (P6) |
| `lojas` | `Lojas.jsx` → `LojasListView.jsx`/`LojaWorkspace.jsx` | `lojas`, `loja_metricas_snapshot`, `loja_consultores`, `profiles` | abrir uma loja real → workspace carrega métricas da mesma loja no banco | tenant sem lojas cadastradas → lista vazia com CTA de cadastro | abrir loja de outro tenant via URL/id manipulado → RLS bloqueia (lista vazia ou 403), nunca dado cruzado | workspace mostra só lojas do `tenant_id` da sessão |
| `chat` | `ChatAoVivoV2.jsx` (`console/chat/`) | `evolution_instances`, `customers`, `conversations`, `messages` | enviar msg de teste no WhatsApp da loja piloto → aparece na conversa em <30s | tenant sem conversas → "nenhuma conversa", sem tela branca | Evolution API fora do ar → tela usa Supabase como fonte 1ª (P3 do qa-knowledge), não trava | mensagem real aparece na thread certa sem duplicar |
| `chat-legado` | `screens/ChatScreen.jsx` | `conversations`, `messages`, `departments`, `bot_configs`, `whatsapp_groups`, etc. | mesma conversa aberta em `chat` e `chat-legado` mostra o mesmo histórico | — | **aplicar P9**: usuário com tema escuro salvo (`localStorage.cd-theme`) → tela não pode ficar preta ou branco-no-branco | P9 passa (ver comando de verificação no qa-knowledge.md) |
| `respostas-rapidas` | `src/console/RespostasRapidas.jsx` | `quick_replies`, `departments` | criar resposta rápida → aparece na lista e no picker do chat (`ListPicker`/`TagPicker`) | tenant sem respostas cadastradas → lista vazia com CTA | criar com texto vazio → validação bloqueia antes do insert | resposta criada aqui aparece no chat ao vivo na mesma sessão |
| `mia` | `src/console/MiaAudit.jsx` (admin only) | `lojas` (dropdown) + Bridge (`getMiaAudit`) | selecionar loja com consultoria ativa → últimas 100 runs aparecem | loja sem runs do worker MIA → "sem registros" | Bridge fora do ar → erro tratado, não trava | runs exibidas batem com o worker (latência/tokens preenchidos, não vazios) |
| `aprovacoes` | `src/console/AprovacoesUnificadas.jsx` | `agent_drafts`, `defesa_casos` | draft pendente de outro agente aparece na fila única | tenant sem drafts pendentes → "fila vazia" | aprovar/rejeitar 2x rápido (duplo clique) → não duplica o `update` | fila mostra TODOS os drafts pendentes de TODOS os agentes (GAP-3 do PLANO-MESTRE — conferir se está fechado) |
| `recontratacao` | `src/console/Recontratacao.jsx` | `customers`, `aceite_recontratacao` | cliente com aceite registrado aparece na lista com status correto | tenant sem aceites → lista vazia | forçar 2 aceites para o mesmo cliente → tela não deve duplicar linha | status do aceite bate com `aceite_recontratacao.status` no banco |
| `sofia` | `src/console/Sofia.jsx` | Bridge `/api/sofia/leads` (tabela de origem: `leads`, ver `bridge-server/routes/sofia.js:53`) + `tenant_members` (role) | aba "Leads" com `score_min` baixo → retorna leads reais do dia | filtro `score_min=10` num tenant sem leads altos → "nenhum lead encontrado", não erro | Bridge fora do ar → toast de erro, não tela branca | leads da aba Pipeline somam o mesmo total da aba Leads (mesma fonte, sem `.limit` divergente — P10) |
| `disparos` | `src/console/Disparos.jsx` → `lib/api.js` (`agent_drafts`) | `agent_drafts` | draft de disparo em massa aparece com canal certo (`whatsapp_grupo`/`whatsapp_pv`) | tenant sem disparos pendentes → lista vazia | aprovar disparo sem canal definido → bloqueado antes do envio | draft aprovado aqui muda de status em `agent_drafts` e não é reenviado 2x |
| `cora` | `src/console/Cora.jsx` | `cora_cobrancas`, `cora_acoes`, `cobranca_eventos`, `cobrancas`, `tenant_agent_config` | tenant com cobrança em aberto → aparece com valor e vencimento reais do Asaas | tenant sem inadimplência → "nenhuma cobrança pendente" | `tenant_agent_config` da Cora desligado → tela indica agente inativo, não lista vazia disfarçada | valor total exibido bate com `sum(valor)` das cobranças abertas no banco (P6) |
| `radar` | `src/console/RadarReal.jsx` | `radar_fontes`, `defesa_casos` | loja com coleta GESTOR ativa → mostra métricas do dia anterior (coleta 22h/10h) | loja sem `radar_fontes` configurada → "sem fonte conectada" | fonte com token expirado → indicador de erro na fonte, não silencia | data da última coleta exibida bate com `radar_fontes.updated_at` |
| `cardapio-ifood` | `src/console/CardapioIfood.jsx` | Bridge (sessão iFood via portal-worker) | loja piloto → lista de itens pausados/ativos bate com o portal do iFood | loja sem integração iFood ativa → mensagem de "conectar loja" | sessão do portal expirada → erro tratado pedindo reautenticação, não trava em loading | itens pausados na tela = itens pausados no portal real (checagem visual cruzada) |
| `espacos` | `screens/TarefasClientesScreen.jsx` → `lib/api.js` (`espacos_workspaces/folders/lists/columns`, `client_tasks`) | criar card em uma lista → aparece na coluna certa e em `client_tasks` | workspace novo sem listas → estado vazio com CTA "criar lista" | mover card para coluna inexistente (drag-drop cancelado) → não perde o card | card criado/movido aqui persiste após F5 (reload) |
| `campanhas` | `Campanhas.jsx` (multi-view: dashboard/lojas/nova/gerando/revisar/aprovada/histórico) | `campanhas`, `lojas` | criar campanha → passa por `gerando` → `revisar` → `aprovada`, cada etapa gravando em `campanhas` | tenant sem campanhas → dashboard mostra zerado, não quebra | aprovar campanha sem revisar (pular etapa via navegação manual) → bloqueado | `historico` lista exatamente as campanhas com status `aprovada`/`enviada` do banco |
| `grupos` | `src/console/Grupos.jsx` | `evolution_instances`, `whatsapp_groups`, `internal_channels`, `channel_members` | grupo real vinculado à loja aparece na lista com `evolution_jid` correto | tenant sem grupos cadastrados → "nenhum grupo", nunca timeout de 15s (P do BomDia, ver qa-knowledge) | Evolution API lenta → não trava a tela (fonte primária é Supabase, não Evolution ao vivo) | grupo listado aqui = grupo real no WhatsApp (checar nome/JID) |
| `contratos` | `src/console/Contratos.jsx` | `contratos` | contrato gerado para cliente real aparece com valor/data corretos | tenant sem contratos → lista vazia | gerar contrato sem cliente vinculado → bloqueado antes do insert | contrato criado aqui é o mesmo exibido em `screens/Contratos/ContratosScreen.jsx` (sem duplicar tela — checar P11) |

### Avaliações (4 restantes — `csat`/`nps` já cobertas na Prioridade 1)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `avaliacoes` | `src/console/Avaliacoes.jsx` → `lib/api.js` | `avaliacoes`, `avaliacoes_loja_config`, `lojas` | colar avaliação real do iFood → aparece na lista da loja certa | loja sem avaliações coladas ainda → "nenhuma avaliação", CTA de colar | salvar avaliação sem nota → validação bloqueia | avaliação colada aqui aparece em `resp-avaliacoes` para gerar resposta |
| `resp-avaliacoes` | `src/console/PainelAvaliacoesConsultor.jsx` | `reviews`, `lojas`, `espacos_folders/lists/columns`, `client_tasks` | gerar resposta com IA para avaliação real → draft aparece editável (≤300 caracteres) | loja sem avaliações pendentes de resposta → "fila vazia" | editar resposta aprovada antes de publicar (PR #723) → nova edição sobrescreve o draft anterior, não duplica | resposta publicada aqui bate com o texto realmente enviado ao iFood (conferir portal) |
| `controle-atendimentos` | `src/console/ControleAtendimentos.jsx` | `nps_avaliacoes`, `atendimento_avaliacoes` | métricas agregadas do painel batem com `csat`/`nps` somados no mesmo período | tenant sem dados em nenhuma das 2 tabelas → zerado, não `NaN` | período com dado em uma tabela só (ex.: só NPS) → não trava por falta da outra | números aqui = soma exata do que aparece separadamente em `csat` + `nps` |
| `avaliacao-config` | `src/console/AvaliacaoConfig.jsx` | Bridge (`apiFetch`, `VITE_BRIDGE_URL`) — persistência real em `avaliacoes_loja_config` | mudar tom/logística de uma loja → próxima avaliação gerada usa a config nova | loja sem config salva ainda → usa default sem erro | Bridge fora do ar → toast de erro, config não é perdida (não salva "vazio" por cima) | config salva aqui é a mesma lida por `avaliacoes`/`resp-avaliacoes` para essa loja |

### Agentes IA (24 telas)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `hub` | `src/console/DeliHub.jsx` | `agent_runs` | painel mostra runs recentes de todos os agentes do tenant | tenant novo sem runs → vazio | agente com run `status='error'` → aparece destacado, não escondido | contagem de runs por agente bate com `count(*) group by agent_id` |
| `catalogo` | `src/console/PainelAgentes.jsx` | `agents`, `tenant_agents`, `agent_runs` | habilitar/desabilitar agente para o tenant → reflete em `tenant_agents.enabled` | tenant sem nenhum agente habilitado → catálogo mostra todos como desabilitados, não vazio | desabilitar agente que tem draft pendente → draft não some (checar `aprovacoes`) | agente habilitado aqui aparece no menu (`GRUPOS`) do tenant na próxima navegação |
| `estudio` | `src/console/Estudio.jsx` | `lojas`, `estudio_criacoes`, `agent_drafts` | gerar criação para loja real → aparece em `estudio_criacoes` com preview | loja sem criações → "nenhuma criação ainda" | gerar sem loja selecionada → bloqueado | criação aprovada aqui vira `agent_drafts` corretamente tipado |
| `lara-editorial` | `src/console/LaraEditorial.jsx` | `content_calendar`, `content_published` | post agendado real aparece no calendário na data certa | mês sem posts agendados → calendário vazio, não quebra grid | mover post para data passada → bloqueado ou avisa | post publicado aqui aparece em `PublicadosLara.jsx` |
| `lara` | `src/console/Lara.jsx` | `lojas`, `agent_runs`, `agent_drafts` | régua de CRM real dispara → `agent_runs` novo + draft se aplicável | tenant sem régua configurada → tela indica "sem régua ativa" | 2 disparos simultâneos pro mesmo cliente → dedupe evita duplicidade | run aparece com `status` final coerente (ok/error), nunca preso em "running" >1h |
| `gestor` | `src/console/Gestor.jsx` | `loja_metricas`, `lojas`, `agent_chat_messages` | loja com coleta ativa → métricas do dia aparecem após a janela da coleta (22h ou 10h, ver decisão travada) | loja sem coleta configurada → "sem dados ainda" | Bridge/portal fora do ar → indicador de falha na fonte, não silencia | métrica exibida bate com `loja_metricas` mais recente daquela loja |
| `gestor-dashboard` | `src/console/GestorDashboard.jsx` | `lojas`, `loja_metricas`, `client_timeline`, `agent_drafts` | dashboard agregado das 14 lojas → soma bate com `sum()` direto no banco (P6) | tenant sem lojas no GESTOR → dashboard vazio | uma loja sem coleta do dia → não derruba o agregado das outras | total exibido = soma exata das lojas com dado no dia |
| `tarefas-globais` | `src/console/TarefasGlobais.jsx` | `lojas` + Bridge (board kanban) | mover card de tarefa entre colunas → persiste após reload | nenhuma tarefa global → board vazio com colunas visíveis | Bridge indisponível → erro tratado, board não perde estado local | card movido aqui reflete no board de todos que acessam o mesmo tenant |
| `automacoes` | `src/console/Automacoes.jsx` | nenhuma (menu launcher estático) | clicar em cada card → navega para a tela real (`heartbeats`, `metas`, `construtor`, etc.) | — (tela sem estado de dado) | clicar 2x rápido → não navega 2 telas em sequência | todos os 8 cards navegam para telas que existem e carregam |
| `habilidades` | `src/console/Habilidades.jsx` | `agent_skills` | habilidade real cadastrada aparece na lista | tenant sem habilidades customizadas → lista vazia | cadastrar habilidade duplicada (mesmo nome) → bloqueado ou avisa | habilidade cadastrada aqui é a que o agente realmente usa na próxima execução |
| `analise` | `src/console/AnaliseLoja.jsx` | `lojas`, `analise_loja` | rodar análise para loja real → resultado aparece com recomendações não genéricas | loja sem análise ainda → CTA "rodar análise" | rodar 2x seguidas → não duplica registro, atualiza o mesmo | análise exibida = último registro de `analise_loja` para aquela loja |
| `cardapio` | `src/console/AgenteAnalise.jsx` (agente="cardapio") | `lojas`, `agente_analises` | rodar para loja real → sugestões de nome/descrição/preço aparecem | loja sem cardápio cadastrado → indica dado insuficiente, não trava | rodar sem loja selecionada → bloqueado | resultado persiste em `agente_analises` com `agente='cardapio'` |
| `multicanal` | `src/console/AgenteAnalise.jsx` (agente="multicanal") | `lojas`, `agente_analises` | rodar para loja com múltiplos canais → panorama consolidado aparece | loja com 1 canal só → indica dado limitado, não erro | canal sem métrica no período → exclui do panorama sem quebrar total | resultado persiste com `agente='multicanal'`, distinto do `cardapio` |
| `construtor` | `screens/AgentBuilderScreen.jsx` | Bridge (sessão autenticada) | criar agente novo → aparece no `catalogo` após salvar | tenant sem agentes customizados → builder vazio, template em branco | salvar sem nome/config obrigatória → bloqueado | agente criado aqui é selecionável em `tenant_agents` do tenant |
| `oracle` | `src/console/Oracle.jsx` | Bridge (sessão autenticada) | gerar agente via prompt → resultado é agente funcional (não mock) | prompt vazio → bloqueado, não gera lixo | Bridge/LLM fora do ar → erro tratado | agente gerado aqui aparece em `construtor`/`catalogo` |
| `inbox` | `src/console/AgentInbox.jsx` | `lib/api.js` (`agent_drafts`, realtime) | draft novo de qualquer agente aparece em tempo real (sem F5) | tenant sem drafts → inbox vazio | 2 abas abertas, aprovar em uma → a outra reflete via `subscribeToDrafts` sem duplicar | draft aprovado aqui muda de status nas duas abas |
| `tarefas` | `CvNovas.jsx` (`TarefasAgendadas`, `CrudTela`) | `tenant_tarefas` | criar tarefa com `quando` futuro → aparece com status `agendada` | tenant sem tarefas → "— nenhum registro ainda —" | criar sem título (`required`) → bloqueado antes do insert | tarefa criada aqui persiste após F5 e some da lista após execução (status muda) |
| `gatilhos` | `CvNovas.jsx` (`Gatilhos`, `CrudTela`) | `tenant_gatilhos` | criar gatilho para fonte real (whatsapp/asaas/ifood) → aparece na lista | tenant sem gatilhos → vazio | criar sem nome → bloqueado | gatilho criado aqui dispara a ação configurada no evento real (checar `execucoes_7d`) |
| `heartbeats` | `src/console/Heartbeats.jsx` | Bridge + Supabase (sessão) | heartbeat real de um agente aparece com último "batimento" recente | agente sem heartbeat configurado → "sem monitoramento ativo" | agente atrasado (>SLA) → aparece destacado como atrasado, não escondido | heartbeat atrasado aqui gera task em `client_tasks` (reusar caminho do orquestrador) |
| `atividade` | `src/console/Execucoes.jsx` | `agent_runs`, `agents` | lista de execuções bate com `count(*) from agent_runs where tenant_id=...` (P6) | tenant sem execuções → lista vazia | run com `status='error'` → aparece com erro visível, não escondida | contagem e custo exibidos batem com SQL direto (ver caso #173 do qa-knowledge) |
| `metas` | `src/console/Metas.jsx` | Bridge (sessão autenticada) | meta real cadastrada → progresso reflete dado real do período | tenant sem metas → "nenhuma meta definida" | meta com valor alvo zerado/negativo → bloqueado no cadastro | progresso exibido = `valor_atual / meta` calculado com dado do período certo |
| `topicos` | `CvNovas.jsx` (`Topicos`, `CrudTela`) | `tenant_topicos` | criar tópico com responsável real → aparece com status `aberto` | tenant sem tópicos → vazio | criar sem título → bloqueado | tópico criado aqui muda de status (`em_andamento`→`concluido`) e persiste |
| `modelos` | `src/console/Templates.jsx` | `templates` | template real cadastrado → disponível para uso em disparos/campanhas | tenant sem templates → lista vazia | criar template duplicado (mesmo nome) → avisa/bloqueia | template criado aqui aparece nas telas que o consomem (`disparos`, `campanhas`) |
| `config` | `src/console/AgenteConfig.jsx` | `tenant_agents`, `tenant_agent_config` | mudar `modo_override` de um agente → reflete no comportamento real na próxima execução | tenant sem config customizada → usa default do agente | salvar config inválida (JSON malformado) → bloqueado antes do insert | config salva aqui é a lida por `getTenantAgentConfig(tenantId, agentId)` no próximo run |

### Dados (7 telas)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `arquivos` | `CvNovas.jsx` (`Arquivos`) | `tenant_files` + Storage bucket `tenant-files` | subir arquivo real → aparece na lista e o link assinado abre o arquivo | tenant sem arquivos → lista vazia | subir arquivo com nome com caracteres especiais → sanitizado (`replace(/[^\w.\-]+/g,'_')`), não quebra o path | download via signed URL abre o arquivo correto (não outro tenant — checar isolamento do path `tenantDbId/uuid-nome`) |
| `links` | `CvNovas.jsx` (`Links`, `CrudTela`) | `tenant_links` | criar link com validade → contagem de acessos incrementa ao abrir | tenant sem links → vazio | criar sem URL → bloqueado | link expirado (`expira_em` passado) não deve mais abrir (checar enforcement, hoje é só exibição) |
| `memoria` | `src/console/Memorias.jsx` | Bridge (sessão autenticada) | memória real de um agente aparece com conteúdo não genérico | agente sem memórias → "nenhuma memória registrada" | Bridge fora do ar → erro tratado | memória exibida aqui é a mesma lida pelo agente na próxima execução (`agent_memories`) |
| `conhecimento` | `src/console/Conhecimento.jsx` | Bridge (sessão autenticada, RAG) | documento real indexado → aparece na base e é recuperável em busca | tenant sem documentos → base vazia | upload de arquivo não suportado (ex: .exe) → bloqueado | documento indexado aqui é retornado numa busca RAG relevante |
| `custos` | `src/console/CustosIA.jsx` | `agent_runs`, `agents` | custo total exibido bate com `sum(cost_usd) from agent_runs where cost_usd > 0` (P6 — nunca somar lista paginada) | tenant sem runs com custo → `R$0,00`, não vazio quebrado | período sem nenhum run → zerado, não erro | custo por agente bate com SQL agregado por `agent_id` |
| `importar` | `src/console/ImportarRelatorios.jsx` | `lojas`, `radar_fontes`, `radar_metricas`, `radar` | importar relatório real (CSV/upload) → vira linhas em `radar_metricas` vinculadas à loja certa | loja sem fonte `radar_fontes` configurada → bloqueado com mensagem clara | importar arquivo com colunas faltando → erro específico (qual coluna), não crash genérico | dado importado aqui aparece em `radar`/`gestor-dashboard` da mesma loja |
| `relatorios` | `src/console/Relatorios.jsx` | Bridge (sessão autenticada) | gerar relatório real de um período com dado → PDF/export reflete os números do banco | período sem dado → relatório indica "sem dados", não gera arquivo vazio "válido" | gerar 2 relatórios simultâneos → não corrompe/mistura os dois arquivos | número no relatório exportado bate com o mesmo SQL usado nas telas de origem |

### Sistema (14 telas)

| Tela | Componente | Fonte | Dado real | Vazio | Erro | PASSA |
|---|---|---|---|---|---|---|
| `usuarios` | `src/console/Usuarios.jsx` (admin only) | `tenant_modules` + `tenant_members` | habilitar módulo para um usuário → ele passa a ver a tela no menu na próxima sessão | tenant novo sem módulos configurados → modal de permissões quase vazio (débito conhecido, ver qa-knowledge caso Karina) | remover módulo que o usuário está usando agora → não quebra a sessão ativa, só a próxima navegação | módulo habilitado aqui aparece em `GlobalSearch` e no menu lateral do usuário-alvo |
| `configsys` | `src/console/Configuracoes.jsx` | `tenant_modules` | trocar configuração do tenant → persiste e reflete nas telas dependentes | tenant novo → configs default, sem erro | salvar config conflitante (ex.: 2 defaults) → bloqueado | config salva aqui é a lida por `onTenantChange` no restante do app |
| `clientesplat` | `src/console/Clientes.jsx` (nível plataforma) | `tenants`, `tenant_agents`, `defesa_assinaturas`, `tenant_members` | listar todos os tenants reais (agência + stores) → contagem bate com `count(*) from tenants` | plataforma sem tenants além do consult → lista com 1 item, não vazia/quebrada | abrir tenant sem `tenant_members` (órfão) → não crasha, mostra "sem membros" | lista aqui reflete exatamente a hierarquia Plataforma→Agência→Loja (`parent_tenant_id`) |
| `marca` | `src/console/Marca.jsx` | `tenants` | trocar logo/cor da marca → reflete no header (`Marca.onChanged` → `recarregarBrand`) imediatamente | tenant sem marca customizada → usa default Consult Delivery | upload de logo corrompido/inválido → bloqueado, não salva referência quebrada | logo trocado aqui aparece no `<img>` do header do próprio tenant (não vaza para outros) |
| `provedores` | `CvNovas.jsx` (`Provedores`) — **read-only, placeholder** | nenhuma (tela de referência, botão "Disponível na próxima atualização" desabilitado) | abrir a tela → renderiza sem erro | — (não há estado vazio de dado, é sempre estático) | — | tela renderiza e o botão de ação aparece desabilitado (não falsamente clicável) |
| `integracoes` | `CvNovas.jsx` (`Integracoes`) — **read-only, placeholder** | nenhuma | idem `provedores` | — | — | idem `provedores` |
| `vendaerp` | `src/console/VendaErpPainel.jsx` | Bridge (sessão autenticada) | ação real de venda/ERP → reflete no sistema externo (checar log do Bridge) | sem integração ERP ativa para o tenant → indica "não configurado" | Bridge/ERP fora do ar → erro tratado | ação disparada aqui aparece no log de `audit_log` |
| `sistemas` | `CvNovas.jsx` (`Sistemas`) — **read-only, referência** | nenhuma (atalhos estáticos) | abrir a tela → links/atalhos abrem os sistemas corretos | — | link quebrado (404) → não deveria existir; checar todos os hrefs | todos os atalhos abrem o destino esperado em nova aba |
| `onboarding` | `src/console/Onboarding.jsx` | `onboarding_checklists` | novo tenant → checklist real aparece com itens pendentes | tenant sem checklist gerado → CTA "iniciar onboarding" | marcar item já concluído novamente → idempotente, não duplica progresso | item marcado aqui persiste em `OnboardingDetalhe.jsx` e no dashboard |
| `acesso` | `src/console/AcessoUsuarios.jsx` | `tenant_members`, `tenant_agents`, `user_agent_access` | conceder acesso de agente a um usuário real → ele passa a invocar o agente | tenant sem grants extras → lista vazia (só membros base) | conceder acesso a usuário removido do tenant (grant órfão) → não deve ser possível (ver P7 do qa-knowledge) | `select` de grants órfãos (P7) retorna 0 linhas após esta tela ser usada corretamente |
| `auditoria` | `src/console/AuditLog.jsx` | `audit_log` | ação real (aprovar draft, mudar RBAC) → aparece no log com ator e timestamp corretos | tenant sem ações auditadas ainda → lista vazia | filtrar por ator sem eventos → "nenhum evento", não erro | evento exibido aqui = evento real gravado por `logAgentRun`/RBAC no mesmo instante |
| `notificacoes` | `src/console/Notificacoes.jsx` | `internal_notifications` (realtime) | notificação broadcast real → aparece e conta no badge do menu | tenant sem notificações → badge zerado, lista vazia | marcar como lida → badge zera e NÃO volta a contar (regressão conhecida: RLS bloqueando update em broadcast, ver caso 2026-07-01) | notificação marcada como lida aqui não reaparece após F5 |
| `monitor` | `src/console/MonitorSessoes.jsx` | Bridge (sessão autenticada) | sessão real ativa de outro usuário aparece na lista | nenhuma sessão além da própria → lista com 1 item | encerrar sessão de outro usuário → ele é deslogado na próxima ação (checar via 2ª aba/navegador) | sessão encerrada aqui realmente derruba o usuário-alvo |
| `pipeline` | `src/console/PipelineScreen.jsx` | `agent_runs`, `client_tasks` | pipeline ao vivo mostra execução real em andamento, atualizando sem F5 | tenant sem execuções ativas → "nenhuma execução no momento" | execução travada (>SLA sem update) → aparece destacada, não escondida como "em andamento" para sempre | etapa exibida bate com o `status` mais recente do `agent_runs`/`client_tasks` correspondente |

---

## Tabela-resumo de cobertura

Contagem de telas no código (`grep -oE "id: '[a-z0-9-]+'" src/console/moduleCatalog.js \| wc -l`): **72**.
Contagem de telas cobertas neste roteiro: **72** (3 na Prioridade 1 + 2 na Prioridade 2 + 67 no restante do menu).

| Grupo (cv2) | Telas no código | Telas no roteiro |
|---|---|---|
| Início | 2 | 2 (1 Prioridade 1 + 1 tabela) |
| Operação | 19 | 19 (2 Prioridade 2 + 17 tabela) |
| Avaliações | 6 | 6 (2 Prioridade 1 + 4 tabela) |
| Agentes IA | 24 | 24 |
| Dados | 7 | 7 |
| Sistema | 14 | 14 |
| **Total** | **72** | **72** |

## Pendente / fora deste roteiro

- `cobranca` (case existente em `ConsoleV2.jsx:754` → `Inadimplentes.jsx`) não está em nenhum item de `GRUPOS` — não é alcançável pelo menu hoje (dead route). Confirmar se é intencional (substituído por `cora`) antes de remover.
- GAP-3 (fila única de aprovações) e GAP-4 (custos agregados) citados no PLANO-MESTRE §4 item 1 — o check de `aprovacoes` e `custos` acima cobre o comportamento esperado, mas a auditoria formal desses GAPs é a C1 (sessão separada), não este roteiro.
