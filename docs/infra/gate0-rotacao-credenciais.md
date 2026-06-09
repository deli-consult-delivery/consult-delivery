# GATE 0 — Checklist de rotação de credenciais

> Pré-requisito de segurança antes de colocar um agente sempre-ligado na VPS (`docs/infra/claude-code-vps-setup.md`).
> **Quem executa:** Wandson (VPS + credenciais reservadas a você). **Regra de ouro:** rotacione **uma de cada vez** e verifique o serviço depois de cada — assim, se algo cair, você sabe exatamente qual foi.
> **Nunca** cole o valor de um segredo em commit, chat, issue ou log. Só em: GitHub Secrets · Infisical · `.env` da VPS (fora do git).

Itens (T5 do tracker): **4 PATs GitHub · DASHBOARD_API_TOKEN · token Telegram · key claude-debug · limpar cópias na VPS**. Mais um passo de hygiene nos GitHub Actions Secrets.

---

## 0. Preparação (5 min)
- [ ] Tenha à mão: acesso ao GitHub (Settings), ao Infisical (`172.18.0.3:8080` — **só painel web, não há CLI na VPS**), ao painel do Trigger.dev, ao BotFather do Telegram, e SSH na VPS.
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

## 2. Token do Telegram (Hermes)
> ⚠️ **Corrigido (inventário 2026-06-09):** o token do Telegram do Hermes **não está no Infisical nem no bridge**. Ele vive em `/root/.hermes/.env` (linha `TELEGRAM_BOT_TOKEN=`, permissão `600`) e quem consome é o serviço **`hermes-gateway` (systemd)** — `pm2 restart bridge-server` é o serviço **errado** pra este passo. O `bridge-server` não lê Telegram nenhum. E `/root/hermes-agent/.env` tem as chaves de Telegram **comentadas** (é template — não editar lá).

- [ ] Telegram → **@BotFather → /revoke** (gera token novo e invalida o antigo).
- [ ] Editar `/root/.hermes/.env` (editor interativo, p/ não vazar no histórico): `nano /root/.hermes/.env` → trocar o valor de `TELEGRAM_BOT_TOKEN=` pelo novo → salvar.
- [ ] Reiniciar o serviço certo: `systemctl restart hermes-gateway` → conferir `systemctl status hermes-gateway --no-pager`.
- [ ] **Aguardar ~10–15s e re-conferir o status antes de testar.** Durante o `restart` os dois processos se sobrepõem por alguns segundos e o systemd registra um `status=1/FAILURE` transitório (o processo velho saindo por SIGTERM) — **isso é normal**, não é o token. Se você mandar `/start` nessa janela de poucos segundos, o bot "não responde" porque ainda está trocando de processo. Confirme `Active: active (running)` **estável** primeiro. *(aprendido na rotação 2026-06-09: o bot "parou" e o motivo era só essa janela — token estava válido e o gateway já reconectado.)*
- [ ] Verificar: mande `/start` (ou qualquer msg) pro bot e confirme que responde.
- [ ] ✅ **@DeliConsultBot = é o mesmo bot do gateway Hermes** (confirmado 2026-06-09: o token no `/root/.hermes/.env` resolve via `getMe` para `@DeliConsultBot`, id `8779855473`). Ou seja, **um único `/revoke` neste bot cobre tudo** — não há bot Telegram separado pro Hermes. (O rótulo "analista-iFood" em circulação é o mesmo bot.)

**Diagnóstico rápido se o bot não responder após a troca** (tudo read-only, sem imprimir o token):
- [ ] Token válido? `set -a; TELEGRAM_BOT_TOKEN="$(grep -m1 '^TELEGRAM_BOT_TOKEN=' /root/.hermes/.env | cut -d= -f2-)"; set +a; curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"` → espera `"ok":true` + o `@username` certo.
- [ ] Webhook setado bloqueando polling? `curl -s ".../getWebhookInfo"` → `url` deve estar **vazio** (modo long-polling).
- [ ] Gateway conectado de fato? `ss -tnp | grep "pid=$(pgrep -f 'hermes_cli.main gateway')"` → deve mostrar `ESTAB ... 149.154.166.110:443` (IP do Telegram). Sem socket = não está pollando.
- [ ] Só 1 processo? `pgrep -af 'hermes_cli.main gateway'` → mais de 1 = conflito de polling (erro 409).

## 3. DASHBOARD_API_TOKEN
> ⚠️ **Corrigido (verificação na VPS 2026-06-09):** este token **não é do bridge nem do Infisical**. Quem o consome é o **dashboard do EvoNexus** — `/opt/evo-nexus/dashboard/backend/app.py` faz `os.environ.get("DASHBOARD_API_TOKEN")` pra autenticar `Authorization: Bearer` nas rotas internas. Roda como **container Docker Swarm** (`evo-nexus_dashboard`, porta 8080), com env configurado **dentro do próprio EvoNexus** (volume `evonexus_config`), não em arquivo do host nem no stack. `pm2 restart bridge-server` é o serviço **errado** — **nenhum código do consult-delivery depende deste token** (o único hit no bridge, `index.js:199`, é só o rótulo `source:'evonexus'` num callback que ele *recebe*). O motivo de estar no GATE 0 é que o valor **velho vazou em plaintext** em `/root/recovery/config/.env` (§5).
>
> 🔎 **Achado de segurança:** `/opt/evo-nexus/.env` está com permissão `666` (world-writable).

