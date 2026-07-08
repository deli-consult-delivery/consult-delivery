# AGENTS.md — Protocolos do Orquestrador

> Instrução do Wandson (2026-07-07): "tudo isso deve ser feito de forma automática."
> O orquestrador direciona, executa, monitora e VERIFICA o trabalho sem perguntar a cada passo.

## Protocolo de Task (obrigatório, automático)

Toda task de código segue estes estágios sem pedir confirmação entre eles:

### 1. Planejamento (antes do código)
- Definir **GOAL** (entregável com tipo/formato/tenant/critérios)
- Definir **QUALITY BAR** (3-7 itens binários, sempre inclui `build sem erros` + `output bruto visível`)
- Mapear arquivos afetados com search/grep antes de editar

### 2. Execução
- Branch `wandson/<descricao>` (NUNCA commitar em main)
- Seguir convenções do código vizinho (bibliotecas, estilo, padrões existentes)
- Diff cirúrgico, sem refatorar o que não é da task

### 3. Verificação da Quality Bar (output bruto)
Rodar cada item da Quality Bar com output real:
- `node --check` / `npm run build` / `tsc --noEmit` (o que aplicável)
- Testes existentes
- Nunca declarar "feito" sem log/output real

### 4. PR
- `gh pr create --base main --head <branch>` com corpo estruturado (o que muda / causa-raiz / solução / quality bar / contexto)
- Aguardar CI (build + scan) — `gh pr checks <n>`
- Só considerar pronto quando CI verde + MERGEABLE

### 5. Merge (após aprovação do Wandson)
- `gh pr merge <n> --squash --delete-branch`
- **Caveat Windows:** se `--delete-branch` falhar por "main already used by worktree", o merge já ocorreu — deletar branch remota manualmente (`git push origin --delete <branch>`) e local (`git branch -D <branch>`)
- Voltar para a branch de worktree do orquestrador (`ao/consult-deli-orchestrator`)

### 6. Verificação pós-merge (AUTOMÁTICA — não perguntar)
Após o merge, verificar o deploy em produção sem pedir permissão:

**Para mudanças no `bridge-server/`:**
```bash
# Script SSH único que checa tudo:
ssh root@187.127.25.24 'bash -s' << 'verify'
cd /root/consult-delivery
echo "=== git HEAD em prod ==="
git log --oneline -3
echo "=== merge commit presente? ==="
git log --oneline --all | grep -i "<palavra-chave-do-fix>" | head -1 || echo "NAO_ENCONTRADO"
echo "=== fix no codigo em prod ==="
grep -n "<palavra-chave>" bridge-server/routes/<arquivo>.js || echo "FIX_AUSENTE"
echo "=== pm2 status ==="
pm2 info bridge-server 2>/dev/null | grep -E "status|uptime|restarts|unstable|created"
echo "=== porta 3001 ==="
ss -tlnp 2>/dev/null | grep 3001 || echo "PORTA_INATIVA"
verify
```
Critérios de sucesso (todos devem passar):
- [ ] merge commit no `git log` da VPS
- [ ] fix presente no código em `/root/consult-delivery` (grep)
- [ ] pm2 `status: online`, `unstable restarts: 0`
- [ ] `created at` posterior ao merge timestamp (bridge reiniciou)
- [ ] porta 3001 LISTEN

**Para mudanças no frontend (`src/`):**
- Aguardar ~3 min (GitHub Actions → Pages)
- Verificar bundle: `curl -s https://app.consultdelivery.com.br/ | grep -o '"[^"]*\.js"' | head -1`
- `bash scripts/qa-run.sh --no-build` se aplicável

**Para mudanças em `trigger/` (Trigger.dev):**
- Deploy é manual: `npx trigger.dev@4.4.6 deploy` na raiz canônica `/root/consult-delivery`
- Confirmar versão nova no dashboard / `gh run list`

### 7. Registro
- Atualizar `WikiBrain/wiki/PLANO-MESTRE — Tracker.md` se a task for do plano-mestre
- Atualizar `PLANO-MESTRE.md` (marcar `[x]`)
- Commitar ambos no mesmo PR da task quando aplicável

## Monitoramento de Workers (OBRIGATÓRIO, automático)

> Instrução do Wandson (2026-07-07): "sempre que eu lançar uma task, você faz o monitoramento e o acompanhamento."

Sempre que houver um worker ativo (`ao session ls` mostrar sessão não-terminated), o orquestrador:

### 1. Detectar workers ativos
- Rodar `ao session ls` periodicamente (a cada ciclo de monitoramento)
- Identificar sessões `worker` com `status != terminated`
- Para cada worker ativo, rodar `ao session get <id>` para ver status/atualização

