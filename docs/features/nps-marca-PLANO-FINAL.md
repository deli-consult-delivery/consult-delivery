# NPS de Marca — Plano de Implementação (FINAL)

> **Feature separada do CSAT.** Compartilha os mesmos moldes de infraestrutura (token público, endpoint sem JWT, página pública, Console v2), mas tem **tabela, rotas e painel próprios**. Não toca em `atendimento_avaliacoes`. Pensada multi-tenant.

## Contexto

Mede a **lealdade do consumidor final à marca/loja do tenant** (a doceria), não o atendimento. Pergunta clássica: *"O quanto você recomendaria a [Nome da Loja] a um amigo?"* escala **0–10**, mais comentário opcional.

**Decisões travadas com o Wandson:**
- **Objeto avaliado:** marca/loja do tenant (recomendação do consumidor final).
- **Disparo:** por **evento** (mesmo padrão do CSAT — fechamento de conversa), e o **link é enviado pelo CRM do cliente** (sem WhatsApp do nosso lado).
- **Cadência / anti-spam:** **no máximo 1 NPS a cada 30 dias por contato.** A unidade de controle é o **contato (cliente final)**, não a conversa.
- Escala **0–10**, **nota obrigatória + comentário opcional**.
- **Tratativa de detrator interna** (mesma lógica do CSAT): nota ≤ 6 entra em fila de tratativa no painel.
- **Painel próprio** no Console v2: NPS, distribuição, % promotor/neutro/detrator, **tendência no tempo**, comentários, fila de detratores, resumo IA.
- **RBAC:** `admin`/`gestor`.

**Diferença-chave vs. CSAT:** o CSAT gera **1 token por conversa fechada** (`UNIQUE(conversation_id)`). O NPS gera **1 token por contato a cada 30 dias** — logo **não** há unique por conversa nem por contato; o controle é feito por **janela de cooldown** na geração.

---

## Como as duas pesquisas convivem (CSAT × NPS)

São **duas features independentes** — tabelas, triggers e links separados. Não se interferem:

- **CSAT (doc separado `csat-avaliacao-atendimento`)** = por **atendimento**. Gera token **toda vez que uma conversa fecha**, **sem cooldown** (`UNIQUE(conversation_id)` só evita duplicar o mesmo atendimento).
- **NPS (este doc)** = por **contato**. Gera **no máximo 1 a cada 30 dias por cliente** (cooldown no trigger). Mede lealdade à marca, não o atendimento.
- O mesmo fechamento de conversa pode **gerar um CSAT (sempre)** e **disparar a checagem de NPS (só se +30 dias do último)**. Um não bloqueia o outro.
- **Envio é do CRM:** CSAT a cada atendimento; NPS esporádico (o `GET /api/nps/link` responde `204/disponivel:false` quando em cooldown). Não mandar CSAT **e** NPS na mesma mensagem é decisão do CRM, não do nosso código.

---

## Definições de métrica (aplicar no painel)

- **Classificação:** `promotor` = 9–10 · `neutro/passivo` = 7–8 · `detrator` = 0–6.
- **NPS** = `%promotores − %detratores` (varia de −100 a +100).
- **Taxa de resposta** = `respondidas ÷ (respondidas + pendentes + expiradas) × 100`.
- **Detrator a tratar** = `nota ≤ 6` E `tratativa_status IN ('pendente','em_andamento')`.
- **Tendência:** NPS por mês (série temporal) — relevante porque a pesquisa é periódica.

---

## Arquitetura (mesmos moldes do CSAT)

