# ESTUDO TÉCNICO — Chat ao Vivo: Identidade Console V2 + Funcionalidade 100%

**Consult Delivery** · 2026-06-26
**Escopo:** (1) bug "não consigo finalizar atendimentos" → causa raiz, fix e prova; (2) unificar a identidade visual do Chat ao Vivo com o Console V2; (3) levar a funcionalidade a 100%.

> Método: workflow multi-agente (5 leitores + 3 lentes adversariais) + verificação direta no banco LIVE (`czyanilrverorwenikqw`) com `EXPLAIN` e UPDATE em transação com rollback forçado.

---

## 1. Diagnóstico do bug "não consigo finalizar atendimento"

### 1.1 Há DOIS bugs sobrepostos (não um)

| # | Camada | Severidade | Quem atinge | Status |
|---|--------|-----------|-------------|--------|
| **A** | **Banco — trigger** | **CRÍTICO** | Todo usuário **com** permissão no tenant (inclui o admin/dono) | ✅ **CORRIGIDO E PROVADO EM PROD** (migration `20260626_002`) |
| **B** | **Frontend — silent-fail** | **CRÍTICO** | Mascara A e atinge usuário **sem** permissão de tenant | ⏳ Fix especificado (pendente) |

### 1.2 Bug A — a trigger de avaliação abortava o fechamento (causa primária PROVADA)

Ao finalizar, o front grava `status_v2 = 'closed'`. Isso dispara a trigger `AFTER UPDATE OF status_v2` **`trg_fn_conv_gen_avaliacao_token`**, que faz:

```sql
INSERT INTO atendimento_avaliacoes (...) ON CONFLICT (conversation_id) DO NOTHING;  -- ❌ sem predicado
```

Mas o índice único de `conversation_id` é **parcial**:

```sql
CREATE UNIQUE INDEX atend_aval_conversation_unique_partial
  ON atendimento_avaliacoes (conversation_id) WHERE (conversation_id IS NOT NULL);
```

No PostgreSQL, `ON CONFLICT (col)` **não infere índice parcial** sem repetir o predicado. Sem ele, o planner lança `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification` → a trigger falha → o `UPDATE` de fechamento é **abortado na mesma transação** → a conversa **nunca fecha**.

**Prova LIVE (segura, sem alterar dados):**

- `EXPLAIN INSERT ... ON CONFLICT (conversation_id) DO NOTHING` → erro `42P10`.
- `UPDATE conversations SET status_v2='closed' WHERE status_v2='open'` (em transação com rollback forçado) → `42P10`.
- Após o fix, o mesmo UPDATE → `UPDATE_OK_SEM_ERRO`.

