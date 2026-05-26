# Setup Worktrees — Sprint 2
Data: 2026-05-25 | Status: PRONTO PARA USAR

## Visão geral
3 worktrees independentes — sem colisão de arquivos entre si.
Cada agente em namespace isolado: `src/agents/{lara,sofia}/`, `trigger/{lara,sofia}/`, `src/screens/{Lara,Sofia}/`.

---

## Worktrees

### cd-lara — LARA Conteúdo Editorial
```bash
# Setup
git worktree add ../cd-lara -b feat/s2-g01-lara
cd ../cd-lara

# Alias rápido (adicionar ao ~/.bashrc ou ~/.zshrc)
alias cd-lara="cd $(git rev-parse --show-toplevel)/../cd-lara"
```

**Arquivos desta worktree:**
```
supabase/migrations/YYYYMMDD_001_lara_content.sql
src/agents/lara/
  prompt.md
  gerador.ts
trigger/lara/
  lara-gerar-conteudo.ts
src/screens/Lara/
  LaraScreen.jsx
  CalendarioLara.jsx
  DraftsLara.jsx
  PublicadosLara.jsx
bridge-server/routes/lara.js
```

**Deploy Trigger.dev (rodar na raiz da worktree):**
```bash
npx trigger.dev@4.4.6 deploy
```

---

### cd-sofia — SOFIA Prospecção
```bash
# Setup
git worktree add ../cd-sofia -b feat/s2-g02-sofia
cd ../cd-sofia

alias cd-sofia="cd $(git rev-parse --show-toplevel)/../cd-sofia"
```

**Arquivos desta worktree:**
```
supabase/migrations/YYYYMMDD_002_sofia_leads.sql
src/agents/sofia/
  prompt.md
  prospeccao.ts
trigger/sofia/
  sofia-prospect.ts
src/screens/Sofia/
  SofiaScreen.jsx
  LeadsLista.jsx
  LeadCard.jsx
  SofiaConfig.jsx
bridge-server/routes/sofia.js
```

---

### cd-vps — VPS Hardening (G06)
```bash
# Setup
git worktree add ../cd-vps -b feat/g06-vps-hardening
cd ../cd-vps

alias cd-vps="cd $(git rev-parse --show-toplevel)/../cd-vps"
```

**Arquivos desta worktree:**
```
supabase/migrations/YYYYMMDD_003_tenants_seed.sql
supabase/migrations/YYYYMMDD_004_views_versionadas.sql
docs/deli-memory/sprint-02/goals/G06.md  (referência)
```

**Comandos VPS (executar via SSH):**
```bash
# Ver memory/vps-infra.md para alias SSH
ssh vps-cd
sudo apt-get install -y fail2ban
# ... (ver G06.1)
```

---

## Regras de não-colisão

| Worktree | Namespaces exclusivos | Shared (read-only) |
|----------|----------------------|-------------------|
| cd-lara | `src/agents/lara/`, `trigger/lara/`, `src/screens/Lara/`, `routes/lara.js` | `trigger/_shared/`, `src/agents/shared/runtime.ts` |
| cd-sofia | `src/agents/sofia/`, `trigger/sofia/`, `src/screens/Sofia/`, `routes/sofia.js` | `trigger/_shared/`, `src/agents/shared/runtime.ts` |
| cd-vps | `supabase/migrations/` (datas únicas) | nenhum |

**Regra de data de migration:** cada worktree usa prefixo de data diferente para evitar conflito de nome de arquivo SQL.

---

## Fluxo de merge recomendado

```bash
# Cada worktree faz PR independente para main
cd ../cd-lara
git add .
git commit -m "feat(s2-g01): LARA content pipeline"
git push -u origin feat/s2-g01-lara
gh pr create --base main --title "feat(s2-g01): LARA content pipeline"

cd ../cd-sofia
# idem para sofia

cd ../cd-vps
# idem para vps
```

**Ordem sugerida de merge:**
1. `cd-vps` (infra/migrations sem dependência de agente)
2. `cd-lara` (agente + UI)
3. `cd-sofia` (agente + UI)

---

## Remover worktrees após merge

```bash
git worktree remove ../cd-lara
git worktree remove ../cd-sofia
git worktree remove ../cd-vps
git branch -d feat/s2-g01-lara feat/s2-g02-sofia feat/g06-vps-hardening
```

---

*SETUP-WORKTREES-S2.md | Sprint 2 | 2026-05-25*