| Peça | Molde a reaproveitar |
|------|----------------------|
| Token público + expiração | `supabase/migrations/20260525_002_analises_public_token.sql` |
| Gatilho no fechamento | `supabase/migrations/20260527_007_conversation_events_full.sql:58` (trigger `AFTER UPDATE OF status_v2='closed'`) |
| Endpoint público sem JWT | `bridge-server/routes/publico-aprovacao.js` (rate-limit; service-role) |
| Página pública | `src/screens/publico/AprovacaoPublica.jsx` |
| Painel Console v2 | `src/console/Avaliacoes.jsx` + `GRUPOS` em `src/console/ConsoleV2.jsx` |
| Resumo IA | `bridge-server/routes/avaliacao-resumo.js` (do CSAT — generalizar pra aceitar a fonte NPS) |
| RBAC | `src/components/auth/RequireRole.jsx` |

Nome da tabela: **`nps_avaliacoes`**.

---

## 1. Migration SQL (aditivo/reversível)

**Criar:** `supabase/migrations/20260621_002_nps_avaliacoes.sql`

**Tabela `nps_avaliacoes`:**
- `id uuid PK DEFAULT gen_random_uuid()`
- `tenant_id uuid NOT NULL REFERENCES tenants(id)`
- `contact_id uuid NOT NULL` — **unidade de cadência** (o cliente final). Sem FK viva se `contacts` puder ser limpa; senão `REFERENCES contacts(id) ON DELETE SET NULL`. **Confirmar schema via Supabase MCP.**
- `contact_nome text` — snapshot do nome no momento da geração.
- `origin_conversation_id uuid` — conversa/evento que disparou a geração (rastreabilidade; **não** usada pra unicidade).
- `public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`
- `public_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days')`
- `nota smallint CHECK (nota BETWEEN 0 AND 10)` (null enquanto pendente)
- `comentario text`
- `status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','respondida','expirada'))`
- `responded_at timestamptz` · `created_at timestamptz DEFAULT now()` · `updated_at timestamptz DEFAULT now()`
- **Tratativa de detrator:** `tratativa_status text NOT NULL DEFAULT 'na' CHECK (tratativa_status IN ('na','pendente','em_andamento','resolvido'))` · `tratativa_obs text` · `tratativa_by uuid` · `tratativa_at timestamptz`
- **Sem** `UNIQUE(contact_id)` nem `UNIQUE(conversation_id)` — cadência é por janela, não por constraint.

**Índices:** `public_token`, `(tenant_id,status)`, `(tenant_id,contact_id,created_at DESC)` ← **crítico pro lookup de cooldown**, `(tenant_id,tratativa_status)`, `(tenant_id,created_at)` (série temporal/tendência).

**RLS:** idêntico ao CSAT — SELECT/INSERT/UPDATE restritos a `tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())`. **Sem policy para `anon`**; a página pública usa **service-role** via Bridge.

**Trigger de geração com cooldown de 30 dias** (irmão, não altera triggers existentes):
```
trg_fn_conv_gen_nps_token():
  -- resolve contact_id + contact_nome a partir da conversa fechada
  -- só insere se NÃO existir NPS do mesmo (tenant_id, contact_id) nos últimos 30 dias:
  IF NOT EXISTS (
    SELECT 1 FROM nps_avaliacoes
     WHERE tenant_id = NEW.tenant_id
       AND contact_id = <contato_da_conversa>
       AND created_at > now() - interval '30 days'
  ) THEN INSERT ... ;
  END IF;

trg_conv_gen_nps_token  AFTER UPDATE OF status_v2 ON conversations
  FOR EACH ROW WHEN (NEW.status_v2='closed' AND OLD.status_v2 IS DISTINCT FROM 'closed')
```
> Verificar via Supabase MCP: existência de `conversations.contact_id` (ou equivalente) e da tabela `contacts`/coluna de nome. Ajustar o SELECT.
> **Por que cooldown no trigger:** garante a regra de 30 dias na origem, independente de quantas conversas o contato feche no período. A marcação de detrator (`nota ≤ 6 → tratativa='pendente'`) é feita **no handler POST**, igual ao CSAT.

## 2. Endpoints no Bridge

**Criar:** `bridge-server/routes/publico-nps.js` (molde de `publico-aprovacao.js`, com rate-limit). Registrar em `index.js` **sem `requireJwt`**.

