# Avaliação de Atendimento (CSAT) — Plano de Implementação (FINAL)

> **Versão final para desenvolvimento (Claude Code).** Consolida o plano original + incrementos validados em estudo de plataformas de CX (Track.co, SocialHub, cVortex, Hotjar, Viavox, Typeform). As decisões travadas com o Wandson permanecem intactas; os acréscimos são **aditivos e reversíveis**.

## Diff desta versão (o que mudou vs. o rascunho)

| # | Incremento | Origem (referência) | Escopo |
|---|-----------|---------------------|--------|
| 1 | **Fechamento de loop / tratativa de detrator** (interno, sem WhatsApp) | Track.co (closing loop), SocialHub (recuperar detrator) | **MVP** |
| 2 | **CSAT% formal** (notas 4–5 ÷ respondidas) + classificação satisfeito/neutro/insatisfeito | Padrão de mercado (Salesforce/Zendesk) | **MVP** |
| 3 | **UX página pública mobile-first + microcopy + aviso LGPD na coleta** | Typeform (1 pergunta/tela), LGPD | **MVP** |
| 4 | **Resumo de comentários com IA** (Claude API via Bridge) | Hotjar (IA resume respostas) | **MVP** |
| 5 | **QR Code do link público no painel** | Viavox (QR em embalagem/recibo) | **MVP** |
| 6 | NPS periódico (campanha de recomendação) | Track.co / boas práticas CX | **Futuro** (feature separada — spec própria) |

> **Métrica recomendada:** CSAT como métrica do dia a dia (transacional, por atendimento). NPS fica para uma campanha periódica futura (item 6), não se mistura a este fluxo.

---

## Contexto

O **primeiro cliente** da plataforma Consult Delivery pediu uma feature: ao **fim de um atendimento de suporte** feito dentro da plataforma, o cliente final avalia aquele atendimento (a conversa + o atendente que o atendeu). A avaliação é coletada por um **link público sem login**, e esse link é **enviado pelo CRM do próprio cliente** (fora da nossa plataforma) — portanto **não há envio de WhatsApp do nosso lado** (sem Evolution, sem API oficial). A feature é construída de forma **genérica/multi-tenant**, para servir a outros clientes depois.

**Decisões travadas com o Wandson:**
- Avaliado = o atendimento de suporte da plataforma (conversa + atendente), não a loja/pedido do consumidor.
- **Token único por atendimento finalizado**, amarrado à conversa + atendente (evita avaliação duplicada e identifica exatamente o que/quem foi avaliado).
- Escala: **estrelas 1 a 5**. Campos: **nota (obrigatória) + comentário aberto (opcional)**.
- **Painel de resultados nesta entrega** (Console v2): notas, média, distribuição, comentários, desempenho por atendente.
- Envio do link = responsabilidade do CRM do cliente. Nosso escopo: gerar o token, expor o link pro CRM buscar, página pública de avaliação, armazenamento e painel.

**Acréscimo travado nesta versão (item 1):** todo atendimento com **nota ≤ 2** entra automaticamente em **fila de tratativa interna**; o painel destaca esses casos para o gestor recuperar o cliente. Como não enviamos mensagem, o "fechamento de loop" é operacional/interno (registro de tratativa), não automático ao cliente final.

**Resultado esperado:** todo atendimento finalizado gera um link único; o CRM do cliente o busca e envia ao cliente final; a resposta (1-5 + comentário) é armazenada e visível no painel, com CSAT%, distribuição, desempenho por atendente e **fila de detratores a tratar**.

---

## Como as duas pesquisas convivem (CSAT × NPS)

São **duas features independentes** — tabelas, triggers e links separados. Não se interferem:

- **CSAT (este doc)** = por **atendimento**. Gera token **toda vez que uma conversa fecha**, **sem cooldown**. O `UNIQUE(conversation_id)` só impede duplicar o *mesmo* atendimento — se o cliente for atendido 5x no mês, há 5 avaliações possíveis.
- **NPS (doc separado `nps-marca`)** = por **contato**. Gera **no máximo 1 a cada 30 dias por cliente** (cooldown no trigger). Mede lealdade à marca, não o atendimento.
- O mesmo fechamento de conversa pode **gerar um CSAT (sempre)** e **disparar a checagem de NPS (só se +30 dias do último)**. Um não bloqueia o outro.
- **Envio é do CRM:** CSAT a cada atendimento; NPS esporádico (o endpoint de link do NPS responde "indisponível" quando em cooldown). Não mandar CSAT **e** NPS na mesma mensagem é decisão do CRM, não do nosso código.

