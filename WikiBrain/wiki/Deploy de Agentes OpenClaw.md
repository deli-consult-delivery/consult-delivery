# Deploy de Agentes OpenClaw

Procedimento descoberto e validado em 06/05/2026 ao subir a [[LARA — Agente Régua]].
Serve como referência para DELI, CORA, SOFIA e qualquer agente futuro.

---

## Infraestrutura

- **VPS:** 45.39.210.183 (Ubuntu 24.04 LTS)
- **OpenClaw:** 2026.5.2, processo Node.js, porta 18789
- **Chave SSH:** `~/.ssh/vps_openclaw` (no WSL da máquina local)
- **Config global:** `/root/.openclaw/openclaw.json`
- **Agentes:** `/root/.openclaw/agents/<nome>/`

O OpenClaw **não roda via systemd** (`openclaw.service` não existe). É um processo Node.js
persistente iniciado manualmente. O CLI `openclaw` está disponível em `/usr/bin/openclaw`.

---

## Estrutura de um agente

```
/root/.openclaw/agents/<nome>/
├── workspace/
│   ├── system_prompt.md      ← identidade e instruções do agente
│   ├── base_regras.yaml      ← regras operacionais
│   ├── nexus_subagents_spec.md  ← (opcional) spec de sub-agentes
│   └── memory/               ← criado automaticamente em uso
├── sessions/                 ← criado automaticamente
└── auth-profiles.json        ← criado pelo CLI no agents add
```

Os arquivos do workspace ficam **também no repo** em `.openclaw/agents/<nome>/`
e são copiados via `scp` na hora do deploy.

---

## Passo a passo do deploy

### 1. Conectar SSH

```bash
ssh -i ~/.ssh/vps_openclaw root@45.39.210.183
```

### 2. Backup do config global

```bash
cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.bak-$(date +%Y%m%d-%H%M%S)
```

### 3. Criar diretório workspace na VPS

```bash
mkdir -p /root/.openclaw/agents/<nome>/workspace
```

### 4. Copiar arquivos do repo local para a VPS

Da máquina local (WSL), a partir da raiz do repo:

```bash
KEY="$HOME/.ssh/vps_openclaw"
VPS="root@45.39.210.183"
DEST="/root/.openclaw/agents/<nome>/workspace"
REPO=".openclaw/agents/<nome>"

scp -i "$KEY" "$REPO/system_prompt.md"        "$VPS:$DEST/"
scp -i "$KEY" "$REPO/base_regras.yaml"        "$VPS:$DEST/"
scp -i "$KEY" "$REPO/nexus_subagents_spec.md" "$VPS:$DEST/"  # se existir
```

### 5. Registrar o agente via CLI

```bash
openclaw agents add <nome> \
  --workspace /root/.openclaw/agents/<nome>/workspace \
  --agent-dir /root/.openclaw/agents/<nome> \
  --model anthropic/claude-sonnet-4-6 \
  --non-interactive \
  --json
```

O CLI atualiza `/root/.openclaw/openclaw.json` automaticamente e cria `auth-profiles.json`.
**Não precisa reiniciar o OpenClaw.**

### 6. Validar

```bash
# Agente aparece na lista?
openclaw agents list

# Smoke test via CLI (aguardar ~15s):
openclaw agent --agent <nome> -m "oi, você consegue se apresentar?"
```

---

## Roteamento (opcional)

Para rotear um canal Telegram para o agente:

```bash
openclaw agents bind <nome> telegram:<accountId>
```

---

## Smoke test de saúde do analista-ifood (pós-deploy)

Sempre confirmar que o agente existente não quebrou:

```bash
openclaw agent --agent analista-ifood -m "teste de saúde"
```

---

## Rollback

```bash
# Remover agente do config
openclaw agents delete <nome>

# Restaurar backup manual se necessário
cp /root/.openclaw/openclaw.json.bak-YYYYMMDD-HHMMSS /root/.openclaw/openclaw.json
```

---

## Agentes deployados até hoje

| Agente | Data | Observação |
|---|---|---|
| main | 03/05/2026 | default, genérico |
| analista-ifood | 03/05/2026 | Co-piloto Delivery, roteado para Telegram @DeliConsultBot |
| lara | 06/05/2026 | CRM food service + régua de disparo |

---

## Gateway token (para chamadas REST via bridge-server)

O token de autenticação do gateway fica em `openclaw.json`:

```json
"gateway": {
  "auth": {
    "mode": "token",
    "token": "d052767b9a1d323359ecc8f2f6b6fbecb4e9c791adf474fc"
  }
}
```

Endpoint base: `http://localhost:18789` (bind loopback — não exposto externamente).
O Bridge Server acessa via localhost na VPS.

---

*Veja também: [[LARA — Agente Régua]], [[Evolution API Webhooks]]*
