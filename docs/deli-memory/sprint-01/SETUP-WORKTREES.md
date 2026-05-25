# Sprint 1 — Setup Worktrees Paralelos
Data: 2026-05-25 | Branch base: main

---

## Visão geral

5 goals são executados em paralelo usando git worktrees. Cada goal tem seu próprio diretório de trabalho, branch independente e conjunto de arquivos. G02 depende de G01 para começar (runtime.ts deve existir), mas G03/G04/G05 são completamente independentes.

---

## Comandos de setup

Execute estes comandos na raiz do repositório (`~/consult-delivery` ou equivalente):

```bash
# 1. Garantir que main está atualizado
git checkout main && git pull origin main

# 2. Criar worktrees (rodar todos de uma vez)
git worktree add ~/worktrees/cd-deli -b feat/g01-deli-core
git worktree add ~/worktrees/cd-breno -b feat/g02-breno
git worktree add ~/worktrees/cd-contratos -b feat/g03-contratos
git worktree add ~/worktrees/cd-onboarding -b feat/g04-onboarding
git worktree add ~/worktrees/cd-recontratacao -b feat/g05-recontratacao

# 3. Instalar dependências em cada worktree
for dir in cd-deli cd-breno cd-contratos cd-onboarding cd-recontratacao; do
  echo "=== Instalando em $dir ==="
  (cd ~/worktrees/$dir && npm install)
done

# 4. Verificar worktrees criados
git worktree list
```

---

## Tabela: worktree → goal → ordem → arquivos críticos

| Worktree | Goal | Branch | Ordem | Arquivos que NÃO pode tocar |
|---------|------|--------|-------|----------------------------|
| `cd-deli` | G01 DELI Core | `feat/g01-deli-core` | 1 (primeiro) | `trigger/breno/`, `src/screens/` |
| `cd-breno` | G02 BRENO | `feat/g02-breno` | 2 (após G01.1) | `src/agents/shared/runtime.ts` (só leitura) |
| `cd-contratos` | G03 Contratos | `feat/g03-contratos` | paralelo | `trigger/deli/`, `trigger/breno/` |
| `cd-onboarding` | G04 Onboarding | `feat/g04-onboarding` | paralelo | `trigger/deli/`, `trigger/breno/` |
| `cd-recontratacao` | G05 Re-contratação | `feat/g05-recontratacao` | paralelo | `trigger/deli/`, `trigger/breno/` |

---

## Regras de colisão (obrigatórias)

### Arquivos compartilhados — quem pode editar

| Arquivo | Quem pode criar/editar | Todos os outros |
|---------|----------------------|-----------------|
| `src/agents/shared/runtime.ts` | **só G01** | apenas importar |
| `trigger/breno/processar-webhook.ts` | **só G02** | não tocar |
| `trigger.config.ts` | G01 e G02 (coordenar) | não tocar |
| `package.json` | qualquer (verificar conflito no merge) | informar Wandson |
| `supabase/migrations/` | qualquer (prefixo de data único) | ver abaixo |

### Migrations — prefixos obrigatórios

Cada goal usa um número sequencial único para evitar conflito de filename:

| Goal | Prefixo migration | Exemplo |
|------|-----------------|---------|
| G01 | `20260525_001_` | `20260525_001_agent_prompts.sql` |
| G02 | `20260525_002_` | `20260525_002_support_tickets.sql` |
| G03 | `20260525_003_` | `20260525_003_contratos.sql` |
| G04 | `20260525_004_` | `20260525_004_onboarding.sql` |
| G05 | `20260525_005_` | `20260525_005_aceite_recontratacao.sql` |

Se dois goals rodarem no mesmo dia e precisarem de múltiplas migrations, usar `_001_`, `_002_` etc. **dentro do mesmo goal** (ex: `20260525_003_contratos.sql` e `20260525_003b_contratos_templates.sql`).

---

## Fluxo de PR por goal

```bash
# Em cada worktree, após concluir o goal:
git add -p                          # revisar arquivos adicionados
git commit -m "feat(g0X): descrição"
git push origin feat/g0X-nome

# Na raiz do repo:
gh pr create --base main \
  --head feat/g0X-nome \
  --title "feat(g0X): Nome do Goal" \
  --body "Closes G0X. Smoke: [output bruto aqui]"
```

**Merge order:** G01 primeiro → G02 segundo → G03/G04/G05 qualquer ordem.

Antes de merge de G02: verificar que `src/agents/shared/runtime.ts` está em main (merge de G01 completo).

---

## Limpeza após sprint

```bash
# Após todos os PRs mergeados:
git worktree remove ~/worktrees/cd-deli
git worktree remove ~/worktrees/cd-breno
git worktree remove ~/worktrees/cd-contratos
git worktree remove ~/worktrees/cd-onboarding
git worktree remove ~/worktrees/cd-recontratacao
git worktree prune
```

---

## Checklist de início por worktree

Antes de iniciar cada goal, verificar:

- [ ] `git worktree list` mostra o worktree na branch correta
- [ ] `npm install` rodou sem erro
- [ ] `.env` ou `trigger.config.ts` tem as variáveis de ambiente (ANTHROPIC_API_KEY, SUPABASE_URL, BRIDGE_URL)
- [ ] `npx tsc --noEmit` passa na branch base (sem erros herdados)
- [ ] Para G02: confirmar que `src/agents/shared/runtime.ts` já existe em main

---

*SETUP-WORKTREES.md | Sprint 1 | 2026-05-25*