---

## Definições de métrica (aplicar no painel)

- **Classificação por nota:** `satisfeito` = 4–5 · `neutro` = 3 · `insatisfeito/detrator` = 1–2.
- **CSAT%** = `(respostas com nota 4 ou 5) ÷ (total de respondidas) × 100`.
- **Média** = média aritmética das notas respondidas.
- **Taxa de resposta** = `respondidas ÷ (respondidas + pendentes + expiradas) × 100`.
- **Detrator a tratar** = `nota ≤ 2` E `tratativa_status IN ('pendente','em_andamento')`.

---

## Arquitetura (reuso dos 3 moldes existentes)

| Peça | Molde existente a reaproveitar |
|------|-------------------------------|
| Token público + expiração | `supabase/migrations/20260525_002_analises_public_token.sql` (`public_token UUID DEFAULT gen_random_uuid()` + expiração) |
| Gatilho no fechamento | `supabase/migrations/20260527_007_conversation_events_full.sql:58` (trigger `AFTER UPDATE OF status_v2 WHEN NEW.status_v2='closed'`) |
| Endpoint público sem JWT | `bridge-server/routes/publico-aprovacao.js` (rate-limit 60 req/min/IP; service-role via `sbFetch`/`supabaseInsert`) |
| Página pública | `src/screens/publico/AprovacaoPublica.jsx` (token do pathname, fetch no Bridge, sem login) |
| Painel Console v2 | `src/console/Avaliacoes.jsx` (layout) + objeto `GRUPOS` em `src/console/ConsoleV2.jsx` |
| RBAC | `src/components/auth/RequireRole.jsx` |

Nome da tabela: **`atendimento_avaliacoes`** (evita colisão com a `avaliacoes` existente, que é de respostas ao iFood).

---

## 1. Migration SQL (aditivo/reversível)

**Criar:** `supabase/migrations/20260621_001_atendimento_avaliacoes.sql`

**Tabela `atendimento_avaliacoes`:**
- `id uuid PK DEFAULT gen_random_uuid()`
- `tenant_id uuid NOT NULL REFERENCES tenants(id)`
- `conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE`
- `assigned_to uuid` · `agent_id text` · `atendente_nome text` — **snapshot** do atendente no fechamento (sem FK viva, preserva histórico mesmo se o atendente for removido/reatribuído)
- `public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`
- `public_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days')`
- `nota smallint CHECK (nota BETWEEN 1 AND 5)` (null enquanto pendente)
- `comentario text` · `nome_cliente text` (opcional, pré-preenchível)
- `status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','respondida','expirada'))`
- `responded_at timestamptz` · `created_at` · `updated_at`
- **[NOVO — item 1] Tratativa de detrator (fechamento de loop interno):**
  - `tratativa_status text NOT NULL DEFAULT 'na' CHECK (tratativa_status IN ('na','pendente','em_andamento','resolvido'))`
  - `tratativa_obs text` · `tratativa_by uuid` · `tratativa_at timestamptz`
- `CONSTRAINT atend_aval_conversation_unique UNIQUE (conversation_id)` ← **token único por atendimento**

**Índices:** `public_token`, `(tenant_id,status)`, `(tenant_id,assigned_to)`, `conversation_id`, **[NOVO]** `(tenant_id,tratativa_status)` (para a fila de detratores).

**RLS** (padrão idêntico ao de `avaliacoes`): `ENABLE ROW LEVEL SECURITY` + policies SELECT/INSERT/UPDATE restritas a `tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())`.
- **A página pública NÃO usa anon key** — o endpoint público no Bridge usa **service-role** (bypassa RLS). As policies só servem ao painel autenticado. **Nenhuma policy permissiva para `anon`.**
- A policy de UPDATE já cobre a edição dos campos `tratativa_*` pelo painel (é row-level, não por coluna). Confirmar que a policy de UPDATE existente não restringe colunas.

**Trigger irmão** (não altera o trigger existente de `conversation_events`):
```
trg_fn_conv_gen_avaliacao_token()  -- resolve nome do atendente + INSERT ... ON CONFLICT (conversation_id) DO NOTHING
trg_conv_gen_avaliacao_token  AFTER UPDATE OF status_v2 ON conversations
  FOR EACH ROW WHEN (NEW.status_v2='closed' AND OLD.status_v2 IS DISTINCT FROM 'closed')
```
> Antes de aplicar: confirmar via Supabase MCP o nome real das colunas em `profiles` (`full_name` vs `name`) e a existência de `conversations.agent_id`/`contact_name`; ajustar o SELECT/INSERT.