**Por que existem 123 conversas já `finalizado/closed`?** São históricas — fechadas antes de o índice virar parcial / da trigger ganhar esse INSERT (mexidas recentes em CSAT/NPS, PRs #571–573). A partir daí, todo fechamento via `status_v2` quebrou. Bate exatamente com "nem finalizar consigo".

> ⚠️ **Importante:** o agente "banco-rls" do workflow concluiu (erroneamente) que "o banco está correto", porque testou um UPDATE numa conversa que **já estava `closed`** — aí o `WHEN (old.status_v2 IS DISTINCT FROM 'closed')` é falso e a trigger não dispara. A verificação correta força `status_v2='open'`.

#### Correção aplicada — `supabase/migrations/20260626_002_fix_finalizar_avaliacao_token_on_conflict.sql`
1. `ON CONFLICT (conversation_id) WHERE conversation_id IS NOT NULL DO NOTHING` — casa o índice parcial.
2. `EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW` nas duas triggers de token (avaliação **e** NPS) — gerar token de CSAT/NPS é efeito colateral secundário e **nunca mais** pode abortar uma finalização.

Aditiva/reversível (só `CREATE OR REPLACE FUNCTION`); nenhum dado alterado. **Já aplicada e validada em produção.**

### 1.3 Bug B — silent-fail no frontend (mascara tudo e atinge quem está fora do tenant)

`src/lib/conversationStatus.js:101-104` (`changeStatus`):
```js
const { error } = await supabase
  .from('conversations').update(payload).eq('id', conversationId);  // ← SEM .select()
```
No `supabase-js`/PostgREST, um UPDATE que casa **0 linhas** (RLS barrou: usuário fora de `tenant_members`, tenant trocado, JWT expirado) retorna **`error: null`**. E `src/screens/ChatScreen.jsx:4677` faz `if (!error) { ...otimista... }` **sem ramo else, sem toast** → a UI pinta "Finalizado", o banco não muda, e ao recarregar a conversa volta a aparecer aberta.

Esse mesmo defeito também escondia o Bug A: o `42P10` chegava em `error`, mas como não há tratamento de erro visível, você não via nada acontecer.

#### Fix especificado (frontend, aditivo, sem migration)
- **(a)** `conversationStatus.js:101-104` — usar `.select('id')` e tratar `data.length === 0` como erro explícito ("Sem permissão para finalizar — 0 linhas afetadas").
- **(b)** `ChatScreen.jsx:4677` — exibir erro (toast/alert) no caminho de falha; chamar `refreshStatus()` após sucesso (reler o banco em vez de só otimista).
- **(c)** `handleBulkFinalize` (`ChatScreen.jsx:2583-2601`) — remover `catch{}` vazio, `.select('id')`, reportar count real.
- **(d)** Botão **CANAL interno** (`ChatScreen.jsx:4385-4392 / 4663-4671`) — hoje só faz `setConvs` local, nunca persiste, e é visualmente idêntico ao botão real. Decidir contrato: persistir ou diferenciar visualmente.
- **(e)** `ReopenButton`/reopen (`ChatScreen.jsx:4673`) — mesmo `.select()`+checagem.
- **(f)** opcional: desabilitar Finalizar enquanto `!currentUser?.id` (evita `finished_by` nulo).

### 1.4 Como confirmar no banco (output bruto)
```sql
-- após clicar Finalizar numa conversa que a UI mostrou "Finalizado":
SELECT id, status, status_v2, finished_by, finished_at, updated_at
FROM conversations WHERE id = '<uuid-testado>';
-- status='finalizado' AND status_v2='closed' → persistiu de verdade.
```

---

## 2. Estado da arquitetura e decisão-chave

| Peça | Arquivo | Estado | Identidade |
|------|---------|--------|-----------|
| **ChatScreen clássico** | `src/screens/ChatScreen.jsx` (5491 linhas) | **ATIVO** — embutido no cv2 | dark `.lc-*` (242 classes), 0 `.cv2-*`; fundo `#0E0E0E` |
| **ChatV2** | `src/console/ChatV2.jsx` (572 linhas) | **DESCONTINUADO** (`ConsoleV2.jsx:69-72`) | cv2 puro (`.cv2-chat`) |
| **Componentes modulares** | `src/components/chat/*` | **ATIVOS, só no clássico** | tokens `--g-*`/`.badge`, não `.cv2-*` |

**Descoberta-chave:** os componentes de `src/components/chat/*` **não pertencem ao ChatV2** — são importados **somente** pelo `ChatScreen.jsx`. A modularização nova já está acoplada ao clássico (LeadPanel, ChatTasksPanel, DepartmentSelector com prop `dark`, ConversationStatusBadge, ReopenButton, etc.) — é o ativo mais valioso a reaproveitar.

**Paridade:** clássico = 100% (encaminhar, tags, SLA, presença, quick replies, pausar bot, Kanban de tarefas, lead rico, timeline). ChatV2 ≈ 50–60% (núcleo de mensageria pronto e polido; **faltam** CRM/automação/timeline).

### Decisão: RESKIN do clássico × REVIVER o ChatV2

**Recomendação — caminho híbrido faseado:**
1. **Curto prazo (F1): RESKIN do clássico** (dark→light cv2). Está em produção, tem 100% de paridade, e o reskin é trabalho de CSS contido. Reviver o ChatV2 agora reintroduziria os 40–50% que faltam — risco e prazo desnecessários.
2. **Médio/longo prazo (F2): convergência modular** — "chat cv2 limpo" reaproveitando o núcleo do ChatV2 + os `components/chat/*` + o hook `useConversationStatus`, fechando o gap sem recomeçar.

Não recomendado: reviver o ChatV2 puro agora; nem manter `.lc-*` como destino final.

### Riscos de integração já mapeados (`ConsoleV2.jsx:742-863`)
- **CSS global vaza** — `index.css` importado sem escopo; resets `*{}`, `button{}` e dois `:root{}` contaminam o `.cv2`. (mexer em `button{}` afeta chat **e** todo o console).
- **Tema oposto** — `.livechat` dark (`#0E0E0E`) vs cv2 light (`#f5f5f4`).
- **Cabeçalho duplicado** — `.cv2-tb-chat` + `.lc-fullhead` empilhados.
- **`height:100vh`** no ramo de sub-aba (`ChatScreen.jsx:4027`) estoura o container cv2.
- **6 overlays `position:fixed; inset:0; zIndex:9999`** escapam do shell e cobrem a sidebar cv2.
- **`deepLinkConvId={null}` hardcoded** (`ConsoleV2.jsx:861`) → deep-link morto.

---

## 3. Plano de identidade visual cv2

**Fonte de verdade:** `src/console/console.css` (tokens `--bg:#f5f5f4`, `--panel:#fff`, `--red:#B70C00`, `--tx2`, `--line`; classes `.cv2-main`, `.cv2-tb-chat`, `.cv2-btn`, `.cv2-sb`, `.cv2-overlay`).

| Prioridade | Elemento | Ação |
|------------|----------|------|
| **P1** | Container raiz `.livechat` (`#0E0E0E`) | mapear `--lc-*` → paleta cv2 light |
| **P1** | Cabeçalho duplicado | remover `.lc-fullhead`; manter só `.cv2-tb-chat` |
| **P1** | `height:100vh` sub-aba | trocar por `height:100%` |
| **P2** | Sidebar de conversas / bolhas / botões | `--panel`, `--line`, item ativo `--red`, `.cv2-btn` |
| **P3** | Badges (`ConversationStatusBadge`), painel lead (`LeadPanel` `--g-*`), 6 overlays | harmonizar tokens + auditar z-index |

Esforço P1–P2 é cosmético/CSS; o gargalo é o volume de classes `.lc-` (242), não complexidade individual. Vantagem de partida: `DepartmentSelector` já tem prop `dark`; `ConversationStatusBadge` já aceita `status_v2` e `status`.

---

## 4. Roadmap priorizado

- **F0 — Finalizar + silent-fails (P–M).** ✅ Bug A corrigido em prod. ⏳ Bug B (a–f da §1.3). Aceite: finalizar persiste após reload; falha vira erro visível; bulk reporta count real.
- **F1 — Identidade visual cv2 (M–G).** Remover cabeçalho duplicado, `100vh→100%`, mapear `--lc-*`→cv2 light, harmonizar badges/lead, auditar overlays. Aceite: chat com a mesma identidade do resto do cv2; nenhum `#0E0E0E` visível.
- **F2 — Paridade e convergência (G, incremental).** Reativar deep-link (`deepLinkConvId` real); "chat cv2 limpo" (núcleo ChatV2 + `components/chat/*` + hook + `insertEvent`); unificar leitura de `status`/`status_v2`.

---

## 5. Riscos

- **Vazamento de CSS global (ALTO):** escopar o reskin sob seletor próprio dentro do `.cv2`; não tocar resets bare globais; unificar `--red`.
- **Dualidade `status` (PT-BR) × `status_v2` (EN) (MÉDIO):** a finalização grava ambas via `STATUS_V2_MAP`, mas a UI lê de forma inconsistente (badge/lista usam `status_v2`; hook/filtros usam `status`; `refresh` nem lê `status_v2`). Padronizar fonte única no F2.
- **Datacrazy (BAIXO):** **não** afeta finalizar (caminho inverso, inbound-only, gated por config). Não confundir "encerramento Datacrazy" com a finalização da UI.
- **Divergência migration × prod (BAIXO):** `20260527_007` mostra `trg_fn_conv_status_changed` inserindo em `conversation_events`, mas em LIVE a função é NO-OP. Alinhar a migration ao real.

---

### Resumo executivo
- **Bug:** (A) trigger `trg_fn_conv_gen_avaliacao_token` abortava o fechamento com `42P10` (ON CONFLICT em índice parcial) — **corrigido e provado em prod**; (B) silent-fail de frontend (`.update()` sem `.select()` + UI sem erro) — fix especificado.
- **Arquitetura:** reskinnar o clássico agora (100% paridade, em prod); convergir para chat cv2 limpo depois.
- **Ordem:** F0 (finalizar ✅ / frontend ⏳) → F1 (identidade) → F2 (paridade).
