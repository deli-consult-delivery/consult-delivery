# 🚀 Deploy da LARA no OpenClaw — Roteiro SSH

> Roteiro pra subir a LARA no OpenClaw na VPS 45.39.210.183:18789.
> Versão: 1.0 — 06/05/2026
>
> ⚠️ **LEIA O AVISO ANTES DE EXECUTAR** ⚠️

---

## ⚠️ AVISO IMPORTANTE

Não tenho certeza do procedimento EXATO de deploy de novos agentes no OpenClaw 2026.5.2.
Pode ser via diretório, API, CLI ou systemd. Por isso este roteiro tem 2 fases:

- **Fase 1 — Descoberta** (sempre fazer): identifica como seu OpenClaw específico carrega agentes
- **Fase 2 — Deploy** (executa conforme descoberta): aplica os arquivos no caminho certo

Se você já sabe como subir agentes no seu OpenClaw (porque já subiu o `analista-ifood`),
pula direto pra **Fase 2** seguindo o mesmo padrão.

---

## 🔐 Pré-requisitos

- Acesso SSH à VPS: `ssh root@45.39.210.183` (ou usuário equivalente)
- Senha/chave SSH atualizada (lembrar: senha VPS está pendente de rotação)
- Os arquivos do agente já no seu repo local:
  - `.openclaw/agents/lara/system_prompt.md`
  - `.openclaw/agents/lara/base_regras.yaml`
  - `.openclaw/agents/lara/nexus_subagents_spec.md`

---

## 📋 PROMPT PRA COLAR NO CLAUDE CODE (com SSH)

Se você quer que o Claude Code faça via SSH automaticamente, cola este prompt:

```
Tarefa: fazer deploy da LARA no OpenClaw da VPS via SSH.

CONTEXTO:
- VPS: 45.39.210.183 (Ubuntu 24.04 LTS)
- OpenClaw 2026.5.2 rodando porta 18789 (systemd persistente)
- Agente já existente como referência: analista-ifood
- Arquivos da LARA já estão no repo em .openclaw/agents/lara/

REGRAS:
- NÃO MEXER no agente analista-ifood
- NÃO REINICIAR o OpenClaw sem mostrar pra mim primeiro
- Sempre mostrar saída bruta dos comandos (não resumir)
- Se algum comando falhar, PARAR e perguntar
- Validar cada passo antes do próximo

FASE 1 — DESCOBERTA (executar tudo, mostrar saída bruta):

1. Conectar SSH:
   ssh root@45.39.210.183

2. Identificar onde está o OpenClaw:
   systemctl status openclaw
   ps aux | grep -i openclaw
   which openclaw 2>/dev/null || echo "sem CLI no PATH"

3. Achar onde os agentes existentes vivem:
   find / -type d -name "agents" 2>/dev/null | grep -v proc
   find / -type d -name "analista-ifood" 2>/dev/null
   find / -type f -name "system_prompt.md" 2>/dev/null

4. Verificar a estrutura do agente analista-ifood (referência):
   # quando achar o caminho, listar:
   ls -la <caminho>/analista-ifood/
   cat <caminho>/analista-ifood/system_prompt.md | head -20
   # se tiver outros arquivos (manifest.yaml, config.json, etc), 
   # mostrar TODOS eles

5. Verificar como o OpenClaw é configurado:
   systemctl cat openclaw
   # se tiver arquivo de config:
   find / -name "openclaw*.yaml" 2>/dev/null
   find / -name "openclaw*.json" 2>/dev/null
   find / -name "openclaw*.toml" 2>/dev/null

6. Ver logs recentes do OpenClaw:
   journalctl -u openclaw -n 50 --no-pager

7. Verificar se tem API REST do OpenClaw:
   curl -s http://localhost:18789/health 2>&1 | head -20
   curl -s http://localhost:18789/agents 2>&1 | head -30

ME REPORTAR TUDO isso ANTES de seguir pra Fase 2. 
Não tente adivinhar o procedimento. 
Vou olhar a saída e te dizer o caminho exato.
```

---

## 🔧 FASE 2 — DEPLOY (após descoberta)

### Cenário A — OpenClaw lê de diretório (mais comum)

Se a Fase 1 mostrar que agentes vivem em algum diretório (ex: `/opt/openclaw/agents/`):

```bash
# 1. SSH na VPS
ssh root@45.39.210.183

# 2. Backup do estado atual
sudo tar -czf /root/backup-openclaw-$(date +%Y%m%d-%H%M).tgz /opt/openclaw/agents/

# 3. Criar diretório do novo agente
sudo mkdir -p /opt/openclaw/agents/lara

# 4. Voltar pra máquina LOCAL e copiar os arquivos
exit
cd C:\Users\Consult Delivery\consult-delivery
scp .openclaw/agents/lara/system_prompt.md          root@45.39.210.183:/opt/openclaw/agents/lara/
scp .openclaw/agents/lara/base_regras.yaml          root@45.39.210.183:/opt/openclaw/agents/lara/
scp .openclaw/agents/lara/nexus_subagents_spec.md   root@45.39.210.183:/opt/openclaw/agents/lara/

# 5. Voltar pra VPS e validar
ssh root@45.39.210.183
ls -la /opt/openclaw/agents/lara/
diff /opt/openclaw/agents/analista-ifood/ /opt/openclaw/agents/lara/  # comparar estrutura

# 6. Validar permissões (deve ser igual à do analista-ifood)
stat /opt/openclaw/agents/analista-ifood/system_prompt.md
stat /opt/openclaw/agents/lara/system_prompt.md
# se diferentes:
sudo chown -R openclaw:openclaw /opt/openclaw/agents/lara/  # ou o user que dono do analista
sudo chmod -R 644 /opt/openclaw/agents/lara/*.md /opt/openclaw/agents/lara/*.yaml

# 7. Reload do OpenClaw
# OPÇÃO A — reload sem downtime (se OpenClaw suportar SIGHUP):
sudo systemctl reload openclaw

# OPÇÃO B — restart (causa breve downtime):
sudo systemctl restart openclaw
sleep 5
sudo systemctl status openclaw

# 8. Validar que LARA carregou
journalctl -u openclaw -n 30 --no-pager | grep -i lara
curl -s http://localhost:18789/agents | grep -i lara
# ou conforme API real descoberta na Fase 1
```

