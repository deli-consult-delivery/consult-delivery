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

## Resumo de status

| TD    | Descrição                                        | Severidade | Status          |
|-------|--------------------------------------------------|------------|-----------------|
| TD#31 | UX 3 etapas para concluir tarefa                 | Alta       | ✅ Fechado       |
| TD#33 | Frontend não valida payload Bridge (wrapper)     | Média      | Parcial (modal fixado) |
