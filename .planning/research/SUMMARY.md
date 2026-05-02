# Research Summary — Análise iFood

**Sintetizado:** 2026-05-01

---

## Recommended Stack

| Camada | Escolha | Racional |
|--------|---------|---------|
| Modelo IA | `claude-sonnet-4-6` | Raciocínio estruturado + visão; Haiku insuficiente para output de nível consultoria. `claude-sonnet-4-20250514` (no CLAUDE.md) aposenta em 15/jun/2026 |
| Chamada IA | HTTP Request node (não nó nativo Anthropic n8n) | Nó nativo não suporta entrada binária multimodal |
| JSON enforcement | Claude tool-use / structured output mode | Prompt-only não confiável; tool-use restringe geração de tokens a JSON válido |
| Google Drive auth | Custom OAuth2 no n8n | Contas de serviço não confiáveis para Drive pessoal pós-abril 2025 |
| Acesso Drive | Folder ID extraído via regex da URL | Suporta UX de "colar link" |
| Padrão async | Fire-and-forget webhook + Supabase Realtime | Encaixa na stack existente; zero infraestrutura extra |
| Status updates | Supabase Realtime (primário) + polling 5s (fallback) | Precedente existe em ChatScreen.jsx; `REPLICA IDENTITY FULL` obrigatório |
| Job state store | Tabela `analises` com status enum + JSONB | Concorrência baixa; Postgres como fila é adequado |
| HTML relatório | Coluna TEXT `html_relatorio` no DB | Relatórios 10–100KB; acesso em uma query; Storage adiciona complexidade sem ganho |
| n8n → Supabase | service_role key via REST PATCH | Bypassa RLS; segue padrão das Edge Functions existentes |
| Conta Google dedicada | `automacao@consultdelivery.com.br` | Consultores compartilham pastas Drive com esta conta |

---

## Table Stakes Features (v1 obrigatório)

1. Seletor de loja (por tenant) + campo link do Drive + botão "Iniciar Análise"
2. Feedback de progresso imediato — spinner com indicadores de etapa (espera 30–120s — tela em branco = usuários clicam de novo e causam jobs duplicados)
3. Resultados estruturados: 8 blocos em layout card/accordion (não JSON bruto)
4. Badge saúde geral (saudavel / atencao / critica) no topo
5. Top 5 prioridades com urgência + impacto financeiro em R$
6. Criação de tarefas no Kanban com preview modal → confirmar → tarefas aparecem automaticamente
7. Envio WhatsApp com preview da mensagem_whatsapp + confirmar
8. Histórico de análises por loja (data, badge saúde, disparado por)
9. Estado de erro com mensagem legível + botão "Tentar novamente"
10. Notificação sino no app quando análise completa (consultor pode ter navegado para outra tela)

**Diferenciadores para v2:** UI comparativo, delta KPIs, disparo em lote, export PDF, análises agendadas.

---

## Architecture Blueprint

**Schema — campos críticos da tabela `analises`:**
- `job_id` UUID (indexado, usado para filtro Realtime)
- `status` CHECK IN ('pending', 'processing', 'done', 'error')
- `resultado_json` JSONB, `html_relatorio` TEXT, `mensagem_whatsapp` TEXT, `error_message` TEXT
- `REPLICA IDENTITY FULL` obrigatório — sem ele o Supabase Realtime não filtra por colunas não-PK
- RLS via tabela `tenant_members` (segue padrão do codebase)
- Index composto `(tenant_id, status)` para query de polling

**Ciclo de vida do status:** `pending` (React INSERT) → `processing` (n8n, imediatamente ao receber webhook) → `done` / `error` (n8n após análise)

**Sequência do workflow n8n:**
```
[1] Webhook → Respond Immediately (200 + job_id)
[2] Supabase PATCH status='processing'
[3] Extrair folderId (regex: /\/folders\/([a-zA-Z0-9_-]{10,})/)
[4] Google Drive: Listar arquivos (excluir subpastas, limite 15 arquivos)
[4b] SE sem arquivos → CAMINHO DE ERRO
[5] Loop: Download imagens (binário) + exportar CSV como texto; rejeitar >5MB
[6] Code node: agregar tudo no payload de mensagens Claude (imagens como base64 + CSV como texto)
[7] HTTP Request: POST /v1/messages (claude-sonnet-4-6, max_tokens=8096, tool-use mode)
[7b] SE erro Claude → CAMINHO DE ERRO
[8] Code node: parsear resposta do tool-use
[9] Code node: gerar HTML a partir do JSON
[10] Supabase PATCH: status='done', resultado_json, html_relatorio, mensagem_whatsapp
[11] Supabase INSERT: tarefas do top-5 prioridades
[12] Evolution API: enviar WhatsApp (não-fatal — falha não bloqueia passo 10)
[CAMINHO DE ERRO] Supabase PATCH: status='error', error_message=mensagem legível
```
Configurar workflow separado de n8n Error Trigger para capturar falhas de execução não tratadas.

**Limites de responsabilidade React:**
- React é dono de: UI do formulário, INSERT na row, disparo do webhook, subscription Realtime, renderização do relatório
- n8n é dono exclusivo de: acesso ao Drive, Claude API, todos os writes no Supabase (service_role), criação de tarefas, WhatsApp
- Novos arquivos: `src/screens/AnaliseiFoodScreen.jsx`, adições em `src/lib/api.js` (`createAnalise`, `getAnalise`, `listAnalises`, `subscribeToAnalise`)

