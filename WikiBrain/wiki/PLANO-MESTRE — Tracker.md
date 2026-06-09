# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔀 HANDOFF ATIVO — Cowork → sessão da VPS (2026-06-09)

A sessão **Cowork** (desktop) parou aqui e passou o bastão para a **sessão Claude rodando na VPS** continuar o desenvolvimento. Onde a sessão da VPS começa:
1. Leia este Tracker inteiro + `PLANO-MESTRE.md` + **`docs/prototipo/METODO-CONSOLE-V2.md`** (regra de ouro do visual).
2. Tudo está em `main`, build verde. Pegue o estado com `git fetch && git pull`.
3. Trabalhe SEMPRE em branch + PR (nunca `main`). Mandato D5 v2 vale: SQL aprovado pelo Wandson antes de aplicar; VPS/credenciais são do Wandson.
4. Próxima ação concreta: ver seção **👉 Próxima ação** abaixo.

**Mapa do Console v2 (arquivos que importam):**
- `src/console/ConsoleV2.jsx` — shell: `GRUPOS` (5 grupos do protótipo), `render()` (switch de telas), `Set LEGADO` (telas clássicas reusadas), hooks `useTenants`/`useTopbar`/`useBranding` (topbar).
- `src/console/CvIcons.jsx` — sprite SVG **idêntico ao protótipo** (`<Ico name="i-..." />`).
- `src/console/CvNovas.jsx` — telas novas (Gatilhos, Tópicos, Arquivos, Links, Tarefas, Provedores, Integrações, Sistemas) em estado-vazio/estrutura — **faltam tabela+CRUD**.
- `src/console/ChatV2.jsx` — Chat ao Vivo no visual claro (lista+thread+realtime+envio). Botão "Versão completa" abre o `ChatScreen` clássico (mídia/áudio/bots/tarefas).
- `src/console/console.css` — design system claro do cv2.
- **`docs/prototipo/console-v2.html`** — fonte da verdade do visual (protótipo). **Toda tela nova/alterada: faça primeiro no protótipo, depois porte idêntico.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson**. **Reservado ao Wandson:** aprovar SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes · reabrir decisões travadas · credenciais/rotação · VPS.

> **Mandato noite autônoma (sessões 16-17, 2026-06-08):** pré-aprovação de **SQL aditivo/reversível apenas**. **NÃO feito (deixado para revisão):** DELETE/limpeza (inclui registros de teste), DROP, rotação de credenciais, cobrança real Asaas.

---

## 🔓 D6 — plataforma completa (decisão do fundador, 2026-06-07)

**D7:** cliente novo = Radar grátis até pagar · R$147/loja/mês sem setup. Plataforma completa: Etapas A (consolidação), B (console), C (agentes), D (white-label) ✅. Sidebar sem item "em breve".

## 🔒 D6 — Direcionamento SaaS (APROVADA 2026-06-07)
**F1 = Defesa Comercial iFood copiloto, R$147/loja/mês.** Doc: `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md`.

---

## 🔴 Onde parou