**Por que trigger no banco (e não no JS):** todo caminho de fechamento grava `status_v2='closed'` no banco (`src/lib/conversationStatus.js:75`), então o trigger captura 100% dos fechamentos; o `UNIQUE` + `ON CONFLICT` garante idempotência em reabrir/fechar.

> **[NOVO] Marcação automática de detrator:** NÃO usar trigger para isso (a nota chega depois, via endpoint público). A transição `tratativa_status = 'na' → 'pendente'` quando `nota ≤ 2` é feita **no handler POST** (seção 2), no mesmo update que grava a resposta. Mantém a lógica num só lugar e evita trigger extra sobre a própria tabela.

## 2. Endpoints no Bridge

**Criar:** `bridge-server/routes/publico-avaliacao.js` (molde direto de `publico-aprovacao.js`, incluindo o bloco de rate-limit in-memory). Registrar em `bridge-server/index.js` (~linha 1386) **sem `requireJwt`**.

- **GET `/api/publico/avaliacao/:token`** — carrega dados mínimos pra página: `atendente_nome`, `status`, `nota`, `nome_cliente`. Valida expiração (se vencido → marca `status='expirada'`, responde 410/404). Se `respondida` → retorna `{ ja_respondida:true, nota }`. **Sem PII**: nunca retornar telefone, `conversation_id`, `tenant_id`, UUID do atendente **nem nenhum campo `tratativa_*`** (tratativa é interna).
- **POST `/api/publico/avaliacao/:token`** — submete nota+comentário. Zod: `nota` int 1-5 obrigatória, `comentario` string opcional (max ~2000). **Anti-dupla-submissão atômica**: `PATCH ...&public_token=eq.<token>&status=eq.pendente` com `Prefer: return=representation`; se vier vazio → 409 `Avaliação já registrada`. Grava `status='respondida'`, `responded_at`.
  - **[NOVO — item 1]** No mesmo PATCH, setar `tratativa_status='pendente'` **quando `nota <= 2`**, senão manter `'na'`. (Pode ser calculado no payload do PATCH antes do envio.)

**Endpoint autenticado para o CRM** (mesmo arquivo ou irmão, **com `requireJwt` + checagem de tenant**):
- **GET `/api/avaliacao/link?conversation_id=<uuid>`** → `{ public_token, url: '<PUBLIC_BASE>/avaliacao/<token>', expires_at, status }`. Base pública via env.
> Decisão p/ confirmar depois (não bloqueia MVP): se o CRM integra **máquina-a-máquina**, trocar JWT de usuário por **API key de serviço** (header `x-api-key` contra tabela `tenant_api_keys`). No MVP, o link também fica copiável no painel.

## 3. Página pública React

**Criar:** `src/screens/publico/AvaliacaoPublica.jsx` (molde `AprovacaoPublica.jsx`; mesmo `styles` inline, header `#B70C00`).
- Token do pathname: `window.location.pathname.replace(/^\/avaliacao\//,'').split('/')[0]`.
- `useEffect` → GET no mount. Estados: **loading**, **erro/expirado**, **já-respondido** (estrelas read-only), **formulário** (5 estrelas clicáveis + `<textarea>` opcional; enviar desabilitado sem nota), **sucesso**. 409 no POST → cai em já-respondido.
- **Registrar a rota em `src/main.jsx`** (despacho por pathname, não App.jsx): `_path.startsWith('/avaliacao/') → <AvaliacaoPublica/>`. O redirect `?p=` do GitHub Pages já é genérico.

**[NOVO — item 3] Diretrizes de UX (mobile-first, estilo Typeform):**
- **Uma coisa por tela:** título curto ("Como foi seu atendimento?" + nome do atendente quando houver) → estrelas → comentário opcional → enviar. Nada de rolagem desnecessária.
- **Estrelas com alvo de toque ≥ 44px**, feedback visual imediato ao tocar; estado hover/selected claro.
- **Microcopy PT-BR amigável.** Placeholder do comentário: "Conte rapidinho o que motivou sua nota (opcional)".
- **Tela de sucesso branded:** agradecimento + (opcional) logo do tenant. Sem reabrir formulário.
- **[NOVO] Aviso de privacidade (LGPD)** discreto sob o botão: ex. "Seus dados são usados apenas para avaliar este atendimento." O **opt-in de contato é responsabilidade do CRM do cliente** (quem dispara o link); do nosso lado só exibimos o aviso na coleta.
- Respeitar identidade Consult Delivery apenas no chrome neutro; **a marca exibida ao cliente final é a do tenant** (doceria etc.), não a nossa.

