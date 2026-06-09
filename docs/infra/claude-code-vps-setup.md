# Claude Code persistente na VPS — dev sem depender do seu PC

> Objetivo: rodar um **Claude Code CLI** na VPS (`187.127.25.24`) que continua trabalhando mesmo com seu computador desligado, no fluxo git → branch → PR. **Para o Wandson executar** (a VPS e as credenciais são reservadas ao Wandson — mandato D5 v2).
> Vantagem: Linux nativo (o build roda de verdade lá) + persistência. O frontend continua deployando por GitHub Pages; isto só muda **onde o agente roda**.

---

## ⚠️ ANTES de tudo — segurança (não pule)

A VPS guarda **segredos de produção** (Infisical: `ANTHROPIC_API_KEY`, `TRIGGER_SECRET_KEY`, etc.) + SSH keys + o bridge. Deixar um agente rodando lá aumenta o estrago possível se algo vazar. Faça nesta ordem:

1. **GATE 0 — rotacionar credenciais pendentes** (T5 do tracker): 4 PATs GitHub · `DASHBOARD_API_TOKEN` · token Telegram · remover a key `claude-debug`. Sem isso, qualquer credencial antiga exposta segue válida.
2. **Usuário dedicado, não-root:** o agente roda como `claudedev`, nunca como `root`.
3. **Token GitHub fine-grained, escopo só deste repo** (Contents+Pull requests: read/write), não um PAT clássico amplo.
4. **NÃO usar `bypassPermissions` num agente desatendido.** Mantenha a allowlist de `permissions` do `.claude/settings.json`. Bypass + servidor com segredos = combinação perigosa.

---

## Passo a passo (na VPS, como Wandson)

### 1. Usuário dedicado
```bash
sudo adduser --disabled-password --gecos "" claudedev
sudo usermod -aG docker claudedev   # só se precisar de docker; senão pule
sudo su - claudedev
```

### 2. Node + Claude Code
A VPS já tem Node v22. Instale o CLI no usuário:
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 3. Clonar o repo com token escopado
```bash
# use o PAT fine-grained criado no GATE 0 (só este repo)
git clone https://<TOKEN>@github.com/deli-consult-delivery/consult-delivery.git
cd consult-delivery
git config user.name  "claudedev (VPS)"
git config user.email "deli@consultdelivery.com.br"
npm ci            # instala deps nativas Linux — aqui o build roda de verdade
npm run build     # confirma que compila
```

### 4. Auth do Claude Code
Pegue a `ANTHROPIC_API_KEY` do Infisical e exporte no perfil do usuário (NÃO commite):
```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

### 5. Rodar persistente (escolha um)

**A) tmux — simples, interativo, você anexa de qualquer lugar:**
```bash
tmux new -s dev
cd ~/consult-delivery && claude
# trabalhe; depois desanexe: Ctrl-b, depois d   (continua rodando)
# voltar de qualquer SSH:  tmux attach -t dev
```

**B) systemd — para tarefas não-interativas/agendadas** (ex.: QA noturno). Crie `~/.config/systemd/user/claude-qa.service` rodando `claude -p "..."` num horário via timer. (Detalhar quando for usar.)

### 6. Como usar no dia a dia
- Você abre o SSH do celular/notebook, `tmux attach -t dev`, pede a tarefa, desanexa. O agente segue mesmo se você fechar tudo.
- Ele trabalha no padrão do `CLAUDE.md`: **sempre branch + PR, nunca commit em `main`**; SQL aprovado antes de aplicar.
- O `.claude/settings.json` do repo (hooks GSD, skill-creator, permissions) já se aplica por estar no projeto.

---

## Limites e bom senso
- Um agente por worktree/branch evita conflito (igual ao modelo Cowork). Para várias frentes, use `git worktree add` ou clones separados, um `tmux` por frente.
- Reveja os PRs antes de mergear enquanto ganha confiança no setup.
- Custo: agente sempre-ligado consome tokens; comece com sessões sob demanda, não um loop infinito.

> **Resumo:** dá pra ter dev server-side persistente, sim — mas a sequência segura é **GATE 0 → usuário dedicado → token escopado → Claude Code em tmux**. Eu (Cowork) preparo o checklist do GATE 0 e os comandos exatos; a execução na VPS é sua.
