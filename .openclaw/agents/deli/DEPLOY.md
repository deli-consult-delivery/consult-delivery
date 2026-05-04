# DEPLOY.md — Como subir a DELI na VPS

⚠️ **Sempre confirmar com Wandson antes de executar qualquer SSH ou SCP na VPS.**

Pré-requisitos:
- ✅ OpenClaw 2026.5.2 rodando em 45.39.210.183:18789
- ✅ Agente `analista-ifood` já registrado (referência de estrutura)
- ✅ Esses arquivos prontos: AGENTS.md, SOUL.md, USER.md, system_prompt.md, README.md

---

## Passo 1 — Conectar na VPS

```powershell
ssh -i "C:\Users\Consult Delivery\.ssh\vps_openclaw" root@45.39.210.183
```

## Passo 2 — Criar estrutura de diretórios na VPS

```bash
mkdir -p /root/.openclaw/agents/deli/workspace
mkdir -p /root/.openclaw/agents/deli/sessions

# Confirmar
ls -la /root/.openclaw/agents/
```

Deve aparecer: `analista-ifood/` e `deli/`

## Passo 3 — Transferir arquivos (no Windows, PowerShell)

```powershell
cd "C:\Users\Consult Delivery\consult-delivery-deli\.openclaw\agents\deli"

# Transferir todos os arquivos do agente
scp -i "C:\Users\Consult Delivery\.ssh\vps_openclaw" `
    AGENTS.md SOUL.md USER.md system_prompt.md README.md `
    root@45.39.210.183:/root/.openclaw/agents/deli/workspace/
```

## Passo 4 — Verificar transferência (na VPS)

```bash
ls -la /root/.openclaw/agents/deli/workspace/
```

Deve aparecer: AGENTS.md, SOUL.md, USER.md, system_prompt.md, README.md

## Passo 5 — Registrar agente no OpenClaw

```bash
# Ver agentes existentes
openclaw agents list

# Criar agente DELI
openclaw agents add deli \
  --workspace /root/.openclaw/agents/deli/workspace \
  --agent-dir /root/.openclaw/agents/deli \
  --model anthropic/claude-sonnet-4-6

# Confirmar criação
openclaw agents list
```

> ⚠️ Se o comando `add` não existir, tentar `create`:
> ```bash
> openclaw agents create deli \
>   --workspace /root/.openclaw/agents/deli/workspace \
>   --model anthropic/claude-sonnet-4-6
> ```

## Passo 6 — Configurar roteamento Telegram (exclusivo Wandson)

DELI usa canal Telegram separado do analista-ifood. Configurar:

```bash
# Ver config atual
openclaw config show | grep -A 10 telegram

# Configurar DELI para o chat_id do Wandson
# (Sintaxe exata depende da versão — verificar com: openclaw config --help)
openclaw config set channels.telegram.agents.deli.allowed_chat_ids "[8745522380]"
```

## Passo 7 — Reiniciar gateway

```bash
systemctl restart openclaw-gateway
sleep 3
openclaw status
```

## Passo 8 — Testar no Telegram

Wandson manda no Telegram (canal DELI):

```
oi, você é a DELI?
```

**Resposta esperada:** DELI se apresenta como COO Digital, menciona semáforo de autonomia, pede o que quer saber.

**Se responder como assistente genérico:** verificar roteamento (Passo 6).

## Passo 9 — Verificar Bridge Server

O Bridge Server precisa ser atualizado para incluir o módulo Realtime antes do deploy final.

```bash
# Na VPS, verificar se o Bridge Server está rodando
systemctl status bridge-server

# Ver logs
journalctl -u bridge-server -n 50 --no-pager
```

## Troubleshooting

**DELI não aparece na lista de agentes:**
```bash
openclaw agents list
cat /root/.openclaw/openclaw.json | grep -A 5 '"deli"'
```

**Telegram ainda cai pro main:**
```bash
openclaw config show | grep telegram
```

**Logs em tempo real:**
```bash
openclaw logs --follow --agent deli
```

**Reset completo (último recurso):**
```bash
openclaw agents delete deli
# Refazer do Passo 5
```

---

## Checklist final

- [ ] Arquivos transferidos via SCP
- [ ] Agente registrado no OpenClaw (`openclaw agents list`)
- [ ] Roteamento Telegram configurado para chat_id 8745522380
- [ ] Gateway reiniciado
- [ ] Teste no Telegram OK (DELI se identifica)
- [ ] Bridge Server atualizado com módulo Realtime
- [ ] Bridge Server reiniciado

---

_Atualizar após cada mudança no processo de deploy._
