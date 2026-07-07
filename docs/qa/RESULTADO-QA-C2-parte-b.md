# RESULTADO QA C2 — Parte B (resto do menu, 67 telas)

Executado via 5 agentes paralelos (grep estático P1/P6/P10 + SQL SELECT/count via MCP Supabase,
projeto `czyanilrverorwenikqw`, tenants de referência Karina Doceria `e9fdaa66-...` e Consult `9079bd4d-...`).
Zero escrita/migration em prod. Checks de Ação/Erro que exigem navegador estão marcados **PRECISA-BROWSER**
(esperado — não é falha do checador).

## Resumo

- **PASSA (estático):** 36 telas
- **FALHA corrigida neste PR (P1 — coluna inexistente):** 7 telas
- **FALHA registrada, NÃO corrigida neste PR (P6/P10 — contagem client-side sobre lista capada):** 8 telas
- **FALHA de isolamento corrigida no PR #860 (2026-07-07):** 2 telas (notificações + acesso) — defense-in-depth (espelho client-side da RLS)
- **PRECISA-BROWSER (Bridge-only ou requer interação real):** 14 telas

## FALHAS P1 corrigidas neste PR (diff mínimo)

| Tela | Arquivo:linha | Bug | Fix |
|---|---|---|---|
| `deli` | `src/console/Deli.jsx:291,196-197` | `vera_anomalias.select('tipo,descricao,...')` — colunas reais são `metrica,explicacao` | Select + render corrigidos |
| `catalogo` | `src/console/PainelAgentes.jsx:129,174` | `tenant_agents.select('...,modo,...')` — coluna `modo` não existe (real: `enabled`); upsert enviava `modo` também | Select→`enabled`; upsert→`enabled:true`; variável `agente` morta removida |
| Painel Gestor | `src/console/GestorDashboard.jsx:95-103,232,255` | `client_timeline.select('summary,metadata,created_at,...')` (reais: `description,payload,ts`) + `agent_drafts.select('body,...')` (real: `content`) — erro de `diarioRes`/`sugestoesRes` nunca era checado (só `metricasRes`), então as 2 seções ficavam sempre vazias em silêncio | Colunas corrigidas nos 2 selects + render; erro dos 3 `Promise.all` agora checado |
| `lara` | `src/console/Lara.jsx:643,653,664` | Renderiza `d.body` de `agent_drafts` — coluna real é `content`; corpo do rascunho sempre aparecia vazio mesmo com 100 rascunhos reais (Karina) | `d.body`→`d.content` (3 ocorrências) |
| `chat-legado` | `src/screens/ChatScreen.jsx:2124,2143,5338` | `customers.select('...,document,...')` — coluna não existe | Removida do select e do campo "Documento" na UI (sem fonte de dado) |
| `cora` | `src/console/Cora.jsx:1015,1019,1058` | `tenant_agent_config.select('mode')`/upsert `mode:...` — coluna real é `modo_override`; leitura sempre `undefined`, toggle nunca refletia estado real | Select/upsert corrigidos para `modo_override` |

**Quality bar:** `npm run build` verde após todos os 7 fixes.

## FALHAS P6/P10 registradas — NÃO corrigidas neste PR (requer mudança de query, fora de "diff mínimo")

Padrão comum: `.limit(N)` + contagem/soma **client-side** sobre o array capado, exibida como total real.
Evidência = contagem real via `count(*)` comparada ao cap.

