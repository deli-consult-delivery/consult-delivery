# HANDOFF — Bot Telegram dedicado da Ana (CON-9, 2026-08-01)

## Contexto
Decisão do Wandson (2026-07-31): bot Telegram **novo e separado**, dedicado só à persona Ana (assistente pessoal), sem misturar com o `@DeliConsultBot` (copiloto de gestão da Hermes/DELI, produção, não tocado).

## Investigação de arquitetura (antes de implementar)
Código-fonte do `hermes_cli`/`gateway` inspecionado na VPS via `vps-claudedev`. Achados:
- 1 processo gateway = 1 `HERMES_HOME` = 1 `.env` = 1 `TELEGRAM_BOT_TOKEN` = 1 identidade Telegram. Não existe roteamento multi-bot dentro de um único processo.
- O roteamento DELI→BRENO/CORA/MAX/etc. (`hermes/routing/roster.json`) é delegação assíncrona via kanban dispatcher (processos filhos `hermes -p <profile> chat -q`), não bots Telegram separados.
- Ana já estava deliberadamente fora do `roster.json`/catálogo multi-tenant (escopo pessoal).
- **Decisão:** segunda instância completa e isolada do `hermes-gateway`, com `HERMES_HOME` próprio, token próprio, zero overlap de processo/estado com a produção.

## Infraestrutura final

```
HERMES_HOME: /home/claudedev/.hermes-ana/.hermes
Perfil ativo: ana (via HERMES_HOME/profiles/ana/ — ver nota abaixo)
Supervisor: systemd --user (não pm2 — ver "Armadilhas" abaixo)
Unit: ~/.config/systemd/user/hermes-gateway-ana.service
Comandos: systemctl --user {status,start,stop,restart} hermes-gateway-ana
Linger: habilitado (loginctl enable-linger claudedev) — sobrevive a fim de sessão SSH
Bot Telegram: @ana_wandson_bot (criado pelo Wandson via @BotFather)
```

### Armadilha #1 — convenção `hermes-gateway-<profile>.service`
O framework Hermes Agent (código-fonte em `/root/hermes-agent/hermes_cli/main.py`) tem uma convenção **não documentada em README, só em comentário no código**: o nome da unit systemd `hermes-gateway-<profile>.service` seleciona automaticamente o perfil pelo sufixo do nome, injetando `--profile <nome>` no `sys.argv` antes de qualquer import. A partir daí, `.env`/`config.yaml`/`auth.json`/`SOUL.md` são resolvidos a partir de `HERMES_HOME/profiles/<nome>/`, **não** da raiz de `HERMES_HOME`.

Como a unit criada se chama `hermes-gateway-ana.service`, os arquivos de configuração da Ana **precisam estar em** `/home/claudedev/.hermes-ana/.hermes/profiles/ana/` (não na raiz `/home/claudedev/.hermes-ana/.hermes/`, que é onde o DELI tem os dele — mas o DELI usa a unit `hermes-gateway.service`, sem sufixo, que resolve pro perfil `default` na raiz).

### Armadilha #2 — pm2 conflita com o self-replace do `gateway run --replace`
`gateway run --replace` tem lógica própria de auto-substituição de processo (pensada para systemd `Restart=always`). Sob pm2, isso cria processos órfãos (`PPID 1`, fora do controle do pm2) que continuam respondendo com config/estado antigos mesmo depois de `pm2 restart`. Migrado para **systemd `--user`** (sem precisar de root — `claudedev` não tem permissão para criar units em `/etc/systemd/system/`), que é o mesmo modelo de processo usado pelo `hermes-gateway` de produção (DELI) e não sofre esse conflito.

### Credenciais
- `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALLOWED_USERS`/`TELEGRAM_HOME_CHANNEL`: `profiles/ana/.env`, permissão `600`, nunca em arquivo commitado.
- `OLLAMA_API_KEY`: mesma chave da conta usada pelo DELI (mesmo provider `ollama-cloud`), copiada para `profiles/ana/.env` — reutiliza a mesma conta/billing, não é uma credencial nova.
- `auth.json` (sessão Nous Portal, se aplicável): copiado do DELI para reuso da mesma conta autenticada — sem novo login.
- `config.yaml`: cópia do `config.yaml` do DELI (mesmo `model: {default: kimi-k2.6, provider: ollama-cloud}`), **sem** o bloco `mcp_servers` de negócio (`cd-admin`, `vendaerp`, `ifood`, `asaas`, `evolution`) — Ana não deve ter acesso a essas ferramentas (fora do seu escopo, conforme `SOUL.md`).

## Teste E2E (output bruto no comentário do CON-9)
Mensagem real enviada pelo Wandson no Telegram → resposta real da Ana, multi-turno, coerente com as fronteiras do `SOUL.md` (reconhece que GATE 0/credenciais pessoais ainda não estão ativos, não inventa acesso).

## Incidente durante a investigação
Um comando de diagnóstico (`pkill -9 -f 'hermes_cli.main gateway run'`, sem escopar por PID) matou também o processo de produção do DELI, que o systemd religou automaticamente (~5-10s de downtime não planejado). DELI confirmado saudável depois (mesmo `NRestarts=1`, sem novos erros). Detalhe completo: comentário no CON-9.

## Pendências / follow-ups (fora de escopo do CON-9)
- `claudedev` não está no grupo `docker` na VPS → tool `execute_code` da Ana falha (permission denied no `docker.sock`). Não bloqueia conversas normais; bloqueia qualquer tarefa que precise rodar código. Registrar como TD se a Ana precisar disso.
- `deploy-hermes.sh` (repo) não sincroniza a instância isolada da Ana (ela não está no `hermes/profiles/*/describe.txt` scaneado por esse script, e nem deveria — instância separada, gerenciada manualmente na VPS).
