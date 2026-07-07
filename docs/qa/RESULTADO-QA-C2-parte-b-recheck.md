# QA C2 parte B — recheck de robustez (2026-07-07)

Recheck do `docs/qa/RESULTADO-QA-C2-parte-b.md` (67 telas fora da Prioridade
1-2), pedido pela direção de robustez pré-homologação iFood. READ-ONLY
(Supabase MCP `czyanilrverorwenikqw`) + grep estático. Sem escrita/migration.

## (1) Os 7 fixes P1 do #813 continuam em prod — ✅ CONFIRMADO

Verificado em 2 camadas: (a) as colunas corretas existem no schema real
(`information_schema.columns`), as colunas erradas antigas **não** existem;
(b) o código atual (`origin/main`) ainda usa as colunas corrigidas, não foi
revertido por nenhum merge posterior.

| Tela | Coluna corrigida | Schema confirma? | Código atual usa? |
|---|---|---|---|
| `deli` (`vera_anomalias`) | `metrica, explicacao` | ✅ existem (`tipo`/`descricao` não existem) | ✅ `Deli.jsx:290` |
| `catalogo` (`tenant_agents`) | — | ✅ | ✅ **Refatorado**: `PainelAgentes.jsx` não lê mais `enabled`/`modo` — existência da linha = ativo; ao desabilitar, a linha é **deletada** (`.delete()`, linha 167), não só marcada `enabled:false` — mais robusto que o fix original, sem risco de linha órfã `enabled=false` sendo tratada como ativa. |
| Painel Gestor (`client_timeline`) | `payload, ts` (+ `event_type,title,agent_name`) | ✅ | ✅ `GestorDashboard.jsx:95-98` |
| Painel Gestor (`agent_drafts`) | `content` | ✅ | ✅ `GestorDashboard.jsx:99-102` |
| `lara` (`agent_drafts`) | `content` | ✅ | ✅ `Lara.jsx:643,653,664` |
| `chat-legado` (`customers`) | remoção de `document` | ✅ (`document` não existe) | ✅ nenhuma ocorrência de `,document,` no select |
| `cora` (`tenant_agent_config`) | `modo_override` | ✅ | ✅ `Cora.jsx:1015,1058` |

Nenhuma regressão. Os 7 fixes seguem válidos e reforçados (catálogo ficou
ainda mais robusto que o fix original).

## (2) Caça a NOVOS P1 — arquivos alterados desde o #813

Dado o volume (67 telas já auditadas a fundo no parte-b, sem mudança desde
então na maioria), focei a caça de P1 novo nos arquivos que **de fato
mudaram** entre o #813 e agora (`git log` — 11 PRs: #816, #821, #823, #827,
#831, #832, #833, #836, #837, #841, #848), extraindo todo `.select()` com
lista explícita de colunas e cruzando com `information_schema`:

| Arquivo | Tabela | Colunas no `.select()` | Existem? |
|---|---|---|---|
| `AcessoUsuarios.jsx:21` | `tenant_members` | `user_id, role` | ✅ |
| `AcessoUsuarios.jsx:22` | `tenant_agents` | `agent_id, agents(id,name)` | ✅ |
| `Usuarios.jsx:318` | `tenant_modules` | `module_key, enabled` | ✅ |
| `Usuarios.jsx:531` | `tenants` | `tenant_type` | ✅ |
| `CustosIA.jsx:83` | `agents` | `id, name, category` | ✅ |
| `CvNovas.jsx:312` | `tenant_files` | `*` (sem risco de coluna inexistente) | ✅ |

**Nenhum P1 novo encontrado** nos arquivos tocados desde o #813. As
correções recentes de RBAC (#831/#837/#841/#848) foram de **lógica**
(`can()` não resolvia `true`, mensagens de erro cruas de RPC) — não do tipo
"coluna inexistente em `.select()`" que é o escopo deste recheck; já
mergeadas e fora do escopo de novo fix aqui.

## (3) PASSA / FALHA / PRECISA-BROWSER por tela — herdado do parte-b

Sem mudança de classificação: as 36 telas PASSA, 7 fixes P1 (item 1), 8
FALHAS P6/P10 (cap client-side, não corrigidas — mudança de query, fora de
diff mínimo), 2 falhas de isolamento (não corrigidas — merecem PR
dedicado), 14 PRECISA-BROWSER seguem exatamente como documentado em
`docs/qa/RESULTADO-QA-C2-parte-b.md` — nenhuma dessas categorias mudou
nos arquivos verificados nesta rodada. Ver aquele doc pra lista completa
tela-a-tela; não duplicado aqui pra evitar desalinhamento entre 2 fontes.

## Limitação desta rodada (transparência)

Por orçamento de sessão, a "caça a novo P1" desta rodada cobriu os
arquivos **efetivamente alterados** desde o #813 (11 PRs, 6 arquivos com
`.select()` de coluna explícita) — não um re-grep exaustivo das 67 telas
do zero. Screens não tocados desde o parte-b não têm motivo pra ter
regredido (nenhum código mudou); o risco real de P1 novo está
concentrado em código novo, que é o que foi checado aqui.

## Veredito

**Nenhum P1 novo. Os 7 fixes do #813 seguem corretos e intactos em
`origin/main`.** Nenhuma correção de código necessária neste PR (só doc).