| Tela | Arquivo:linha | Cap | Real (SQL) | Impacto |
|---|---|---|---|---|
| `controle-atendimentos` | `ControleAtendimentos.jsx:261-274` | 500 | **1075** (Karina, 30d) | CSAT/tempo médio sub-contam hoje, não é risco latente |
| `hub` | `DeliHub.jsx:194-198` | 50 | **3904** (Consult, 30d) | KPI "Execuções" sempre mostra 50 |
| `atividade` | `Execucoes.jsx:82` | 1000 | **1975** (Consult, 15d) / 1194 (7d) | ✅ CORRIGIDO (#863, 2026-07-07) — KPIs total/ok/falhas e taxa de sucesso agora usam `count: 'exact', head: true` real (3 queries paralelas, respeitando filtros). Dívida honesta: custo/duração seguem do array capado (rótulo "aprox. (ate 1000 recentes)") — aggregação exigiria RPC/SUM server-side. Mesma classe do caso #173 já corrigido em `visao` |
| `chat` | `console/chat/engine/useConversas.js` LIMIT_CONVS=150 | 150 | **177** (Consult) | Badges de filtro (aguardando/abertos) sub-contam |
| `aprovacoes` | `AprovacoesUnificadas.jsx:244-249` | 100 | **394** (Consult, agent_drafts aprováveis) | ✅ CORRIGIDO (#866, 2026-07-07) — KPIs "Mensagens pendentes"/"Defesa pendente"/"Sugestões MIA"/"Total fila" agora usam `count: 'exact', head: true` (3 queries paralelas, mesmos filtros de status). Count de drafts aplica `.not('channel'/'agent_name')` para casar com `draftsAprovacao` (canais/agentes ocultos fora). Filtros de UI continuam afetando só a lista exibida, não o KPI total (comportamento preservado) |
| `recontratacao` | `Recontratacao.jsx:194,218` | 500 | **1172** (Consult, customers) | "X de Y" incorreto |
| `pipeline` | `PipelineScreen.jsx:373-380` | 200 | 186/24h (Consult, 93% do cap) | ✅ CORRIGIDO (#869, 2026-07-07) — cap 200→1000 (mesmo teto do `Execucoes.jsx`) + ordenação da query trocada de `pipeline_position` asc primeiro para `created_at desc` primeiro (mais recentes primeiro — tela de monitoramento ao vivo). Antes, quando o volume excedia 200, a query pegava as 200 com menor `pipeline_position` (estágios iniciais) e descartava runs de estágios finais mesmo recentes. Re-sort por coluna (`pipeline_position` asc dentro da coluna) continua client-side em `runsPerCol` — comportamento visual inalterado |
| `radar` | `RadarReal.jsx:238,255` | 500 | não medido (mesmo padrão) | Risco latente, não confirmado estourado |

**Recomendação:** trocar `.length`/reduce sobre a lista capada por uma 2ª query `count(*)`/`sum()` real
(padrão já usado em `CustosIA.buscarTodosRuns`, que pagina via `.range()` até esgotar, e em
`ConsoleV2.useKpisReais` pro caso #173). Merece PR próprio por tela (mudança de query real, não 1 linha).

## FALHAS de isolamento — ✅ CORRIGIDAS no PR #860 (2026-07-07, defense-in-depth)

> A RLS de ambas as tabelas já limitava o acesso no nível do banco. O PR #860
> adicionou o **espelho client-side** do filtro (defense-in-depth: o dado da
> tela nunca depende só da policy — se a RLS for desligada/bypassada por
> service_role, ou a coluna mudar, o frontend continua filtrando).

| Tela | Arquivo:linha | Bug | Fix (#860) | Evidência (pré-fix) |
|---|---|---|---|---|
| `notificacoes` | `src/lib/api.js:957-978` `listNotifications`/`countUnreadNotifications` | Filtrava só por `tenant_id`, **não** por `recipient_user_id` — qualquer usuário via notificações de outros usuários do mesmo tenant | Adicionado `.or('recipient_user_id.eq.{userId},recipient_user_id.is.null')` — broadcasts (recipient_user_id NULL) continuam visíveis a todos os membros do tenant, direcionadas só ao destinatário | Consult tem 397 linhas em `internal_notifications`, Karina 12 — volume real suficiente pra expor visualmente |
| `acesso` | `src/console/AcessoUsuarios.jsx:29-37` `carregarGrants` | `user_agent_access.select(...).eq('user_id', sel)` sem `.eq('tenant_id', tenantDbId)` — se um `user_id` pertencer a 2+ tenants, grants de outro tenant vazam | Adicionado `.eq('tenant_id', tenantDbId)` + guard `!tenantDbId` retorna cedo | `SELECT count(*)` de grants órfãos (P7) hoje = **0** — sem exploit ativo agora (nenhum usuário multi-tenant hoje), mas o código estava errado e virava exploit assim que existisse |

## Telas PASSA (estático) — sem achado

`crm`, `lojas`, `respostas-rapidas`, `mia`, `sofia`, `cardapio-ifood`, `grupos`, `contratos`,
`avaliacoes`, `resp-avaliacoes` (ressalva: `reviews` não tem `tenant_id`, isolamento só via `store`/RLS),
`arquivos`, `links`, `custos`, `importar`, `estudio`, `lara-editorial`, `gestor`, `automacoes`,
`habilidades`, `analise`, `cardapio` (agente), `multicanal`, `tarefas`, `gatilhos`, `topicos`, `modelos`,
`config`, `usuarios`, `configsys`, `clientesplat`, `marca`, `provedores`, `integracoes`, `sistemas`,
`vendaerp`, `onboarding`, `auditoria`, `monitor`.

Nota: `provedores`/`integracoes`/`sistemas` — o roteiro os descreve como "sem tabela" mas o código
usa tabelas reais (`tenant_provedores`/`tenant_integracoes`/`tenant_sistemas`), todas colunas existem.
Roteiro desatualizado, não é falha de produto.

## PRECISA-BROWSER (Bridge-only, sem chamada Supabase direta, ou exige interação real)

`chat` (fluxo completo), `chat-legado` (P9 tema), `avaliacao-config`, `memoria`, `conhecimento`,
`relatorios`, `disparos`, `espacos`, `campanhas`, `construtor`, `oracle`, `heartbeats`, `metas`, `inbox`
(nota: roteiro descreve fonte `lib/api.js`+realtime que não existe no componente atual — `AgentInbox.jsx`
é 100% Bridge `/agent-tickets`; roteiro desatualizado pra este componente).
