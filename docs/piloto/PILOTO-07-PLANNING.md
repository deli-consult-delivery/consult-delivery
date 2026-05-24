# Onda 07 — Loop com Cliente Real

Data: 2026-05-23  
Branch base: main (pós-validação E2E Uraka Burger)

---

## Contexto

Pós-validação E2E Uraka Burger (2026-05-23 noite). Feedbacks reais do Wandson como consultor após usar a UI:

1. Falta anexar print do ajuste feito na conclusão (registro visual)
2. Falta reabrir tarefa quando cliente não aceita o resultado
3. Falta loop de confirmação do cliente após conclusão
4. WhatsApp livre cria ambiguidade — precisa dashboard com botões

---

## Features

### F1 — Anexar print/foto na conclusão (1 dia)

**Schema:**
- Tabela nova: `tarefa_anexos` (`id uuid`, `tarefa_id fk`, `acao_id fk opcional`, `url text`, `mime_type text`, `size_bytes int`, `uploaded_by`, `created_at`)
- Supabase Storage bucket `task-attachments` com RLS por tenant

**Bridge:**
- `POST /api/tarefas/:id/anexos` — multipart upload → Supabase Storage → INSERT row
- `GET /api/tarefas/:id/anexos`
- `DELETE /api/tarefas/:id/anexos/:anexoId`

**UI:**
- `LojaWorkspace`: ao clicar "Marcar concluída", abre modal com:
  - Campo "Resultado/Observação" (texto)
  - Drag & drop ou file picker para prints (max 5 arquivos, 5 MB cada)
- `TarefaDetalhe`: mostra galeria de prints da tarefa

**WhatsApp G5:**
- Quando tarefa concluída com anexo → manda imagem pela Evolution API junto com texto (sendMedia)

---

### F2 — Reabrir tarefa (0.5 dia)

**Bridge:**
- `POST /api/tarefas/:id/reabrir`
- Body: `{ motivo: string (obrigatório), status_alvo: 'aprovada'|'em_execucao' (default 'aprovada') }`
- Valida: status atual in `('concluida','aguardando_revisao_cliente')`
- `PATCH tarefas_loja`: `status=status_alvo`, `concluida_em=NULL`, `executada_em=NULL` se `status_alvo='aprovada'`
- `INSERT tarefa_aprovacoes` `acao='reaberta'`, `nota=motivo`
- Se `analise.status='concluida'` → `PATCH` back para `'enviada_cliente'` + `concluida_em=NULL`

**UI:**
- Tarefa `status='concluida'` → botão laranja "↩ Reabrir tarefa"
- Modal: textarea obrigatório (motivo da reabertura)

---

### F3 — Confirmação do cliente pós-conclusão (1.5 dias)

**Schema:**
- Migration: adiciona `'aguardando_revisao_cliente'` ao enum `tarefa_status`

**Fluxo novo:**
- Consultor clica "Marcar concluída" → `status='aguardando_revisao_cliente'` (era `'concluida'` direto)
- WhatsApp G5 muda texto: `"✅ Tarefa pronta: <titulo>. Confirma que ficou OK? Responda OK <N> pra aprovar ou AJUSTAR <N>: <motivo> pra pedir mudança."`
- Parser WhatsApp aprende novos comandos:
  - `"OK <N>"` → `/api/tarefas/<id>/aceitar-conclusao` → `status='concluida'` definitivo
  - `"AJUSTAR <N>: <motivo>"` → endpoint que chama lógica do F2 (reabre)

**Bridge:**
- `POST /api/tarefas/:id/aceitar-conclusao` (cliente confirma → status definitivo)
- Endpoint F2 reabrir reaproveitado para AJUSTAR

**G6** só dispara quando todas as tarefas têm `status='concluida'` (definitivo, não revisão).

**UI:**
- Status `'aguardando_revisao_cliente'` tem badge amarelo "Aguardando cliente"
- Sem botão de ação para o consultor (espera cliente)

---

### F4 — Dashboard cliente público (3 dias)

**Rota:**
- `app.consultdelivery.com.br/aprovacao/:token` (standalone, sem auth)
- Token: `analises.public_token` uuid v4 gerado na criação

**Schema:**
```sql
ALTER TABLE analises ADD COLUMN public_token UUID DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE analises ADD COLUMN public_token_expires_at TIMESTAMPTZ;
-- default: created_at + 60 dias (setado no INSERT)
```

**Bridge endpoints públicos** (sem JWT, validados por token):
- `GET /api/publico/aprovacao/:token` → retorna análise + tarefas + Loom URL
- `POST /api/publico/aprovacao/:token/tarefa/:tarefaId/aceitar` (body: `obs?`)
- `POST /api/publico/aprovacao/:token/tarefa/:tarefaId/recusar` (body: `motivo`)
- `POST /api/publico/aprovacao/:token/tarefa/:tarefaId/duvida` (body: `pergunta`) → cria `internal_notification` para o consultor

**Frontend:**
- Nova rota `/aprovacao/:token` em `src/screens/publico/`
- Mobile-first, sem header da plataforma
- Lista de tarefas com 3 botões + textarea
- Quando cliente clica, mesma lógica do parser WhatsApp executa

**WhatsApp G2:**
- Mensagem inicial passa a incluir o link: `"🔗 Aprovar online (mais fácil): https://app.consultdelivery.com.br/aprovacao/<token>"`
- Cliente continua podendo responder no WhatsApp (back-compat)

---

## Worktrees paralelas sugeridas

| Worktree | Branch | Features |
|----------|--------|----------|
| worktree-1 | `feature/piloto-07-anexos` | F1 |
| worktree-2 | `feature/piloto-07-loop-revisao` | F2 + F3 (state machine + parser) |
| worktree-3 | `feature/piloto-07-dashboard-publico` | F4 |

---

## Ordem recomendada

1. **F2** (0.5 dia, baixo risco, fecha gap rápido) — pode ir imediatamente
2. **F1** (1 dia, independente) — em paralelo com F2
3. **F3** (1.5 dias, depende de parser ajustado) — após F2
4. **F4** (3 dias, maior decisão de UX) — começa depois ou em paralelo com F3

**Total estimado: ~6 dias**

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| F4: decisão de design mobile (PWA? mobile-only? responsive?) | Decidir antes de implementar — apresentar 2 opções ao Wandson |
| F3: estado novo `aguardando_revisao_cliente` confunde se UI não comunicar bem | Badge amarelo proeminente + tooltip explicativo |
| F1: Supabase Storage 1 GB free tier — custo se cliente subir muitas fotos | Compressão no frontend antes do upload; alertar se bucket > 800 MB |

---

## P0 antes de onboardar cliente real (paralelo ou pré-Onda 07)

- [ ] Tema claro quebrado (CSS title/header) — ~1h
- [ ] TD#33 (validação payload Bridge) — endurecer contrato Bridge/frontend
- [ ] TD#32 (JWT auto-renew fallback) — script `get-jwt.ps1` com refresh automático
- [ ] Confirmar UI 100% limpa pós cleanup `is_active` (apenas 1 loja: Uraka — esperado)