## 4. Painel Console v2

**Criar:** `src/console/AtendimentoAvaliacoes.jsx` (molde `Avaliacoes.jsx`; hook `Promise.all` estilo `useDashboardData.js`).
- Dados via `supabase.from('atendimento_avaliacoes').eq('tenant_id', tenantDbId)` (RLS isola por tenant). Lista de respondidas (limit 200) + agregados calculados no cliente.
- **[NOVO — item 2] KPIs headline:** **CSAT%** (notas 4–5 ÷ respondidas), **média**, **total respondidas**, **taxa de resposta**. Reusar `<Kpi>` do ConsoleV2.
- **Distribuição 1–5** (barras) + **% pendente/respondida/expirada**.
- **Desempenho por atendente** (group by `atendente_nome`): por atendente exibir **média, CSAT% e nº de respostas**.
- Lista de **comentários** (com nota e atendente).
- **[NOVO — item 1] Bloco "Detratores a tratar":** filtra `nota ≤ 2` com `tratativa_status IN ('pendente','em_andamento')`. Para cada item: ver comentário + botões para mudar `tratativa_status` (`em_andamento` / `resolvido`) e campo `tratativa_obs`. O update grava `tratativa_by = user atual` e `tratativa_at = now()` via cliente autenticado (RLS). Badge de contagem de pendentes no topo do bloco.
- Para cada atendimento: **link público copiável** `{VITE_PUBLIC_URL}/avaliacao/{public_token}` + botão "Copiar" (via pro operador colar no CRM manualmente).
- **[NOVO — item 5] QR Code do link:** ao lado do "Copiar", botão "QR" que renderiza o `public_token` como QR Code (lib `qrcode` ou `qrcode.react`) num modal, com opção de baixar PNG. Mesmo token público, **zero mudança de backend** — serve pro tenant imprimir em embalagem/recibo/balcão (inspiração Viavox).
- **Registrar em `src/console/ConsoleV2.jsx`:** import + item em `GRUPOS` (grupo "Operação", ex. `{ id:'csat', ic:'i-chart', label:'CSAT — Atendimento' }`) + `case 'csat'` no `switch render()`.
- **RBAC (TRAVADO):** envolver em `<RequireRole roles={['admin','gestor']}>`. Acesso ao painel restrito a `admin` e `gestor` do tenant.

---

## 5. Resumo de comentários com IA (Bridge + painel) — [NOVO, item 4]

**Objetivo:** transformar a lista crua de comentários num resumo acionável pro gestor (inspiração Hotjar AI).