**Decisão antes de agir (EvoNexus é POC "não usar em prod" — CLAUDE.md):**

- **🅰 Aposentar (recomendado, mais limpo):** se o dashboard EvoNexus não é mais usado, não rotacione token de serviço que vai morrer — derrube e apague o plaintext:
  - [ ] `docker service rm evo-nexus_dashboard`
  - [ ] `rm -rf /root/recovery` (mesmo alvo do §5) → resolve a exposição de vez, sem token novo pra gerenciar.
- **🅱 Manter e rotacionar de verdade** (só se ainda usa o EvoNexus):
  - [ ] Gerar valor novo: `openssl rand -hex 32`.
  - [ ] Trocar **dentro do próprio EvoNexus** (config UI do dashboard / volume `evonexus_config`) — **não** Infisical, **não** bridge.
  - [ ] Recriar o serviço swarm: `docker service update --force evo-nexus_dashboard`.
  - [ ] Verificar: chamada ao dashboard com Bearer novo → 200; com o velho → 401.

## 4. Remover a SSH key `claude-debug`
> 📍 **Corrigido (verificação na VPS 2026-06-09):** a key `claude-debug` (blob `…GPT+UyL`) aparece **3× em CADA** arquivo (`/root/.ssh/authorized_keys` e `/home/wandson/.ssh/authorized_keys`), não 1×:
> - **Linhas 1 e 3** = entradas `ssh-ed25519 …UyL claude-debug-…` **ativas** → remover.
> - **Linha 2** = a chave `claude-debug` foi **colada (sem quebra de linha) no fim da chave `hostinger-managed-key`** → pro SSH ela caiu **dentro do comentário** da hostinger, logo está **inativa**. Mas a linha 2 contém a chave **boa** `hostinger-managed-key`.
>
> ⚠️ **NÃO use `grep -v claude-debug` nem `sed '/claude-debug/d'`** — isso apagaria a **linha 2 inteira** e você **perderia a `hostinger-managed-key`**. Filtre pelo **blob exato**, não pelo comentário.
>
> ✅ Manter sempre: `wandson-pc`, `wandson@…` (seu login), `claude-code-consult-delivery`, `github-actions*`, `hostinger-managed-key`.

- [ ] Confira o estado: `awk '{print NR": "$1"  =>"$NF}' /root/.ssh/authorized_keys /home/wandson/.ssh/authorized_keys`.
- [ ] **Backup** (é seu acesso SSH): `cp <arquivo> <arquivo>.bak-$(date +%Y%m%d)` para **os dois**.
- [ ] Remover **só** as entradas cujo 2º campo é o blob da claude-debug (a linha 2 sobrevive — o 2º campo dela é o blob da hostinger):
  ```bash
  BLOB='AAAAC3NzaC1lZDI1NTE5AAAAIFbviweYNwgOLwI4J4QQRK8YdPL15w2qY2R9LGPT+UyL'
  awk -v b="$BLOB" '$2 != b' /root/.ssh/authorized_keys.bak-$(date +%Y%m%d) > /root/.ssh/authorized_keys
  awk -v b="$BLOB" '$2 != b' /home/wandson/.ssh/authorized_keys.bak-$(date +%Y%m%d) > /home/wandson/.ssh/authorized_keys
  ```
- [ ] Conferir o resultado: `awk '{print NR": "$1"  =>"$NF}' <arquivo>` — não pode sobrar linha 100% claude-debug; suas keys boas continuam.
- [ ] Verificar **sem risco de lockout**: **mantenha a sessão atual aberta**, abra um 2º terminal e teste login (entra com sua key); a key privada `claude-debug` → **recusada**. Se algo der errado: restaure o `.bak-…`.
- [ ] *(Opcional, baixa prioridade)* limpar o resíduo **inerte** da linha 2 (a claude-debug dentro do comentário da hostinger) no `nano`, apagando só o trecho ` ssh-ed25519 …UyL claude-debug-…`, sem tocar na chave hostinger.

## 5. Limpar cópias de segredos na VPS
> 📍 **Achados (inventário 2026-06-09):**
> - **`~/.git-credentials`** existe com 1 token GitHub em texto (`https://<token>@github.com`). O `git remote origin` já é **SSH** (`git@github.com:...`), então esse arquivo é **resíduo inútil** → **seguro remover**: `rm -f ~/.git-credentials`.
> - **`/root/recovery/`** é o maior foco de plaintext: contém `recovery/config/.env`, `recovery/claude/.credentials.json` e vários `oracle_*.jsonl`/transcripts com segredos em texto. Conferir se ainda precisa dela; se não, `rm -rf /root/recovery` limpa tudo de uma vez.
> - Plaintext também em `/root/.claude.json` e `/root/.bash_history` (esperado p/ ferramentas; limpar history após rotação).

- [ ] Procure plaintext esquecido: `grep -rIl --exclude-dir=node_modules -E "sk-ant-|TELEGRAM|TRIGGER_SECRET|API_KEY" /root /home 2>/dev/null` (revise antes de apagar).
- [ ] `rm -f ~/.git-credentials` (resíduo — remote já é SSH).
- [ ] Revisar e, se não precisar mais, `rm -rf /root/recovery`.
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
