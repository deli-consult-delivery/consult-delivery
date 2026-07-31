# HANDOFF — Persona Ana + GATE 0 (2026-07-30, contexto cheio, sessão continua)

## O que já está feito (commitado, branch `wandson/ana-persona-pessoal`, nada em main)
- `hermes/profiles/ana/SOUL.md` — persona criada, formato igual DELI, verificada pelo cd-oath (0 regra de negócio)
- `docs/ai-first/ana-regime-permissao.md` — Ana com autonomia de execução (decisão do Wandson), gated por GATE 0
- `docs/ai-first/ana-sistemas-pessoais-acesso.md` — 4 sistemas pessoais mapeados, nenhuma credencial conectada
- `docs/ai-first/nimbalyst-hermes-mcp-spec.md` — spec do `hermes-chat-mcp`, corrigida com endpoint real (assíncrono, auth via token Supabase)
- Ana está **fora** do `roster.json`/catálogo multi-tenant (decisão confirmada)
- 2 commits: `e2ada44`, `12bced5`

## Acesso à VPS configurado nesta sessão
- Chave nova `~/.ssh/id_ed25519_claudedev` (Windows local), autorizada no usuário `claudedev` (187.127.25.24)
- Alias local: `ssh vps-claudedev` (usar sempre este, não `ssh vps` que é root)
- Sudo restrito só a `systemctl {status,start,stop,restart,show} hermes-gateway`
- ACL de leitura concedida em `/root/consult-delivery/hermes/` (só essa subpasta) pro grupo `claudedev`

## 🚨 Pendência de segurança — investigada (CON-3, 2026-07-31), rotação NÃO autorizada
`SUPABASE_SERVICE_KEY` e `INTERNAL_BRIDGE_TOKEN` vazaram em texto puro no chat (output do `~/.hermes/config.yaml` antigo, colado pelo Wandson). Decisão do Wandson (2026-07-31): **NÃO rotacionar agora** — mandato era eliminar exposição em arquivo/sistema, sem trocar a credencial.

**Investigação completa (CON-3):** repo git (HEAD + histórico completo, 2538 commits) está limpo — nenhum `.env` real commitado, `hermes/config.yaml` versionado é config-como-código sem segredos por design. Na VPS, o valor real vive em `/home/claudedev/.hermes/.hermes/config.yaml` + 2 backups + `/root/.hermes/config.yaml` (original órfão), todos `600` em árvore `700` — acesso restrito a `claudedev`/root. Logs (`.hermes/logs/*.log`, PM2 `bridge-server-out.log`) não contêm o valor, só health-check `✓`. Único achado corrigível: `/root/hermes-backup-2026-07-30.tar.gz` estava `644` (mundo-legível, embora `/root` já fosse `750`) — corrigido para `600`.