### 2. Acompanhar o trabalho
- Monitorar o progresso do worker (status: idle → running → done/failed)
- Verificar se o worker está produzindo (git status, commits, PRs no repo)
- Se o worker ficar **idle por mais de 5 min sem progresso**, alertar o Wandson e sugerir ação (intervir, enviar mensagem, ou matar a sessão)
- Se o worker travar em loop ou erro, intervir com `ao send <session> "<mensagem>"` ou `ao session kill <id>`

### 3. Verificar qualidade ANTES de commit/PR/deploy
Quando o worker terminar o trabalho, o orquestrador DEVE verificar (não confiar no worker):
- `node --check` / `npm run build` / `tsc --noEmit` no código alterado (output bruto)
- Testes existentes (`npm test` / `bash scripts/qa-run.sh`)
- **Decoder no navegador** se envolver frontend/UI: usar `chrome-devtools_*` para navegar, snapshot, screenshot e validar visualmente
- `git diff` revisado pelo orquestrador (não pelo worker)
- Checar se o worker não quebrou arquivos fora do escopo da task

### 4. Gates antes de liberar
- [ ] Worker parou de produzir (status estável, não running)
- [ ] `git status` mostra só arquivos esperados da task
- [ ] `node --check` / build limpos
- [ ] Testes passam
- [ ] Validação no navegador (se UI) com snapshot/screenshot
- [ ] Diff revisado pelo orquestrador

Só depois de TUDO passar → autorizar commit/PR (AMARELO: Wandson aprova merge) → verificação pós-merge (seção 6).

### 5. Não deixar sessão ociosa
- Se worker termina a task mas sessão fica `idle` sem `terminated`, sugerir `ao session kill <id>` ao Wandson (não deixar sessão zumbi consumindo recursos)
- Se worker está `idle` mas ainda há trabalho pendente da task, enviar `ao send <session> "<próxima instrução>"` para destravar

### 5.1 Validação visual OBRIGATÓRIA no navegador (toda task de UI/frontend)

> Instrução do Wandson (2026-07-07): "quando você fizer o trabalho, você roda um servidor local, abre o navegador, a página, a plataforma, faz o teste. Se der tudo certo, você automaticamente faz o merge — não precisa me perguntar se estiver confiante."

Toda task que altera `src/` (frontend) DEVE, antes do merge:

1. **Rodar servidor local**: `npm run dev` (ou `npm run preview` após build) na worktree
2. **Abrir no navegador** via `chrome-devtools_*`:
   - `chrome-devtools_navigate_page` para a URL local
   - `chrome-devtools_take_snapshot` para validar estrutura/DOM
   - `chrome-devtools_take_screenshot` para validar visualmente
3. **Navegar até a tela/modificação** específica da task e confirmar:
   - Elemento alterado aparece corretamente
   - Sem regressão visual óbvia (layout quebrado, erro no console)
   - `chrome-devtools_list_console_messages` sem erros `error`
4. **Decisão automática de merge** (semáforo verde para UI validada):
   - Se build limpo + CI verde + validação visual PASSA → **fazer merge automaticamente**, sem perguntar ao Wandson
   - Se houver QUALQUER dúvida/erro visual → NÃO mergear, reportar ao Wandson com screenshot
   - Critério de confiança: "está tudo certo e não vai dar nenhum problema" = merge direto

O orquestrador só pede aprovação do Wandson para merge quando **não tem confiança** ou quando a task é AMARELO/VERMELHO por outro motivo (escreve em dados reais, DDL, mensagens a clientes). UI de baixo risco + validada = merge automático.

## Semáforo (autonomia)

- **VERDE** → orquestrador executa e reporta (inclui verificação pós-merge)
- **AMARELO** → orquestrador propõe, Wandson aprova com `ok` (ex: merge de PR, escrita em dados reais)
- **VERMELHO** → aprovação explícita `APROVADO VERMELHO apr-xxx` (ex: DDL destrutivo, mensagens a clientes)

## Acesso ao banco (Supabase)

Sem service_role key local (só anon, bloqueada por RLS). Caminho canônico:
- SSH na VPS: `ssh root@187.127.25.24`
- Source do `.env` da bridge: `set -a; . /root/consult-delivery/bridge-server/.env; set +a`
- Usar `$SUPABASE_URL` + `$SUPABASE_SERVICE_ROLE_KEY` via `curl` REST API
- PowerShell não suporta heredoc — usar `Get-Content script.sh -Raw | ssh root@187.127.25.24 'bash -s'`

## Cache de queries úteis

- Loja por nome: `lojas?nome=ilike.*<nome>*&select=id,nome,is_consultoria_ativa,store_tenant_id`
- Cobranças por loja: `cobrancas?customer_name=ilike.*<nome>*&select=id,valor,vencimento,status,payment_date`
- Drafts por cobrança: `agent_drafts?metadata->>cobranca_v2_id=eq.<uuid>&select=id,status,reviewer_id,sent_at,created_at`
- Cora reguas: `cora_reguas?select=*` (note: tabela `cora_reguas` não tem coluna `ativo`)