- **GET `/api/publico/nps/:token`** — retorna o mínimo pra página: **nome público da loja** (pra montar a pergunta — não é PII, é o nome do negócio), `status`, `nota`. Valida expiração (vencido → `status='expirada'`, 410/404). Se respondida → `{ ja_respondida:true, nota }`. **Nunca** retornar `contact_id`, telefone, `conversation_id`, `tenant_id` nem campos `tratativa_*`.
- **POST `/api/publico/nps/:token`** — Zod: `nota` int **0–10** obrigatória, `comentario` opcional (max ~2000). **Anti-dupla-submissão atômica:** `PATCH ...&public_token=eq.<token>&status=eq.pendente` com `Prefer: return=representation`; vazio → 409. Grava `status='respondida'`, `responded_at`. Se `nota ≤ 6` → setar `tratativa_status='pendente'`.

**Endpoint autenticado pro CRM** (`requireJwt` + tenant):
- **GET `/api/nps/link?contact_id=<uuid>`** (ou `?conversation_id=`) → retorna o NPS **ativo/pendente** do contato: `{ public_token, url, expires_at, status }`.
  - **Se estiver em cooldown** (nenhum token pendente recém-gerado) → responder **204 / `{ disponivel:false }`** pro CRM **não** disparar NPS àquele cliente agora. Esse é o ponto que respeita a regra dos 30 dias no envio.

## 3. Página pública React

**Criar:** `src/screens/publico/NpsPublico.jsx` (molde `AprovacaoPublica.jsx`; header `#B70C00`).
- Token do pathname: `window.location.pathname.replace(/^\/nps\//,'').split('/')[0]`.
- Pergunta: **"O quanto você recomendaria a {nome_loja} a um amigo ou familiar?"** com **escala 0–10** (11 botões; em mobile, grade 0–5 / 6–10 com alvo de toque ≥ 44px; rótulos "Nada provável" / "Muito provável" nas pontas).
- Comentário opcional: "O que mais pesou na sua nota? (opcional)". Enviar desabilitado sem nota.
- Estados: loading · erro/expirado · já-respondido (read-only) · formulário · sucesso (agradecimento branded). 409 → já-respondido.
- **Aviso LGPD** discreto na coleta (mesmo texto do CSAT). Marca exibida = a do **tenant**.
- **Registrar rota em `src/main.jsx`:** `_path.startsWith('/nps/') → <NpsPublico/>`.

## 4. Painel Console v2

**Criar:** `src/console/NpsResultados.jsx` (molde `Avaliacoes.jsx`).
- Dados via `supabase.from('nps_avaliacoes').eq('tenant_id', tenantDbId)` (RLS isola).
- **KPIs headline:** **NPS** (%promotores − %detratores), **% promotor / neutro / detrator**, **total respondidas**, **taxa de resposta**.
- **Distribuição 0–10** (barras) + **tendência mensal do NPS** (série temporal — reusar recharts).
- **Bloco "Detratores a tratar":** `nota ≤ 6` com `tratativa_status IN ('pendente','em_andamento')`; marcar `em_andamento`/`resolvido` + `tratativa_obs`, grava `tratativa_by/at`.
- Lista de **comentários** (com nota).
- **Card "Resumo IA"** reusando `/api/avaliacao/resumo` generalizado (parâmetro `fonte: 'nps'`).
- Por item: **link copiável** `{VITE_PUBLIC_URL}/nps/{public_token}` + botão **"Copiar"** + botão **"QR"** (gera/baixa PNG).
- **Registrar em `src/console/ConsoleV2.jsx`:** import + item em `GRUPOS` (grupo "Operação", ex. `{ id:'nps', ic:'i-chart', label:'NPS — Marca' }`) + `case 'nps'`.
- **RBAC:** `<RequireRole roles={['admin','gestor']}>`.

## 5. Generalizar o Resumo IA (reuso do CSAT)

