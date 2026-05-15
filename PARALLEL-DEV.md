# Parallel Development — Guia de Worktrees

**Criado em:** 2026-05-15
**Propósito:** Rodar múltiplas features em paralelo, cada uma com sua própria conversa Claude Code.

---

## Estrutura atual

```
C:\Users\Consult Delivery\
│
├── consult-delivery\                    ← ESTA PASTA (conversa principal/orquestradora)
│   └── [main branch]
│
└── consult-delivery-trees\
    ├── cora-asaas\                      ← worktree abandonado (V2-1 já mergeada)
    ├── chat-melhorias\                  ← CONVERSA A: Chat Fase 1
    │   └── [feature/chat-melhorias]
    └── lara-trigger\                    ← CONVERSA B: LARA Trigger.dev
        └── [feature/lara-trigger]
```

---

## Como abrir cada conversa

### No VS Code (extensão Claude Code):

**Conversa A — Chat Melhorias:**
1. `File → Open Folder` → seleciona `C:\Users\Consult Delivery\consult-delivery-trees\chat-melhorias`
2. Abre nova janela do VS Code nessa pasta
3. Abre o Claude Code nessa janela
4. Cole o prompt inicial que está em `FEATURE.md` desse worktree

**Conversa B — LARA Trigger:**
1. `File → Open Folder` → seleciona `C:\Users\Consult Delivery\consult-delivery-trees\lara-trigger`
2. Abre nova janela do VS Code nessa pasta
3. Abre o Claude Code nessa janela
4. Cole o prompt inicial que está em `FEATURE.md` desse worktree

**Esta conversa (orquestradora):**
- Fica na pasta `C:\Users\Consult Delivery\consult-delivery`
- Usada para: revisar PRs, planejar próximas features, resolver conflitos, rodar @cd-validator

---

## Regras do parallel dev

### O que cada conversa pode fazer sozinha:
- Editar qualquer arquivo dentro do seu worktree
- Criar migrations e tasks
- Abrir PRs
- Rodar builds e testes

### O que só a conversa principal faz:
- Merge de PRs no GitHub
- Decisões de arquitetura que afetam múltiplas features
- Planejar a próxima feature (novo worktree)
- Atualizar RESTRUCTURE.md e CLAUDE.md

### Regras de não-conflito:
- Cada conversa trabalha no **seu próprio branch** — zero conflito no working directory
- Migrations devem ter números sequenciais únicos — coordenar pela conversa principal antes de criar migrations novas
- Não editar `main` em nenhuma conversa — sempre branch dedicado

---

## Próximo número de migration

**Última migration:** `20260515_026_vera_views.sql`

Quando uma conversa precisar criar migration:
1. Pergunte aqui na conversa principal qual número usar
2. Use o padrão: `20260515_0XX_nome.sql` (incrementar XX)

---

## Adicionar novo worktree (nova feature)

Execute na conversa principal:

```bash
cd "C:\Users\Consult Delivery\consult-delivery"
git checkout main
git pull origin main
git worktree add "../consult-delivery-trees/NOME-FEATURE" -b feature/NOME-FEATURE
```

Depois crie `FEATURE.md` no novo worktree com o contexto da feature.

---

## Remover worktree (feature mergeada)

```bash
cd "C:\Users\Consult Delivery\consult-delivery"
git worktree remove "../consult-delivery-trees/NOME-FEATURE"
git branch -d feature/NOME-FEATURE
```

---

## Status atual das features

| Worktree | Branch | Feature | Status |
|----------|--------|---------|--------|
| `chat-melhorias` | `feature/chat-melhorias` | Chat Fase 1 (áudio, reply, preview) | 🟡 Pronto para iniciar |
| `lara-trigger` | `feature/lara-trigger` | LARA → Trigger.dev | 🟡 Pronto para iniciar |

### PRs pendentes de merge:
- PR #13 — BRENO (feature/v2-breno-whatsapp)
- PR #14 — SOFIA (feature/v2-sofia)
- PR #15 — VERA (feature/v2-vera)
