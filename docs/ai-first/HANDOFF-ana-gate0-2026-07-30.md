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

## 🚨 Pendência de segurança — ainda não resolvida
`SUPABASE_SERVICE_KEY` e `INTERNAL_BRIDGE_TOKEN` vazaram em texto puro no chat (output do `~/.hermes/config.yaml` antigo, colado pelo Wandson). **Precisam ser rotacionados** — Supabase Dashboard → Settings → API → Reset service_role key. Wandson: NÃO cole o valor novo em chat nenhum — só avise "troquei" e eu atualizo as referências sem precisar ver o valor.

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

## Perguntas ainda em aberto (não bloqueiam a migração, mas ficam pendentes)
- Rotação da SUPABASE_SERVICE_KEY/INTERNAL_BRIDGE_TOKEN (Wandson)
- Corrigir `cd-admin`/`vendaerp` (fora do escopo desta sessão)
- Decisão de autenticação do `hermes-chat-mcp` (conta de serviço vs sessão)
- Credenciais dos 4 sistemas pessoais da Ana
