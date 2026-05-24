# Tech Debt — Piloto Onda 06 (1-clique Concluir + Fix NovaLojaModal)

Identificados durante implementação TD#31 + bug "Carregando..." (mai/2026).  
Branch: `feature/piloto-06-marcar-concluida` → merged `main` 2026-05-23

---

## TD#31 — UX state machine 3 etapas para concluir tarefa ✅ FIXADO

Ver `docs/tech-debt/onda-04.md` (entrada duplicada aqui por referência cruzada).  
**Status:** ✅ Fechado — Onda 06 mergeada em main, commit `c08f121`.

---

## TD#33 — Frontend não valida payload Bridge antes de usar

**Arquivo:** `src/screens/lojas/NovaLojaModal.jsx` (linha 53)  
**Severidade:** Média  
**Sintoma:** Bug "Carregando..." infinito ao criar nova loja. Loja era criada no DB com sucesso,
mas o modal passava `{ loja: {...} }` (wrapper Bridge) direto para `onCreated` em vez de
desempacotar. `LojasListView` chamava `go('workspace', { lojaId: loja.id })` onde `loja.id = undefined`
→ workspace nunca carregava e ficava no spinner infinito. Usuário tentou criar a mesma loja 4x
(Uraka Burger), gerando 4 duplicatas no DB.  
**Fix aplicado:** `NovaLojaModal.jsx:53` — `const created = raw?.loja ?? (Array.isArray(raw) ? raw[0] : raw); onCreated(created);`  
**Fix arquitetural pendente:** Padronizar response do Bridge (sempre devolver objeto raw, sem wrapper)
OU adicionar runtime guard em todos os callers de `bridgeFetch`. Hoje cada modal que chama
o Bridge precisa saber individualmente se a resposta vem wrappada ou não — inconsistência de contrato.  
**Workaround de limpeza:** 3 lojas duplicadas deletadas manualmente do DB.  
**Status:** Parcial — `NovaLojaModal` fixado; contrato Bridge/frontend não padronizado.

---

## TD#34 — LojasListView trunca em 1000 rows (Supabase default)

**Arquivo:** `src/screens/lojas/LojasListView.jsx` (função `load()`, ~linha 49)  
**Severidade:** Alta (lojas ficam invisíveis na UI sem nenhum erro visível)  
**Sintoma:** Query `.from('lojas').select(...).eq('tenant_id', ...).order('nome')` não tem `.limit()`.
O PostgREST do Supabase aplica limite default de 1000 rows. Com 1172 lojas no tenant `consult`,
tudo após a posição 1000 na ordenação `ORDER BY nome` fica invisível.
"Uraka Burger" está na posição 1101 alfabeticamente — nunca retornada.  
**Origem das lojas extras:** ~1137 lojas legadas (seed/import de 15/05/2026, `created_by=null`) +
35 com nome lixo (`.`, `..`, `Gi`, `VJ`, etc.) do mesmo import. Essas lojas inflam o count
mas não são clientes reais da plataforma.  
**Fix sugerido:**
1. Curto prazo: adicionar `.limit(2000)` na query de `load()` até ter paginação real.
2. Médio prazo: implementar paginação (`.range(offset, offset+49)`) + scroll infinito ou paginação por página.
3. Limpeza: deletar lojas lixo (`nome IS NULL OR length(trim(nome)) <= 2`, 35 registros) e lojas de smoke (`nome ILIKE '%Smoke%' OR nome ILIKE '%Wandson%'`).  
**Status:** Aberto

---

## Validação E2E 2026-05-23

Jornada completa Uraka Burger validada via UI real. 12/12 tarefas concluídas com sucesso.  
G5 (WhatsApp pede aprovação) e G6 (fechamento análise + mensagem parabéns) disparando corretamente.  
TD#31 (1-clique Marcar concluída) funcionando em produção.

**Bugs descobertos e fixados durante o teste real:**
- ✅ TD#33 — `NovaLojaModal` passava wrapper Bridge `{ loja: {...} }` direto para `onCreated` → spinner infinito. Fixado commit `9d7750b`.
- ✅ TD#34 — Supabase PostgREST default 1000-row limit cortava lista. Uraka (posição 1101) invisível. Fixado com `.limit(2000)` commit `534697d`.
- ✅ TD#24 — Coluna `is_active` criada; 1171 lojas seed arquivadas via soft delete, Uraka visível. Commit `c206622`.

---

## Resumo de status

| TD    | Descrição                                        | Severidade | Status          |
|-------|--------------------------------------------------|------------|-----------------|
| TD#31 | UX 3 etapas para concluir tarefa                 | Alta       | ✅ Fechado       |
| TD#33 | Frontend não valida payload Bridge (wrapper)     | Média      | Parcial (modal fixado) |
| TD#34 | LojasListView trunca em 1000 rows (Supabase default) | Alta  | ✅ Fechado `534697d` |
| TD#24 | Coluna is_active ausente em lojas                | Baixa      | ✅ Fechado `c206622` |