### Cenário B — OpenClaw via API REST

Se a Fase 1 mostrou um endpoint tipo `POST /agents`:

```bash
# 1. SSH na VPS (curl pode ir de fora também)
ssh root@45.39.210.183

# 2. Criar payload com o conteúdo dos arquivos
SYSTEM_PROMPT=$(cat /tmp/lara-system-prompt.md)  # você sobe o arquivo antes via scp
BASE_REGRAS=$(cat /tmp/lara-base-regras.yaml)

# 3. POST pro endpoint (formato exato depende da API descoberta)
curl -X POST http://localhost:18789/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OPENCLAW_ADMIN_TOKEN}" \
  -d @- <<EOF
{
  "name": "lara",
  "system_prompt": "${SYSTEM_PROMPT}",
  "config": {
    "base_regras": "${BASE_REGRAS}"
  }
}
EOF
```

### Cenário C — OpenClaw via CLI

Se descobrir um CLI tipo `openclaw agent add`:

```bash
# Comando exato vai sair da Fase 1
openclaw agent add --name lara \
  --system-prompt /tmp/lara-system-prompt.md \
  --config /tmp/lara-base-regras.yaml
```

---

## ✅ VALIDAÇÃO PÓS-DEPLOY

Depois do deploy, sempre validar 3 coisas:

### 1. OpenClaw está saudável
```bash
sudo systemctl status openclaw
# deve mostrar "active (running)"

journalctl -u openclaw -n 50 --no-pager
# não pode ter ERROR ou FATAL recente
```

### 2. LARA aparece na listagem de agentes
Comando depende da API/estrutura real, mas algo equivalente a:
```bash
curl http://localhost:18789/agents
# ou
ls /opt/openclaw/agents/
```
Tem que ter `lara` na lista junto com `analista-ifood` e `main`.

### 3. analista-ifood NÃO foi quebrado
Sempre testar que o agente original continua funcionando:
```bash
curl -X POST http://localhost:18789/invoke/analista-ifood \
  -H "Content-Type: application/json" \
  -d '{"message": "teste de saúde"}' | head -50
```

### 4. Smoke test da LARA (chat simples)
```bash
curl -X POST http://localhost:18789/invoke/lara \
  -H "Content-Type: application/json" \
  -d '{"message": "oi LARA, você consegue se apresentar?"}'
```

A resposta esperada é a LARA dizendo quem ela é e o que faz, citando régua, pesquisa,
sub-agentes Nexus, etc. Se ela alucinar ou não souber quem é, o `system_prompt.md`
não foi carregado corretamente.

---

## 🆘 ROLLBACK (se algo der errado)

```bash
# 1. Restaurar backup
sudo systemctl stop openclaw
sudo rm -rf /opt/openclaw/agents/lara/
sudo tar -xzf /root/backup-openclaw-YYYYMMDD-HHMM.tgz -C /

# 2. Reiniciar
sudo systemctl start openclaw
sudo systemctl status openclaw

# 3. Validar que analista-ifood voltou ao normal
journalctl -u openclaw -n 30 --no-pager
```

---

## 📝 CHECKLIST FINAL

- [ ] Fase 1 completa, descoberta documentada
- [ ] Backup do estado atual feito (tar.gz)
- [ ] Arquivos copiados pro caminho certo
- [ ] Permissões corretas (igual ao analista-ifood)
- [ ] OpenClaw recarregado sem erros
- [ ] LARA aparece na listagem
- [ ] analista-ifood continua funcionando
- [ ] Smoke test da LARA passou
- [ ] Logs sem erros
- [ ] Documentar caminho e procedimento descoberto pra próximos agentes (DELI, CORA, etc)

---

## 📚 Atualizar documentação após deploy

Depois do deploy bem-sucedido, atualizar em ordem:

1. **CLAUDE.md** — marcar LARA como "✅ Ativa no OpenClaw"
2. **WikiBrain** — criar página `WikiBrain/wiki/Deploy de Agentes OpenClaw.md`
   documentando o procedimento descoberto (Cenário A/B/C, comandos exatos)
3. **docs/fluxos/lara-regua.md** — atualizar status do agente

Isso evita que da próxima vez (DELI, CORA, etc) você ou outro Claude tenha que
descobrir tudo de novo.

---

*Roteiro pronto. Sucesso! 🚀*