Ajustar `bridge-server/routes/avaliacao-resumo.js` pra aceitar `body.fonte ∈ {'csat','nps'}`:
- `nps` → lê `nps_avaliacoes`, escala 0–10, e o prompt pede temas de **recomendação de marca** (não de atendimento). Mesmo contrato de saída JSON (`resumo/temas_positivos/temas_negativos/acao_sugerida`). Modelo `claude-haiku-4-5-20251001`. **Sem PII no payload** (só nota+comentário).

---

## Ordem de implementação
1. Migration (tabela + índices + RLS + trigger com cooldown de 30 dias) — verificar `conversations.contact_id`/`contacts` antes.
2. Endpoints públicos (GET + POST nps) + registro.
3. Endpoint autenticado do CRM (`/api/nps/link` com resposta de cooldown).
4. Página pública `/nps/:token` + rota em `main.jsx`.
5. Painel `NpsResultados.jsx` + registro em `ConsoleV2.jsx` (NPS, distribuição, tendência, detratores, link+QR).
6. Generalizar `avaliacao-resumo.js` p/ `fonte:'nps'` + card no painel.
7. Polimento: copiar-link, QR, RBAC, labels, microcopy.

## Verificação end-to-end (output bruto obrigatório)
- **SQL — cadência:** fechar conversa do contato A → 1 linha NPS `pendente`. Fechar **outra** conversa do **mesmo** contato A dentro de 30 dias → **nenhuma** linha nova (cooldown). Contato B no mesmo período → gera normalmente. Após 30 dias (simular `created_at` antigo) → gera de novo.
- **Bridge (sem JWT):** GET `/api/publico/nps/<token>` → 200 com nome da loja, sem PII; POST `nota:10` → 200; POST repetido → 409; `nota:11` → 400; `nota:3` → 200 e `tratativa_status='pendente'`; token inexistente → 404.
- **CRM (com JWT):** GET `/api/nps/link?contact_id=<A>` com token pendente → `{url,...}`; mesmo contato em cooldown → **204/`disponivel:false`**; sem JWT → 401.
- **Browser:** `/nps/<token>` → escala 0–10 → enviar → sucesso; recarregar → "já respondido"; inválido → erro.
- **Console v2 → Operação → "NPS — Marca":** NPS calculado correto (ex.: 50%promo − 20%detr = 30), distribuição, **tendência mensal**, fila de detratores funcional, resumo IA, link+QR; troca de tenant não vaza.

## Arquivos
**Criar:** `supabase/migrations/20260621_002_nps_avaliacoes.sql` · `bridge-server/routes/publico-nps.js` · `src/screens/publico/NpsPublico.jsx` · `src/console/NpsResultados.jsx`
**Editar:** `bridge-server/index.js` (rotas nps) · `src/main.jsx` (rota `/nps/`) · `src/console/ConsoleV2.jsx` (import + GRUPOS + case) · `bridge-server/routes/avaliacao-resumo.js` (parâmetro `fonte`)
**Dependência:** `qrcode.react` (já incluída pelo build CSAT).

## Decisões travadas (resolvidas)
1. **Objeto:** NPS de marca/loja (consumidor final).
2. **Disparo:** por evento (fechamento de conversa) + envio pelo CRM.
3. **Cadência:** 1 a cada 30 dias por contato (cooldown no trigger; lookup do CRM responde cooldown).
4. **Escala:** 0–10; promotor 9–10 / neutro 7–8 / detrator 0–6.
5. **Tratativa de detrator (nota ≤ 6):** incluída.
6. **RBAC:** `admin`/`gestor`.

## Pendência a confirmar (não bloqueia o MVP)
- **Fonte do "nome público da loja"** exibido na pergunta: existe um campo tipo `tenants.nome_publico`/`display_name`? Se não, definir de onde puxar (config do tenant). Verificar via Supabase MCP.
- **Branch:** `wandson/nps-marca` (separado do branch do CSAT; nunca direto em main).