**Criar:** endpoint autenticado `bridge-server/routes/avaliacao-resumo.js` (**com `requireJwt` + checagem de tenant**), registrado em `index.js`.
- **POST `/api/avaliacao/resumo`** body `{ periodo_dias?: number = 30 }`.
- Busca via service-role os comentários `respondida` do tenant no período (nota + comentário + atendente_nome). Limitar a ~300 comentários por chamada (truncar com aviso).
- Chama a Claude API. **Modelo:** `claude-haiku-4-5-20251001` (custo/latência baixos; suficiente pra sumarização). Subir pra `claude-sonnet-4-6` só se quiser análise temática mais fina.
- **Prompt (system):** "Você analisa avaliações de atendimento (CSAT 1–5) de uma doceria/PME. Responda SOMENTE em JSON válido, sem markdown." **User:** lista de `{nota, comentario}` + pedir: `{ resumo: string, temas_positivos: string[], temas_negativos: string[], acao_sugerida: string }`.
- Parsear o JSON com try/catch (stripar cercas ``` se vierem). Em erro de parse, retornar 200 com `{ erro_parse:true, raw }` pro painel exibir fallback.
- **Cache simples:** gravar o último resumo + timestamp (coluna JSON em tabela de config do tenant **ou** key-value já existente) pra não chamar a API a cada abertura do painel. Botão "Atualizar resumo" força recalcular.

**Painel (`AtendimentoAvaliacoes.jsx`):** card "Resumo IA" no topo — exibe `resumo`, chips de temas +/–, e a `acao_sugerida`. Botão "Atualizar" dispara o POST. **RBAC:** mesma proteção do painel (`admin`/`gestor`).

**Privacidade:** enviar à API **apenas nota + comentário** (sem nome do cliente, telefone, IDs). O comentário é texto livre do consumidor — não anexar PII estruturada.

---

## Futuro (fora deste build — feature separada)

- **Item 6 — NPS periódico:** campanha de recomendação (0–10) **desacoplada do atendimento**, em baixa frequência, para medir lealdade à marca do tenant. **Não** entra na tabela `atendimento_avaliacoes` nem neste fluxo — exige tabela própria, regra de cadência/anti-spam e disparo próprio. Será especificado em documento separado.

---

## Ordem de implementação
1. Migration (tabela + índices + RLS + trigger + campos `tratativa_*`) — verificar schema vivo antes de aplicar.
2. Endpoints públicos no Bridge (GET + POST, com marcação de detrator no POST) + registro.
3. Endpoint autenticado do CRM (link lookup).
4. Página pública + rota em `main.jsx` (com UX mobile-first + aviso LGPD).
5. Painel CV2 + registro em `ConsoleV2.jsx` (KPIs CSAT%, distribuição, desempenho por atendente, bloco de detratores, link copiável + QR). Independente, pode ir em paralelo ao 4.
6. Endpoint de resumo IA (`/api/avaliacao/resumo`) + card "Resumo IA" no painel.
7. Polimento: copiar-link, QR, RBAC, labels, microcopy.

## Verificação end-to-end (output bruto obrigatório)
- **SQL:** `UPDATE conversations SET status_v2='closed' WHERE id='<conv>'` → conferir 1 linha em `atendimento_avaliacoes` (token, `status='pendente'`, `tratativa_status='na'`, snapshot do atendente). Reabrir+re-fechar → continua **1 linha** (UNIQUE).
- **Bridge (curl, sem JWT):** GET `/api/publico/avaliacao/<token>` → 200 sem PII e **sem campos tratativa**; POST nota 5 → 200 (`tratativa_status` permanece `na`); POST repetido → **409**; `nota:6` → 400; token inexistente → 404. **POST nota 2 num token novo → 200 e `tratativa_status='pendente'`.**
- **CRM (com JWT):** GET `/api/avaliacao/link?conversation_id=<conv>` → `{url,token,expires_at}`; sem JWT → 401.
- **Browser:** abrir `/avaliacao/<token>` → estrelas → enviar → sucesso; recarregar → "já avaliado"; token inválido → erro. Tela mobile: estrelas com toque confortável, aviso LGPD visível.
- **Console v2 → Operação → "CSAT — Atendimento":** ver a avaliação, **CSAT%**, média, distribuição, **desempenho por atendente (média + CSAT% + nº)**, **bloco de detratores** (avaliação nota 2 aparece, marcar `resolvido` grava `tratativa_by/at`), link copiável **e botão QR (gera/baixa PNG)**; trocar de tenant não vaza dados.
- **[NOVO] Resumo IA:** "Atualizar resumo" → POST `/api/avaliacao/resumo` retorna JSON com `resumo/temas/acao_sugerida`; card renderiza; sem JWT → 401; payload enviado à API **não contém PII** (só nota+comentário).

## Arquivos
**Criar:** `supabase/migrations/20260621_001_atendimento_avaliacoes.sql` · `bridge-server/routes/publico-avaliacao.js` · `bridge-server/routes/avaliacao-resumo.js` · `src/screens/publico/AvaliacaoPublica.jsx` · `src/console/AtendimentoAvaliacoes.jsx`
**Editar:** `bridge-server/index.js` (registrar rotas públicas + resumo) · `src/main.jsx` (rota pública) · `src/console/ConsoleV2.jsx` (import + GRUPOS + case)
**Dependência nova (front):** `qrcode.react` (ou `qrcode`) para o botão QR.

**Branch:** `wandson/csat-avaliacao-atendimento` (nunca direto em main). Migration aditiva/reversível = autônoma. Não há mensagem a cliente do nosso lado (envio é do CRM).

---

## Decisões travadas (resolvidas)
1. **Limiar de detrator:** `nota ≤ 2` marca tratativa.
2. **RBAC do painel:** restrito a `admin` e `gestor` do tenant.
3. **Tratativa de detrator:** incluída no MVP (fila de detratores a tratar).
4. **QR Code e Resumo IA:** promovidos para o MVP.
5. **NPS:** fora deste build — será especificado em documento próprio.