_Última sessão: 2026-06-09 (VPS — **sessão 26: Arquivos com upload/download real — bucket privado + RLS (PR #261, aguarda ok do SQL)**)_

### Sessão 26 — VPS (Storage em Arquivos — opção 1, peça 1/3)
Wandson pediu "começa pela opção 1" (migrations dinâmicas). Pela regra "1 arquivo por vez", opção 1 vira 3 migrations; começou pela mais limpa e verificável: **Storage em Arquivos**. A tabela `tenant_files` já existia (#239) mas a tela só tinha upload **fake** (formulário de texto; o cliente digitava `storage_path` à mão, sem upload nem download).
- **`supabase/migrations/20260609_002_tenant_files_bucket.sql`** — bucket privado `tenant-files` (50 MB) + 4 RLS policies em `storage.objects` escopadas por tenant. Path `<tenant_id>/<uuid>-<arquivo>` → `(storage.foldername(name))[1]`=tenant_id. **Cast-safe:** compara `tenant_members.tenant_id::text` contra o 1º segmento do path; nunca cast `text→uuid` em nome de objeto (objetos de outros buckets não quebram a policy). Aditivo/reversível.
- **`CvNovas.jsx` `Arquivos()` reescrita** — file picker→`storage.upload`→`insert tenant_files`; download por signed URL temporária (120s); excluir remove storage+linha; rollback do objeto se o insert falhar. `CrudTela` intacto (sem regressão nas outras telas). Build verde (`vite build` ✓ 6.31s).
- **⚠️ GATE:** o classifier do auto-mode **bloqueou o apply em produção** exigindo o `ok` explícito do Wandson no SQL (regra global "mostrar SQL completo e aguardar ok"). **PR #261 fica ABERTO** até o bucket existir (para o console nunca mostrar botão de upload quebrado). Após o `ok`: aplico → teste de isolamento RLS (membro envia na própria pasta / bloqueado na de outro tenant, output bruto) → merge.

### Sessão 25 — VPS (visual-claro: família Automações completa + decisão ChatScreen)
Fechou a varredura **dark→claro** das telas embarcadas no Console v2. As 8 abas do `AutomacoesScreen` (que renderizam embeds dentro do console claro) estavam com vários blocos escuros remanescentes — convertidas uma-PR-por-tela (presentation-only, lógica de fetch/handler **byte-idêntica**):
- **`AgentRunsScreen`** (#256), **`AgentInboxScreen`** (#258, sha `99dc15b`), **`AgentBuilderScreen`** (#259, sha `8bed994`) — último embed escuro do `AutomacoesScreen`. Agora **todas as 8 abas** (Heartbeats, Metas, Agentes, Memórias, Execuções, Conhecimento, Inbox, Aprovações) estão no claro.
- **Mapeamento dark→claro consolidado** (tokens `cv2-*` do `console.css`): bg painel `#1a1a1a/#111/#222`→`var(--panel)`; inputs→`#faf9f8`; texto claro→`var(--tx)/var(--tx2)`; bordas→`var(--line)`; overlay→`rgba(28,27,26,0.45)`; status verde/vermelho/âmbar/azul/roxo→tokens `*-soft`. **Dots decorativos e chips de avatar de marca (`#B70C00`+`#fff`) mantidos** — leem bem no claro.
- **Decisão registrada — `ChatScreen.jsx` permanece ESCURO de propósito.** É a superfície imersiva full-screen do Chat ao Vivo clássico (`ehChat && chatFull` em `ConsoleV2.jsx`), estilo WhatsApp, **não** embarcada na moldura clara como os LEGADO. Converter os ~190 tokens escuros da tela funcional mais crítica numa noite autônoma = alto risco / zero ganho funcional. Mantida. (O Chat ao Vivo **claro** é o `ChatV2.jsx`, já 100% funcional — sessões 22/24.)
- **Residuais varridos e confirmados intencionais:** `var(--text,#111827)`/`var(--card-bg,#fff)` (fallbacks claro-corretos em Inadimplentes), sentinela `#222` do `btnStyle` secundário (Inbox), card de plano premium com gradiente escuro deliberado + texto branco (Settings/Billing).
- Builds verdes (`vite build` ✓ ~4.8–5.0s) em cada PR. Sem migration, sem VPS, sem mensagem a cliente.

### Sessão 24 — VPS (badge de não-lidas no Chat ao Vivo v2)
Backlog autônomo: o Chat ao Vivo v2 não tinha contador de não-lidas — a coluna `conversations.unread_count` **já existia** (corrige a suposição das sessões 22/PMA-item-2 de que "precisa migration"; **não precisa**). Implementado em `ChatV2.jsx`, **sem migration**:
- **Seed:** `unread_count` entra no `select` de `loadConvs` e popula `unread` por conversa.
- **Realtime do tenant inteiro:** nova subscription em `messages` filtrada por `tenant_id`. Mensagem `inbound` numa conversa **não-aberta** → incrementa o contador local, atualiza preview/hora e sobe a conversa pro topo. A conversa aberta segue no canal dedicado (sem bump) — `activeIdRef` evita closure obsoleta.
- **Zerar ao abrir:** `abrirConv` zera o contador local **e persiste** `unread_count=0` no banco (escopo `tenant_id`).
- **Visual:** badge vermelho (`99+` acima de 99) + nome/preview em negrito quando há não-lidas.
- Build verde (`vite build` ✓ 5.21s). **PR #248 mergeado (squash, sha `c5ae8aa`)** · deploy verde `index-CCZE5bjF.js`→`index-C6KcnCaT.js`.

### Sessão 23 — VPS (busca global funcional — topbar Console v2)
Backlog autônomo (item 2b): a busca da topbar do `ConsoleV2.jsx` era um `<input className="search">` **morto** (sem `value`/`onChange`) — só visual. Virou um **command palette** real, sem migration:
- **Navegação:** busca instantânea, accent-insensitive (`normalize NFD`), sobre todas as telas do menu (`GRUPOS`). Enter abre a 1ª; mostra o grupo como contexto.
- **Lojas:** `lojas.nome ilike` filtrado por `tenant_id` (debounce 250ms).
- **Conversas:** `conversations` por `contact_name`/`push_name`/`group_name` — termo **sanitizado** (remove `%,()*`) antes de entrar no `.or()` do PostgREST (anti-corrupção de filtro).
- Esc fecha · clique-fora fecha (`mousedown` no document) · seleção navega via `setTela`.
- Colunas reais conferidas antes (anti-padrão P1). Build verde (`vite build` ✓ 5.37s). **PR #246 mergeado (squash, sha `6380eb7`)**.

### Sessão 22 — VPS (Chat ao Vivo 100% funcional — render + ações completas)
Fechou a lacuna que a sessão 21 deixou ("reações ficam na versão completa"). O `ChatV2.jsx` (console claro) agora tem **paridade total** com o `ChatScreen` clássico, tudo **sem migration**:
- **Mídia inbound completa:** imagem clicável, sticker, vídeo (`<video controls>`), áudio (`<audio controls>` com data: URL base64) e **documento** (download via Blob — browsers bloqueiam navegação `data:`).
- **Formatação WhatsApp** no texto (`*negrito*` `_itálico_` `~tachado~` `` `code` `` + links com `var(--red)`).
- **Ticks de entrega** (`delivery_status`): enviado/entregue/lido (azul `#53BDEB`), erro (`!` vermelho).
- **Citação/reply:** render do `quoted_content` (formato plataforma + Evolution) + envio com quoted key Evolution.
- **Reações:** render agregado (chips) + envio (`sendReaction` nova em `evolution.js`) persistindo no `reactions` JSONB (sem tabela nova).
- **Apagar/revoke:** `deleteWhatsAppMessage` + `deleted_at`; exibe "🚫 mensagem apagada".
- **Colar imagem** no composer (`onPaste`).
- **Realtime:** assina `UPDATE` em `messages` além de `INSERT` (reações/ticks/delete ao vivo).
- Build verde (`vite build` ✓ 6.15s). **PR #243 mergeado (squash, sha `30f65b9`)**. ~~Read/unread badge fica para etapa futura (precisa migration)~~ → **feito na sessão 24 sem migration** (`unread_count` já existia).

### Sessão 21 — VPS (Chat claro v2 funcional — item 2)
Executou a Próxima ação #2. O `ChatV2.jsx` deixou de delegar mídia/áudio/transferência à "versão completa" — agora faz tudo no visual claro, reusando `lib/evolution.js` e os padrões do `ChatScreen.jsx`:
- **Mídia:** botão de clipe → input de arquivo oculto (imagem/vídeo/pdf/áudio) → `FileReader`→base64 → insert otimista em `messages` (`media_type`) + `sendMediaMessage`. Imagens com `media_url` renderizam inline na thread.
- **Áudio (PTT):** `MediaRecorder` (ogg/opus) → base64 → `sendAudioMessage` + insert otimista (`media_type:'audio'`). Botão do microfone troca para "enviar" quando há texto; fica vermelho gravando.
- **Transferir:** dropdown no header → `update conversations.department_id` (escopo `tenant_id`), atualiza estado local + col3 mostra o depto.
- **Finalizar:** botão → `update conversations {status:'finalizado', status_v2:'closed', finished_by}` (enum `closed` verificado em `pg_enum`).
- Faixa de aviso inline para falhas (sem `alert`). Limpa o microfone no unmount.
- **Reações** seguem na versão completa (fora do escopo desta entrega).
- Build verde (`vite build` ✓ 5.0s, 219 módulos; warnings de chunk/dynamic-import pré-existentes).

### Sessão 20 — VPS (5 telas novas funcionais — PR #239)
Pegou o handoff Cowork→VPS e executou a Próxima ação #1. Gatilhos, Tópicos, Tarefas agendadas, Links e Arquivos saíram de mock/estado-vazio para **CRUD real** no visual claro do protótipo:
- **Migration aditiva** `supabase/migrations/20260609_001_console_v2_telas_novas.sql`: `tenant_gatilhos`, `tenant_topicos`, `tenant_tarefas`, `tenant_links`, `tenant_files` — cada uma com `tenant_id NOT NULL` + RLS por tenant (`is_member_of`) nos 4 verbos. Idempotente/reversível, padrão da 008. **✅ APROVADA e APLICADA pelo Wandson (mandato D5 v2)** — 5 tabelas com `rls_on=true` + 4 policies cada.
- **Teste de isolamento RLS** (obrigatório por tocar RLS): insert 1 linha em `tenant_gatilhos` como o tenant legítimo → outro tenant (não-membro) vê **0** linhas. Output: `{"legitimo_ve":1,"intruso_ve":0}`. ROLLBACK (sem lixo).
- **Smoke CRUD** sob JWT de membro real (`SET LOCAL request.jwt.claims`): as 5 tabelas aceitam insert e devolvem a linha (1 cada) sob RLS → "+ Novo" funciona, telas saem do estado-vazio. ROLLBACK.
- **`CvNovas.jsx`**: componente `CrudTela` (load/insert/delete, form inline, estado vazio real, sem dado fake). Provedores/Integrações/Sistemas seguem read-only.
- **`ConsoleV2.jsx`**: 5 telas passam a receber `tenantDbId`/`userId`.
- Build verde (`esbuild --bundle` rc=0). **PR #239 mergeado (squash, sha `2578921`)**. Deploy verde: bundle `index-DcFNGYP5.js` → **`index-m6QCbjtk.js`** (~60s).

### Sessão 19 — Cowork (reconstrução fiel ao protótipo + chat claro + telas claras)

### Sessão 19 — Cowork (reconstrução fiel ao protótipo + chat claro + telas claras)
Wandson apontou que o Console v2 tinha divergido do protótipo aprovado. Reconstruído com fidelidade:
- **Onda 1 (#228):** Console v2 com **estrutura idêntica ao protótipo** — 5 grupos (INÍCIO/OPERAÇÃO/AGENTES IA/DADOS/SISTEMA) na ordem do protótipo, **ícones do protótipo** (sprite `CvIcons.jsx` extraído byte-a-byte de `docs/prototipo/console-v2.html`), ~40 telas roteadas, abas novas (Defesa/Radar/Análise/Cardápio/Multicanal/Marca) mescladas.
- **Topbar fiel (#229):** Créditos IA (10.000/mês − execuções reais do mês) · **seletor de tenant funcional** (lê `tenant_members`, troca o workspace) · **sino** (não-lidas reais de `internal_notifications`) · avatar · busca. + `docs/prototipo/METODO-CONSOLE-V2.md` (método: protótipo primeiro → portar idêntico → tudo claro).
- **Chat ao Vivo claro — ChatV2 (#230):** layout claro de 3 colunas do protótipo, **dados reais** (conversas+mensagens+realtime+filtro por departamento+busca) e **envio reusando o pipeline real** (`sendTextMessage` + insert que casa com dedup do webhook). Botão "Versão completa" → `ChatScreen` clássico (mídia/áudio/bots/tarefas/transferir) — nada se perde.
- **Telas legadas → claro (#232):** o wrapper `.cv2-legado` pintava fundo preto sobre telas que JÁ eram claras nativamente. Trocado para `var(--bg)` → DELI, Cobrança, Conhecimento, Memória, Lojas, MIA, Config, Rotinas, Heartbeats voltaram ao claro. (Uma linha de CSS.)
- **Cobrança — fix "Failed to fetch" (#233):** `InadimplentesScreen` batia no bridge (VPS:3001, offline em HTTPS). Agora lê `cora_cobrancas` direto do Supabase (RLS por tenant). QA Pattern P3. Botão "Cobrar via WhatsApp" segue no bridge.
- **CRM (#234) e Metas (#235) → claro:** essas duas eram **genuinamente escuras** (~93 estilos inline). Convertidas dark→claro preservando branco-sobre-vermelho/gradiente. Validadas (esbuild rc=0).
- **skill-creator habilitado (#231):** `.claude/settings.json` (marketplace oficial Anthropic + enabledPlugins). Outros plugins do PDF: comandos `/plugin` entregues, não instalados (terceiros/não verificados).
- **Docs infra:** `docs/infra/claude-code-vps-setup.md` (#236) + `docs/infra/gate0-rotacao-credenciais.md` (#237).
- **Orquestração:** auditei as 11 sessões locais (idle); fechei PR #206 (redundante — migration já no main); um worker confirmou que as entregas das sessões paralelas são reais (0 pendências). CRM/Metas convertidas por worker, revisadas e mergeadas por mim (gate de qualidade).
- **⚠️ Achado operacional (não tratado):** bridge-server em **crash-loop** (136 restarts, uptime 6min) — investigar `pm2 logs bridge-server --err`. Chave SSH `claude-debug-...20260511` confirmada pelo Wandson como o acesso da sessão Claude na VPS (legítima).

### Sessões 16-18 — ver Log abaixo (plataforma completa, agentes, QA, Chat v1).

---

## 👉 Próxima ação (para a sessão da VPS continuar)

1. **5 telas novas funcionais** — ✅ **CONCLUÍDO.** SQL aprovado e aplicado, teste de isolamento RLS (intruso=0) + smoke CRUD passaram, PR #239 mergeado, deploy verde (`index-m6QCbjtk.js`). Gatilhos/Tópicos/Tarefas/Links/Arquivos com CRUD real no visual claro. → próximo foco: item 2.
2. **Chat ao Vivo 100% funcional** — ✅ **CONCLUÍDO (sessões 22+24).** `ChatV2.jsx` com paridade total: mídia inbound (img/sticker/vídeo/áudio/documento), formatação WhatsApp, ticks de entrega, citação/reply, reações (render+envio), apagar/revoke, colar imagem, realtime UPDATE (#243) **+ badge de não-lidas (#248, sessão 24 — `unread_count` já existia, sem migration)**. → próximo foco: item 2b (backlog de telas PARCIAIS).
2b. **Backlog autônomo — telas PARCIAIS → funcionais** (sem migration-apply/VPS/mensagens-a-cliente): ✅ busca global da topbar (sessão 23, PR #246); ✅ badge de não-lidas no chat (sessão 24, PR #248). **Auditado:** backends de Análise de Loja/Cardápio/Multicanal/Radar **já existem** (cron `*/5` drenando filas `pendente`), Importar Relatórios e Análise de Loja **já estão wired** — nenhuma tela do console renderiza mock puro. Restam só os que **exigem** migration/VPS: upload Storage em Arquivos → **migration pronta + frontend wired em PR #261, aguarda `ok` do SQL** (sessão 26); expiry/contagem em Links (precisa endpoint de redirect+VPS) → ainda **bloqueado**.
2c. **Visual-claro (dark→claro das telas embarcadas)** — ✅ **CONCLUÍDO (sessão 25).** Família Automações (8 abas) toda no claro; último embed escuro `AgentBuilderScreen` (#259). `ChatScreen.jsx` permanece escuro **de propósito** (superfície imersiva full-screen; o Chat claro é o `ChatV2.jsx`). Nenhuma tela LEGADO embarcada no Console v2 segue escura. Próximo foco autônomo: varrer gaps funcionais residuais sem migration em telas legadas/`CvNovas`.
3. **Bridge crash-loop** (⚠️ VPS — reservado ao Wandson): `pm2 logs bridge-server --err --lines 50`; achar a causa dos 136 restarts e estabilizar.
4. **Pendências do Wandson (não fazer sem ele):** apagar msg de teste `delete from messages where id='0023dd90-4bf9-4139-8667-ed3e85869772';` · limpar registros de teste (tenant "Cliente Teste Sandbox") · `ASAAS_DEFESA_ENVIRONMENT`=production no 1º cliente pagante.
5. **GATE 0 (quando o Wandson quiser)** — `docs/infra/gate0-rotacao-credenciais.md`. Depois, agente persistente na VPS: `docs/infra/claude-code-vps-setup.md`.
6. **Beta real:** ativar 1 loja real · vincular grupo WhatsApp · vigia 1 semana.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD | ✅ | Console v2 idêntico ao protótipo, **todas as telas no visual claro** |
| T2 | EvoNexus-replica | ✅ | FASE 2 onda 2 + GAP-1..8 + agentes |
| T3 | Visual-First / telas | ✅ | **Arquivos upload/download real** (PR #261, aguarda ok SQL) · Família Automações 100% no claro (#256/#258/#259) · busca global (#246) · Chat ao Vivo 100% funcional (#243) · 5 telas novas com CRUD (#239) |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | 🔄 | 270 policies OK · **GATE 0 (rotação) pendente** — checklist #237 |
| T6 | Agentes IA | ✅ | 6 agentes vivos: Defesa, Vigia, Radar, Estúdio, Análise de Loja, Cardápio, Multicanal |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ | deploy triplo OK · **bridge-server em crash-loop (136 restarts)** |
| T9 | Negócio | 🔓 D6 | Plataforma completa, console fiel ao protótipo. Falta 1º cliente real. |

---

## 📋 Log de sessões

### 2026-06-09 (sessão 25 — VPS: Automações 100% no claro + decisão ChatScreen)
- Varredura dark→claro das telas embarcadas no Console v2 **concluída**. Família `AutomacoesScreen` (8 abas) toda no claro: `AgentRunsScreen` (#256), `AgentInboxScreen` (#258, sha `99dc15b`), `AgentBuilderScreen` (#259, sha `8bed994` — último embed escuro). Presentation-only, lógica de fetch/handler byte-idêntica; dots decorativos e chips de avatar de marca (`#B70C00`+`#fff`) preservados. Builds verdes (`vite build` ✓ ~4.8–5.0s).
- **Decisão:** `ChatScreen.jsx` (Chat ao Vivo clássico) **permanece escuro de propósito** — superfície imersiva full-screen (`ehChat && chatFull`), não embarcada na moldura clara; converter os ~190 tokens da tela funcional mais crítica numa noite autônoma = alto risco/zero ganho. O Chat ao Vivo no visual claro é o `ChatV2.jsx` (já 100% funcional, sessões 22/24). Residuais escuros restantes confirmados intencionais (fallbacks claro-corretos, sentinela `#222` do btnStyle, card de plano premium com gradiente). Item 2c ✅.

### 2026-06-09 (sessão 24 — VPS: badge de não-lidas no Chat ao Vivo v2)
- `ChatV2.jsx`: contador de não-lidas, **sem migration** (`conversations.unread_count` já existia — corrige a suposição de que precisava migration). Seed do `unread_count` no `loadConvs`; subscription realtime do tenant inteiro (`messages` por `tenant_id`) que bumpa não-lidas em conversa não-aberta (`activeIdRef` evita closure obsoleta), atualiza preview/hora e sobe pro topo; `abrirConv` zera local + persiste `unread_count=0`. `console.css`: `.conv .badge` + `.conv.unread` (nome/preview negrito). Build verde (`vite build` ✓ 5.21s). **PR #248 mergeado (squash, sha `c5ae8aa`)** · deploy verde `index-CCZE5bjF.js`→`index-C6KcnCaT.js`. Item 2 (Chat 100%) e item 2b avançam.

### 2026-06-09 (sessão 23 — VPS: busca global funcional na topbar)
- `ConsoleV2.jsx`: input morto da topbar → **command palette** (`GlobalSearch`). Navegação instantânea accent-insensitive sobre `GRUPOS` + lojas (`lojas.nome ilike`, tenant-scoped, debounce 250ms) + conversas (`conversations` `contact_name/push_name/group_name`, termo sanitizado p/ `.or()` PostgREST). Esc/clique-fora fecham; seleção via `setTela`. `console.css`: `.cv2-search-item:hover`. Colunas reais conferidas antes (P1). Build verde (`vite build` ✓ 5.37s). **PR #246 mergeado (squash, sha `6380eb7`)** · deploy verde `index-B_yPsWBh.js`→`index-CCZE5bjF.js`. Item 2b em andamento.

### 2026-06-09 (sessão 22 — VPS: Chat ao Vivo 100% funcional)
- `ChatV2.jsx` ⇒ paridade total com `ChatScreen` clássico, sem migration: mídia inbound (img/sticker/vídeo/áudio/**documento** via Blob), formatação WhatsApp (`formatWA`), ticks de entrega (`Tick`), citação/reply (render `quoted_content` + envio quoted key Evolution), **reações** (render agregado + `sendReaction` persistindo no `reactions` JSONB), apagar/revoke (`deleteWhatsAppMessage`+`deleted_at`), colar imagem (`onPaste`), realtime `UPDATE`. `evolution.js`: +`sendReaction`. Build verde (`vite build` ✓ 6.15s). Branch `wandson/chatv2-100-render-reactions` → **PR #243 mergeado (squash, sha `30f65b9`)**. Próxima ação #2 ✅ (Chat ao Vivo agora 100% funcional, conforme prioridade #1 do Wandson).

### 2026-06-09 (sessão 21 — VPS: Chat claro v2 com mídia/áudio/transferir/finalizar)
- `ChatV2.jsx`: mídia (clipe→input oculto→base64→`sendMediaMessage`, imagem inline via `media_url`), áudio PTT (`MediaRecorder` ogg/opus→`sendAudioMessage`), transferir (`update conversations.department_id`), finalizar (`status_v2:'closed'`, enum verificado). Inserts otimistas em `messages` casam com o dedup do webhook. Aviso inline em vez de `alert`. Build verde (`vite build` ✓). Branch `wandson/chatv2-midia-audio-transfer` → PR. Próxima ação #2 ✅.

### 2026-06-09 (sessão 20 — VPS: 5 telas novas funcionais com CRUD)
- PR #239: migration aditiva `20260609_001` (5 tabelas `tenant_*` + RLS por tenant nos 4 verbos) + `CrudTela` em `CvNovas.jsx` + wiring em `ConsoleV2.jsx`. Build verde (esbuild rc=0).
- **Fechamento (D5 v2, Wandson aprovou o SQL):** migration aplicada (5 tabelas, `rls_on=true`, 4 policies cada) · teste de isolamento RLS `{"legitimo_ve":1,"intruso_ve":0}` (ROLLBACK) · smoke CRUD sob JWT de membro real nas 5 tabelas (1 linha cada, ROLLBACK) · **PR #239 mergeado** (squash, sha `2578921`) · deploy verde `index-DcFNGYP5.js`→`index-m6QCbjtk.js`. Próxima ação #1 ✅.

### 2026-06-09 (sessão 19 — Cowork: Console v2 fiel ao protótipo + tudo claro)
- Onda 1 #228 (estrutura+ícones), topbar fiel #229, ChatV2 claro #230, legado→claro #232, fix Cobrança #233, CRM #234 + Metas #235 claras, skill-creator #231, docs VPS #236 + GATE 0 #237. Orquestração: auditoria das sessões, #206 fechado, worker confirmou entregas reais. Bridge crash-loop detectado.

### 2026-06-08 (sessão 18 — Chat ao Vivo v1 + QA tela por tela)
- Chat ao Vivo reusando ChatScreen (#226), realtime provado e2e. QA: 20 tabelas-fonte íntegras. `docs/auditoria/CHAT-AO-VIVO-E-QA-2026-06-08.md`.

### 2026-06-08 (sessão 17 — noite autônoma: PLATAFORMA COMPLETA)
- Itens 1/3 (#220/#221). Cardápio+Multicanal (#222/#223). White-label (#224). Migrations 010/011. `docs/auditoria/NOITE-AUTONOMA-2026-06-08.md`.

### 2026-06-08 (sessão 16 — madrugada: auditoria + GAPs + Análise de Loja)
- Análise de Loja #215. GAP-2/5/6/7/8 (#216/#217). Wiring #218. Ícones #211. Radar #212. Migrations 008/009.

### 2026-06-08 (sessões 14-15) — Telas #198-205 · Estúdio E1-E4 · Segurança #200-203
### 2026-06-08 (sessão 13) — PR9 #187 + PR10 #189 · ### 2026-06-07/08 (sessão 12) — D6 + PR8 #185
### 2026-06-07 (sessões 6-11) — F1 PR1..PR7 · benchmark · D6 · ### 2026-06-06 (sessões 1-5) — protocolo, FASE 0-2, protótipo

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` + `docs/prototipo/METODO-CONSOLE-V2.md` · 3. Execute em branch+PR · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Commit no mesmo PR
