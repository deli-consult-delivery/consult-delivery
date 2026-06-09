# GATE 0 — Checklist de rotação de credenciais

> Pré-requisito de segurança antes de colocar um agente sempre-ligado na VPS (`docs/infra/claude-code-vps-setup.md`).
> **Quem executa:** Wandson (VPS + credenciais reservadas a você). **Regra de ouro:** rotacione **uma de cada vez** e verifique o serviço depois de cada — assim, se algo cair, você sabe exatamente qual foi.
> **Nunca** cole o valor de um segredo em commit, chat, issue ou log. Só em: GitHub Secrets · Infisical · `.env` da VPS (fora do git).

Itens (T5 do tracker): **4 PATs GitHub · DASHBOARD_API_TOKEN · token Telegram · key claude-debug · limpar cópias na VPS**. Mais um passo de hygiene nos GitHub Actions Secrets.

---

## 0. Preparação (5 min)
- [ ] Tenha à mão: acesso ao GitHub (Settings), ao Infisical (`172.18.0.3:8080`), ao painel do Trigger.dev, ao BotFather do Telegram, e SSH na VPS.
- [ ] Snapshot do que está rodando: `pm2 list` (ou `systemctl status bridge-server`) e `npx trigger.dev@4.4.6 whoami` — pra comparar depois.

---

## 1. PATs do GitHub (4 tokens)
**Revogar + recriar:**
- [ ] GitHub → **Settings → Developer settings → Personal access tokens** (Fine-grained **e** Tokens classic). Liste os 4 ativos. Para cada: anote pra que serve, depois **Revoke**.
- [ ] Recrie só os que ainda são necessários, como **fine-grained, escopo mínimo** (só o repo `consult-delivery`, permissões Contents + Pull requests). Evite PAT clássico amplo.
**Atualizar onde são usados:**
- [ ] VPS: qualquer `git remote` que use `https://<token>@github.com/...` → reconfigure com o novo (ou troque por deploy key SSH). Cheque: `git -C ~/consult-delivery remote -v` e `~/.git-credentials`.
- [ ] Scripts: `scripts/install-agents.sh` / `.ps1` usam `GITHUB_TOKEN` por env — garanta que leem do ambiente, não de valor fixo.
- [ ] GitHub Actions: o `GITHUB_TOKEN` do workflow é **automático** (não é PAT) — **não precisa rotacionar**.
**Verificar:**
- [ ] `git -C ~/consult-delivery fetch` na VPS funciona com o novo token.

## 2. Token do Telegram (@DeliConsultBot)
- [ ] Telegram → **@BotFather → /revoke** (gera token novo e invalida o antigo).
- [ ] Atualizar no **Infisical** (a chave usada pelo bridge/Trigger.dev — ex.: `TELEGRAM_BOT_TOKEN`).
- [ ] Reiniciar quem consome: `pm2 restart bridge-server` (e redeploy do Trigger.dev se o token for lido em build: `npx trigger.dev@4.4.6 deploy`).
- [ ] Verificar: mande `/start` pro bot e confirme que responde.

## 3. DASHBOARD_API_TOKEN
- [ ] Gerar valor novo (token aleatório forte): `openssl rand -hex 32`.
- [ ] Atualizar no **Infisical** e em qualquer `.env` da VPS que o use.
- [ ] Reiniciar o bridge: `pm2 restart bridge-server`.
- [ ] Verificar: a chamada protegida por esse token responde 200 (e 401 com o token velho).

## 4. Remover a SSH key `claude-debug`
- [ ] Na VPS: edite `~/.ssh/authorized_keys` (root **e** qualquer usuário) e **apague a linha** com o comentário `claude-debug`. Confira: `grep -n claude-debug ~/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null`.
- [ ] Verificar: tente conectar com aquela key antiga → deve ser **recusado**; sua key principal continua funcionando.

## 5. Limpar cópias de segredos na VPS
- [ ] Procure plaintext esquecido: `grep -rIl --exclude-dir=node_modules -E "sk-ant-|TELEGRAM|TRIGGER_SECRET|API_KEY" /root /home 2>/dev/null` (revise antes de apagar).
- [ ] Remova `.env`/dumps/backups soltos que não deviam existir; mantenha os segredos **só no Infisical**.
- [ ] `history -c` em sessões onde colou segredo; limpe `~/.bash_history` se tiver token em texto.

## 6. Hygiene dos GitHub Actions Secrets (recomendado)
Se houver suspeita de exposição, rotacione no GitHub → **Settings → Secrets → Actions**: `VITE_BRIDGE_SECRET`, `VITE_EVOLUTION_KEY`, `TRIGGER_ACCESS_TOKEN`. (Os `VITE_SUPABASE_*` são chaves públicas/anon — não urgentes; mas o `ANON_KEY` pode ser regenerado no Supabase se quiser.)
- [ ] Após trocar qualquer secret do Actions, rode um deploy de teste (push numa branch de teste ou re-run do workflow) e confirme verde.

## 7. Não esquecer — propagação
Toda credencial vive em **mais de um lugar**. Depois de cada rotação, percorra:
- [ ] **Infisical** (fonte da verdade dos segredos da VPS)
- [ ] **VPS** `.env` / env do `claudedev` / pm2 ecosystem
- [ ] **GitHub Actions Secrets**
- [ ] **Trigger.dev** (env vars do projeto `proj_slexhoelcjwgbopmbzzr`)
- [ ] Reiniciar serviços afetados (`pm2 restart bridge-server`) e/ou `npx trigger.dev@4.4.6 deploy`.

---

## Verificação final (tudo verde antes de ligar o agente na VPS)
- [ ] Bridge responde: `curl -s localhost:3001/health` (ou rota equivalente).
- [ ] Frontend deploya: workflow GitHub Actions verde após um push de teste.
- [ ] Trigger.dev: um run hello-world conclui ok.
- [ ] Token/key antigos **confirmadamente revogados** (testou e falharam).
- [ ] Atualizar o tracker (`WikiBrain/wiki/PLANO-MESTRE — Tracker.md` / T5) marcando GATE 0 ✅.

> Feito isso, é seguro seguir o `docs/infra/claude-code-vps-setup.md` e subir o Claude Code persistente na VPS.
