# Feature BomDia — Estado completo

**Implementado em:** 2026-05-20 | **Commits:** `fb08215`, `58bf0ee`

## O que existe

### Schema (migration `20260520_010`)
- `whatsapp_groups.bom_dia_ativo BOOLEAN DEFAULT FALSE` — marca grupos para auto-envio
- `bom_dia_config (tenant_id PK, auto_send, hora_semana, hora_sabado, updated_at)` — config por tenant
- Índice parcial `idx_whatsapp_groups_bom_dia` WHERE bom_dia_ativo = TRUE
- Policy UPDATE em `whatsapp_groups` restrita a admin/marketing

### Frontend (`src/screens/BomDiaScreen.jsx`)
- **AgentMessage** → send panel com 2 modos:
  - **Gerenciar:** toggle CSS por grupo → grava `bom_dia_ativo` em tempo real
  - **Enviar:** lista só grupos `bom_dia_ativo=true`, pré-selecionados
- **ProfilePanel** → tab **Agendamento**: toggle `auto_send` + horários → grava em `bom_dia_config`
- Estado `autoSendCfg` no parent BomDiaScreen, carregado de `bom_dia_config` on mount

### Bridge Server (`bridge-server/index.js`)
- `/agents/bom-dia/send-groups` aceita `x-internal-token` (Trigger.dev) OU JWT (frontend)
- Middleware `requireJwtOrInternal` definido ~linha 74

### Trigger.dev (`trigger/bom-dia/envio-agendado.ts`)
- `bom-dia-envio-agendado-semana` → cron `0 12 * * 1-5` (seg-sex 09h BRT)
- `bom-dia-envio-agendado-sabado` → cron `0 11 * * 6` (sáb 08h BRT)
- Feriados nacionais 2026/2027 hardcoded (MM-DD) → skip silencioso
- Fluxo: busca tenants `auto_send=true` → run de hoje ou dispara `gerar-imagem` → POST bridge

## Para ativar o auto-envio (passo a passo do usuário)

1. Abrir BomDia → Perfil → tab **Agendamento** → ligar "Auto-envio" → Salvar
2. No send panel → **Gerenciar** → ativar os grupos desejados (toggle por grupo)

## Diagnóstico de problemas

| Sintoma | Onde verificar |
|---|---|
| Grupos não aparecem no envio | `bom_dia_ativo=true` em whatsapp_groups |
| Auto-envio não dispara | `auto_send=true` em bom_dia_config; bridge com código novo |
| Bridge recusa x-internal-token | `pm2 restart bridge-server` em /root/consult-delivery |
| Imagem não gerada | agent_runs onde agent_id='bom-dia', status='success', data de hoje |