**Risco residual documentado (não corrigível sem rotacionar):** a exposição original é a transcrição da conversa em que o Wandson colou o config ao vivo — não é um arquivo do sistema que se possa "limpar". Fica registrado como risco aceito pela decisão explícita do Wandson de não rotacionar agora. Detalhe completo: comentário em [CON-3](nimbalyst://CON-3).

## Achado técnico do GATE 0 (auditoria real, via `claudedev`)
- Processo do `hermes-gateway` ainda roda como **root** (não migrado)
- `~/.hermes/config.yaml` ao vivo = scaffold padrão genérico, NÃO é o `hermes/config.yaml` versionado/endurecido do repo — nunca foi sincronizado de verdade
- MCPs `cd-admin` e `vendaerp` quebrados ("has no 'command' in config") — só `ifood`/`asaas`/`evolution` funcionam
- `deploy-hermes.sh` existe (`hermes/deploy-hermes.sh`), foi lido e é seguro (exclui segredos, trava se persona tiver regra de negócio) — dry-run rodado com sucesso via `claudedev`, mostrou 13 profiles + config.yaml prontos pra sincronizar
- **Problema achado no dry-run:** rodando como `claudedev`, o script usa `$HOME` = `/home/claudedev/.hermes/`, MAS o serviço real lê de `/root/.hermes/`. Sincronizar assim não afeta o serviço rodando.

## PRÓXIMA AÇÃO (autorizada pelo Wandson nesta mensagem, EM ANDAMENTO)
Migrar o serviço de root pra claudedev:
1. Backup de `/root/.hermes/` antes de mexer
2. Mover/copiar `/root/.hermes/` → `/home/claudedev/.hermes/` (preserva segredos: `.env`, `mcp-tokens/`, `state.db`, `sessions/`, `memories/`)
3. Rodar `deploy-hermes.sh --apply` como `claudedev` (agora com `$HOME` certo) pra sincronizar config versionado por cima
4. Editar `/etc/systemd/system/hermes-gateway.service` → `User=claudedev`
5. `systemctl daemon-reload && sudo -n systemctl restart hermes-gateway` (verificar se o comando restart está no sudoers — está)
6. Verificar: `sudo -n systemctl status hermes-gateway` — confirmar rodando como claudedev, e que `cd-admin`/`vendaerp` continuam quebrados ou não (não é escopo desta migração corrigir esses 2)

Se algo quebrar no restart: serviço tem histórico de systemd, `systemctl status` mostra erro na hora. Backup do passo 1 permite reverter copiando de volta.

## ATUALIZAÇÃO — migração pausada com segurança (2026-07-31 02:32 UTC)
Progresso real: `/home/claudedev/.hermes/` já existe, com backup do original (`/root/hermes-backup-2026-07-30.tar.gz`), config.yaml versionado + 13 profiles já sincronizados via `deploy-hermes.sh --apply`.

**Bloqueio novo, mais fundo:** o Python real do Hermes (`hermes` CLI) resolve, via cadeia de symlinks, para `/root/.local/share/uv/python/cpython-3.11.15-linux-x86_64-gnu/bin/python3.11` — fora de qualquer pasta já liberada pro `claudedev`. Sem isso, o serviço não sobe rodando como `claudedev` (viraria outage). Precisa de mais uma ACL (`setfacl -R -m g:claudedev:rx /root/.local/share/uv/`) OU decisão de dar ao claudedev seu próprio venv/Python em vez de reusar o de root.

**Ação tomada:** parei a migração aí, **reiniciei o serviço original como root** pra não deixar produção fora do ar sem ninguém supervisionando. Zero mudança no `/root/.hermes` original — só existe uma cópia pronta esperando em `/home/claudedev/.hermes`.

**Próxima sessão, retomar assim:**
```bash
ssh vps "setfacl -R -m g:claudedev:rx /root/.local/share/uv/"
ssh vps-claudedev "hermes --version"   # confirma que resolveu
# se OK: editar /etc/systemd/system/hermes-gateway.service (User=claudedev), daemon-reload, restart, verificar status
```

## ATUALIZAÇÃO — migração CONCLUÍDA (2026-07-31, worker CON-1)

**Resultado: sucesso.** `hermes-gateway` roda como `claudedev` em produção, output bruto confirmado.

### Correção ao diagnóstico da sessão anterior
O handoff dizia que o bloqueio era `/root/.local/share/uv/...` como um todo. Investigação mais funda (`namei -l` + `stat` em cada nível da cadeia) achou que **só um diretório** na cadeia inteira estava fechado: `/root/.local/share` (modo `700`, sem ACL). Todo o resto (`/root`, `/root/.local`, `/root/.local/share/uv/...` até o binário `python3.11`) já era `755`/tinha ACL. Bastou:
```bash
setfacl -m g:claudedev:x /root/.local/share
```
(`--x` de travessia, não `r-x` — não precisa listar o conteúdo de `/root/.local/share`, só atravessar até o `uv/`.)

### Segundo bloqueio achado (não estava no handoff): `WorkingDirectory`
O `ExecStart` do systemd usa `WorkingDirectory=/root/.hermes`, que é `drwx------ root:root` — `claudedev` não conseguia nem entrar lá (`cd: Permission denied`), independente do Python. A cópia preparada pela sessão anterior (`deploy-hermes.sh --apply` com `$HOME=/home/claudedev`) ficou em **`/home/claudedev/.hermes/.hermes/`** (estrutura aninhada — o script escreveu em `$HOME/.hermes/`, um nível acima do esperado, mas o conteúdo interno replicou a estrutura original). `diff -rq` confirmou `config.yaml`, `.env` e `profiles/` **idênticos** entre `/root/.hermes/` e `/home/claudedev/.hermes/.hermes/`. Apontei `WorkingDirectory`/`HERMES_HOME` do novo unit pra esse path.

### Mudança aplicada
Backup do unit original: `/root/hermes-gateway.service.bak.20260731_024829` (na VPS, não versionado — é specific da VPS, mas o arquivo novo foi copiado pro repo, ver abaixo).

Diff aplicado em `/etc/systemd/system/hermes-gateway.service`:
```diff
 User=root              → User=claudedev
 Group=root              → Group=claudedev
 WorkingDirectory=/root/.hermes → WorkingDirectory=/home/claudedev/.hermes/.hermes
 HOME=/root               → HOME=/home/claudedev
 USER=root                → USER=claudedev
 LOGNAME=root              → LOGNAME=claudedev
 HERMES_HOME=/root/.hermes → HERMES_HOME=/home/claudedev/.hermes/.hermes
```
`ExecStart` inalterado (continua usando `/root/hermes-agent/venv/bin/python`, que é `755` — leitura/execução liberada pra qualquer usuário, não precisa migrar o venv em si).

### Output bruto de verificação
Antes de aplicar, testei `gateway run --replace` como `claudedev` com `timeout 15` (processo separado, serviço root original intacto durante o teste) — subiu limpo, mesmos warnings pré-existentes de `cd-admin`/`vendaerp` (já conhecidos, fora de escopo), SIGTERM limpo no fim.

Depois de `daemon-reload && systemctl restart hermes-gateway`:
```
$ systemctl show hermes-gateway -p User,MainPID,ActiveState,SubState,NRestarts
MainPID=1526241
NRestarts=0
User=claudedev
ActiveState=active
SubState=running

$ ps -o pid,user,cmd -p 1526241
    PID USER     CMD
1526241 clauded+ /root/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --replace
```
3 MCPs de ação (`ifood-mcp`, `asaas-mcp`, `evolution-mcp`) subiram normalmente como processos filhos. Varredura de logs (90s) sem `error`/`traceback`/`permission denied`/`critical` novos além dos warnings já conhecidos (`cd-admin`/`vendaerp` — fora de escopo, pré-existente). `NRestarts=0` confirmado alguns minutos depois — sem crash-loop mascarado pelo `Restart=always`.

`claudedev` já opera o serviço via sudo restrito sem depender de root: `sudo -n /usr/bin/systemctl status hermes-gateway` funciona (nota: precisa do path absoluto `/usr/bin/systemctl`, não `systemctl` cru — efeito do `secure_path` do sudoers, não é bug).

### Não mexido (fora de escopo, como já era antes)
- `cd-admin`/`vendaerp` continuam com o mesmo erro (`has no 'command' in config`) — idêntico a antes da migração, não é regressão.
- `/root/.hermes/` original **não foi apagado nem alterado** — segue intacto como fallback caso precise reverter (`User=root` + `WorkingDirectory=/root/.hermes` de volta, backup do unit em `/root/hermes-gateway.service.bak.20260731_024829`).

## Perguntas ainda em aberto (não bloqueiam a migração, mas ficam pendentes)
- Rotação da SUPABASE_SERVICE_KEY/INTERNAL_BRIDGE_TOKEN — investigada em CON-3 (2026-07-31), Wandson decidiu NÃO rotacionar agora; risco residual documentado (ver seção acima)
- Decisão de autenticação do `hermes-chat-mcp` (conta de serviço vs sessão)
- Credenciais dos 4 sistemas pessoais da Ana
- `/root/.hermes/` original ficou órfão (não mais usado pelo serviço) — decisão futura: apagar depois de um período de estabilidade observada, ou manter como backup frio indefinidamente. Não decidido nesta sessão (não é urgente, não ocupa recurso crítico).

## ATUALIZAÇÃO — `cd-admin`/`vendaerp` corrigido (2026-07-31, worker CON-4)

**Causa raiz:** o bloco `mcp_servers` do `config.yaml` ativo tinha `cd-admin` e `vendaerp` com **só** `enabled/resources/prompts` — sem `command`/`args`/`env` (por isso `MCP server 'X' has no 'command' in config`). Não é feature nunca ativada: `config.yaml.bak.preerpwrite` (29/jun) prova que ambos tinham config completa antes; em algum momento entre 29/jun e 31/jul o bloco foi reescrito e perdeu os campos dessas duas entradas (processo exato não identificado — gap de investigação futura).

**Correção:** chave `sb_secret_...` do backup testada isolada (curl direto, sem tocar config/serviço) → `HTTP 200`, ainda válida. Restaurados só os campos faltantes de `cd-admin`/`vendaerp` a partir do backup (script cirúrgico, preservou o resto do config), `systemctl restart hermes-gateway`. Verificado: `ActiveState=active`, `NRestarts=0`, zero warnings "has no 'command'" no log pós-restart, 5 processos MCP filhos confirmados via `ps -ef` (`admin-mcp`, `vendaerp-mcp`, `ifood-mcp`, `asaas-mcp`, `evolution-mcp`).

Detalhe completo com output bruto: comentários do CON-4 no tracker.
