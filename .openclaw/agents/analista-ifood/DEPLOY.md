# DEPLOY.md — Como subir o Co-piloto Delivery na VPS

Guia passo a passo pra deployar o agente analista-ifood no OpenClaw rodando na VPS.

## Pré-requisitos

- ✅ OpenClaw já instalado e rodando na VPS (45.39.210.183)
- ✅ Bot Telegram `@DeliConsultBot` conectado
- ✅ Pairing aprovado pra usuários autorizados
- ✅ Esses arquivos prontos no Windows: `AGENTS.md`, `SOUL.md`, `USER.md`, `system_prompt.md`, `base_regras.yaml`, `transcricoes/`

## Estratégia de deploy

Vamos criar um **agente separado** chamado `analista-ifood` no OpenClaw, deixando o `main` intacto. Isso permite ter múltiplos agentes coexistindo.

## Passo 1 — Conectar na VPS

```powershell
ssh -i "C:\Users\Consult Delivery\.ssh\vps_openclaw" root@45.39.210.183
```

## Passo 2 — Criar workspace do agente na VPS

```bash
# Criar pasta do agente
mkdir -p /root/.openclaw/agents/analista-ifood/sessions
mkdir -p /root/.openclaw/agents/analista-ifood/workspace
mkdir -p /root/.openclaw/agents/analista-ifood/workspace/transcricoes
mkdir -p /root/.openclaw/agents/analista-ifood/workspace/memory/lojas

# Confirmar
ls -la /root/.openclaw/agents/
```

## Passo 3 — Transferir arquivos do Windows pra VPS

**No Windows (PowerShell, novo terminal):**

```powershell
cd "C:\Users\Consult Delivery\consult-delivery\.openclaw\agents\analista-ifood"

# Transferir todos os arquivos via SCP
scp -i "C:\Users\Consult Delivery\.ssh\vps_openclaw" `
    AGENTS.md SOUL.md USER.md system_prompt.md base_regras.yaml `
    root@45.39.210.183:/root/.openclaw/agents/analista-ifood/workspace/

# Transferir pasta de transcrições
scp -i "C:\Users\Consult Delivery\.ssh\vps_openclaw" -r `
    transcricoes `
    root@45.39.210.183:/root/.openclaw/agents/analista-ifood/workspace/
```

## Passo 4 — Verificar transferência (na VPS)

```bash
ls -la /root/.openclaw/agents/analista-ifood/workspace/
ls -la /root/.openclaw/agents/analista-ifood/workspace/transcricoes/
```

Deve aparecer:
- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `system_prompt.md`
- `base_regras.yaml`
- `transcricoes/` com `salgados_da_monica.txt` dentro

## Passo 5 — Configurar OpenClaw pra reconhecer o novo agente

```bash
# Listar agentes existentes
openclaw agents list

# Criar novo agente
openclaw agents create analista-ifood \
  --workspace /root/.openclaw/agents/analista-ifood/workspace \
  --model anthropic/claude-sonnet-4-6
```

> ⚠️ **Atenção:** comando exato pode variar. Se der erro, rodar `openclaw agents --help` pra ver opções disponíveis.

## Passo 6 — Configurar roteamento do Telegram

Cada consultor vai ser pareado a um agente específico. Por padrão, o Telegram fala com `main`.

**Pra rotear pro `analista-ifood`:**

```bash
openclaw config set channels.telegram.defaultAgent "analista-ifood"
```

Ou pra rotear baseado em comando (mais flexível):

```bash
# Configurar comando /analista pra ativar o analista-ifood
openclaw config set channels.telegram.routes.analista "analista-ifood"
```

## Passo 7 — Reiniciar gateway pra aplicar configs

```bash
systemctl --user restart openclaw-gateway
sleep 3
openclaw status
```

## Passo 8 — Testar no Telegram

Abre o `@DeliConsultBot` no Telegram e manda:

```
oi, você é o Co-piloto Delivery?
```

**Resposta esperada:** ele se apresenta como Co-piloto Delivery, não como o agente genérico anterior.

Se ele responder genérico ("Olá, sou seu assistente..."), algo deu errado:
- Conferir se os arquivos foram lidos (`openclaw logs --follow`)
- Conferir se o roteamento tá certo (`openclaw config show`)

## Passo 9 — Primeiro teste de análise

Mande um print/dados de uma loja teste e veja se ele responde no formato esperado (análise técnica + mensagem WhatsApp).

## Passo 10 — Configurar análises automáticas (opcional, fase 2)

Pra análises diárias automáticas, configurar cron:

```bash
openclaw cron add daily-analysis \
  --schedule "0 9 * * *" \
  --agent analista-ifood \
  --command "rodar análise diária de todas as lojas em lojas-ativas.yaml"
```

> ⚠️ **Pré-requisito da fase 2:** ter o n8n puxando dados das lojas pra um banco/arquivo que o agente consegue ler.

## Troubleshooting

### Agente não aparece após `openclaw agents create`

```bash
openclaw agents list
cat /root/.openclaw/openclaw.json | grep -A 5 "agents"
```

### Telegram ainda fala com agente "main"

```bash
openclaw config show | grep -A 5 telegram
```

Se `defaultAgent` não estiver setado, rodar Passo 6 de novo.

### Logs em tempo real

```bash
openclaw logs --follow
```

### Reset completo (último recurso)

```bash
openclaw agents delete analista-ifood
# Refazer Passo 5 em diante
```

## Checklist final

- [ ] Arquivos transferidos pra VPS
- [ ] Agente criado no OpenClaw
- [ ] Roteamento Telegram configurado
- [ ] Gateway reiniciado
- [ ] Teste no Telegram OK
- [ ] Primeira análise teste OK
- [ ] (Opcional) Cron de análise diária configurado

---

## Próximas etapas após deploy

1. **Cadastrar primeiras lojas** em `lojas-ativas.yaml`
2. **Conectar n8n** pra puxar dados do Portal iFood automaticamente
3. **Criar pasta `memory/lojas/`** com primeira análise de cada cliente
4. **Treinar o agente** com mais transcrições do Yan analisando lojas

---

_Atualizar este documento conforme mudanças no processo._