---

## Top Riscos a Mitigar

**1 — Claude retorna JSON inválido/truncado (CRÍTICO, probabilidade ALTA)**
Usar tool-use/structured output mode. Definir `max_tokens=8096`. Adicionar Code node strippando não-JSON antes de parsear. Monitorar `stop_reason`.

**2 — Timeout webhook síncrono + triggers duplicados (CRÍTICO, probabilidade ALTA)**
Nó Webhook DEVE ser "Respond: Immediately". React desabilita botão no primeiro clique. n8n IF guard verifica row existente em `processing` para o mesmo cliente.

**3 — Sem estado de erro = spinner infinito (CRÍTICO, probabilidade ALTA)**
Frontend trata todos os três estados: processing/done/error. n8n sempre escreve status='error' via Error Trigger. Job pg_cron define 'error' para rows presas em 'processing' por >5 minutos.

**4 — Acesso à pasta do Drive negado (CRÍTICO, probabilidade MÉDIA)**
Compartilhar pasta com `automacao@consultdelivery.com.br` — link público não concede acesso via API. Documentar no onboarding do consultor como passo obrigatório.

**5 — Análise presa em 'processing' após crash do n8n (ALTA, probabilidade MÉDIA)**
pg_cron ou workflow n8n agendado: define status='error' para rows em 'processing' >5 minutos. Botão de retry no frontend com mesmo job_id ou novo INSERT.

**6 — API Claude 529 sobrecarregada (ALTA, probabilidade MÉDIA)**
Habilitar "Retry on fail" no nó HTTP Request (3 tentativas, intervalo 10s). Error Trigger enfileira novamente após 30–60s. Fallback: `claude-haiku-4-5-20251001` para resultado degradado.

**7 — Instância Evolution API desconectada silenciosamente (ALTA, probabilidade MÉDIA)**
Envio WhatsApp é não-fatal. Definir flag `whatsapp_sent=false` para reenvio manual. n8n health-check pinga `/instance/connectionState` a cada 5 minutos.

---

## Build Order (sequência sugerida, ~8h total)

1. **Migration schema** (30min) — tabela `analises` + RLS + indexes + REPLICA IDENTITY FULL + publicação realtime
2. **Funções api.js** (30min) — `createAnalise`, `getAnalise`, `listAnalises`, `subscribeToAnalise`
3. **Skeleton da tela React** (1h) — só formulário, sem n8n; confirmar INSERT + RLS funciona
4. **n8n: Drive + Claude** (2h) — webhook até chamada Claude, logar resultado JSON; testar com pasta Drive real
5. **n8n: writes Supabase** (1h) — adicionar nós PATCH; confirmar Realtime dispara no React
6. **React: renderização do relatório** (1h) — spinner, iframe HTML report, Realtime + fallback polling 5s, timeout 2min
7. **n8n: Tarefas + WhatsApp** (1h) — Kanban INSERT + Evolution API (branch não-fatal)
8. **n8n: workflow de erro** (30min) — Error Trigger + cleanup pg_cron; testar com link Drive inválido
9. **React: estado de erro + retry** (30min) — exibir error_message, botão retry

---

## Questões Abertas

Antes de finalizar o escopo do roadmap:

1. **Modelo de compartilhamento do Drive** — Consultores compartilharão pastas com `automacao@consultdelivery.com.br` manualmente antes de cada análise, ou é necessário um fluxo de onboarding self-service?
2. **Destino do WhatsApp** — `mensagem_whatsapp` é enviada diretamente ao dono da loja, ou ao consultor para revisão primeiro?
3. **Limite de arquivos** — Confirmar que 15 arquivos máx por pasta Drive é aceitável como restrição v1 para documentar nos briefings de cliente
4. **Dependência schema tarefas** — INSERT de tarefas (passo 11) deve corresponder ao schema Kanban das TASK-301/302; confirmar que schema está finalizado antes de construir nós de criação de tarefas no n8n
5. **Depreciação de modelo** — `claude-sonnet-4-20250514` aposenta em 15/jun/2026 (45 dias); confirmar `claude-sonnet-4-6` aprovado como substituto em todos os agentes, não só neste módulo

---

## Avaliação de Confiança

| Área | Confiança | Notas |
|------|-----------|-------|
| Escolhas de stack | ALTA | Todas as decisões verificadas contra documentação oficial |
| Escopo de features | ALTA | Baseado em ferramentas análogas + workflow do consultor |
| Schema + arquitetura | ALTA | Segue exatamente os padrões existentes do codebase |
| Workflow n8n | MÉDIA-ALTA | Sequência verificada; nomes exatos dos campos do nó Drive dependem da versão n8n instalada — testar em staging |
| Riscos | ALTA | Todo risco crítico tem estratégia de prevenção + atribuição de fase |
| Custo | MÉDIA | ~$0,05/análise (10 screenshots ao preço Sonnet); real depende das dimensões dos screenshots |

**Geral: confiança ALTA. Sem bloqueadores desconhecidos. 5 questões abertas para Wandson antes do planejamento.**
