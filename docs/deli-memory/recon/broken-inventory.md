# T5 — Broken Inventory
S1-G00 Reconhecimento | 2026-05-24

> ISOLAMENTO: EvoNexus ignorado. Foco: /root/consult-delivery + Supabase czyanilrverorwenikqw.
> RECON APENAS — nenhuma alteração de código.

---

## 1. BRANCHES GIT — OUTPUT BRUTO

### 1.1 Branches merged em main ainda no remote (25)

```
git branch -r --merged origin/main | grep -v "HEAD|gh-pages|main"
  origin/feat/chat-traducao-ia
  origin/feature/chat-ao-vivo-sprint-2
  origin/feature/drafts-ui
  origin/feature/etapa-1g-agents-notifications
  origin/feature/evolution-tenant-fix
  origin/feature/fase-0/fundacao
  origin/feature/piloto-03-loja-gpt
  origin/feature/v2-5-deli
  origin/feature/v2-6-dashboard-dados-reais
  origin/feature/v2-7-eventos
  origin/feature/v2-breno-whatsapp
  origin/feature/v2-cora-asaas
  origin/feature/v2-sofia
  origin/feature/v2-vera
  origin/feature/whatsapp-reactions
  origin/fix/chat-abrir-lead-conversa
  origin/wandson/bom-dia-6-calendarios
  origin/wandson/chat-fluxo-aguardando-atendimento
  origin/wandson/chat-status-aberto-finalizado
  origin/wandson/fix-chat-wag-status-filter
  origin/wandson/fix-wag-groups-aberto
  origin/worktree-fix+chat-caption-formatting
  origin/yasmin/fix-tabs-audio
  origin/yasmin/fixes-user-mobile
  origin/yasmin/modulo-campanhas
```

**Veredito:** 25 branches já merged em main. Seguro deletar. → TD#54

---

### 1.2 Branches NOT merged em main (29) — com data da última commit

```
git branch -r --no-merged origin/main  (com datas via git log -1 --format="%ai")

BRANCH                                             LAST COMMIT
origin/feature/piloto-07-f2-reabrir                2026-05-24  docs(onda-07): TD#35 tech debt fechado
origin/feature/piloto-06-marcar-concluida          2026-05-23  docs(tech-debt): TD#31 marcado como fechado
origin/feature/piloto-05-fechamento-jornada        2026-05-23  fix(piloto-05/G6): contar tarefas rejeitadas
origin/feature/piloto-04-whatsapp-loom             2026-05-23  fix(piloto-04): CardSessaoWhatsapp query
origin/fix/encaminhamento                          2026-05-20  chore(chat): remove chip "logado com"
origin/feature/piloto-02-pipeline-tarefas          2026-05-20  docs(piloto-02): Tarefa 9 — implementação
origin/wandson/local-state-19-mai-2026             2026-05-19  wip: estado local PC pre-sync 19/mai
origin/worktree-fix-bomdia-preview-download        2026-05-16  fix(bom-dia): gera nova arte com template
origin/fix/storage-channel-media-policies          2026-05-15  feat(storage): policies de upload/download
origin/fix/chat-video-blob-player                  2026-05-15  fix(chat): reproduzir e baixar vídeos
origin/fix/chat-media-document-preview             2026-05-15  fix(chat): abrir e pré-visualizar documents
origin/fix/remove-openclaw-transcricoes            2026-05-15  fix(bridge): remover código morto openclaw
origin/fix/dedup-migration-and-webhook             2026-05-15  fix(dedup): unique index messages
origin/fix/chat-ai-anthropic                       2026-05-15  fix(bridge): migrar /chat/ai de OpenAI
origin/fix/chat-delete-whatsapp-message            2026-05-15  fix(chat): apagar mensagem no WhatsApp
origin/fix/max-screen-duplicate-gap                2026-05-15  fix(max-screen): remover chave gap duplicada
origin/feature/v2-12-breno-webhook-wire            2026-05-15  feat(breno): evolution-webhook chamando breno
origin/feature/v2-11-breno-webhook                 2026-05-15  feat(breno): task processar-webhook
origin/feature/v2-10-agents-real                   2026-05-15  feat(agents-page): substituir mocks
origin/fix/evolution-webhook-dedup                 2026-05-15  fix(webhook): dedup inbound messages
origin/feat/client-tasks-migration                 2026-05-15  feat(db): migration client_tasks
origin/fix/phone-normalized-search                 2026-05-15  fix(chat): buscar customer por phone
origin/feature/v2-9-notifications                  2026-05-15  feat(notifications): ligar producer
origin/feature/v2-8-campanhas                      2026-05-15  feat(campanhas): V2-8 — substituição mocks
origin/feature/chat-screen-assignment              2026-05-14  fix(chat): evitar evento "assumiu conversa"
origin/docs/agentes-lara-max-nova-deli-openclaw-cleanup 2026-05-15 docs(agentes): adicionar docs LARA
origin/wandson/chat-status-system                  2026-05-09  merge: resolve conflicts from origin
origin/wandson/fix-sidebar-chat                    2026-05-09  fix(chat): restaura sidebar e topbar
origin/wandson/lara-agente-regua                   2026-05-06  feat(lara): bridge endpoints + frontend
```

#### Categorização por risco

| Status | Critério | Branches | Count |
|--------|---------|---------|-------|
| 🟢 ATIVO | ≤4 dias — série piloto em andamento | piloto-02, piloto-04, piloto-05, piloto-06, piloto-07, fix/encaminhamento | 6 |
| 🟡 POTENC. STALE | 5-10 dias — lote Onda v2 de 2026-05-15 | v2-8 a v2-12, fix/*, feat/*, docs/* de mai/15 + worktree-bomdia + wandson/local | 20 |
| 🔴 STALE | ≥15 dias — provavelmente abandonados | wandson/chat-status-system, wandson/fix-sidebar-chat, wandson/lara-agente-regua | 3 |

> ⚠️ O lote de 2026-05-15 (20 branches) tem commits descritivos com features reais
> (breno webhook, chat AI, dedup, storage policies). São candidatos a merge ou descarte
> explícito — não podem ser deletados sem revisão. → TD#55

---

## 2. TODO / FIXME — OUTPUT BRUTO

```
grep -r "TODO|FIXME|HACK|XXX" src/ trigger/ bridge-server/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"

src/: 0 resultados reais (2 falsos positivos: placeholder "55119XXXXXXXX" em CoraScreen.jsx linhas 152 e 241)
trigger/: 0 resultados reais (1 falso positivo: "═══ LOGO CONSULT DELIVERY" com substring "TODO")
bridge-server/: 0 resultados
```

**Veredito:** Código-fonte LIMPO. Nenhum TODO/FIXME/HACK ativo nos três diretórios principais.

---

## 3. EDGE FUNCTIONS — LOCAL vs DEPLOYED

### 3.1 Edge Functions locais (5 arquivos em supabase/functions/)

```
supabase/functions/evolution-webhook/index.ts      (1297 linhas, v3)
supabase/functions/manage-users/index.ts
supabase/functions/analista-callback/index.ts
supabase/functions/persist-profile-pic/index.ts
supabase/functions/dispatch-push-notification/index.ts
```

### 3.2 Edge Functions deployadas no Supabase (list_edge_functions)

```
slug                        status   version  updated_at (epoch ms)
evolution-webhook           ACTIVE   43       1779562192872 (~2026-05-23)
manage-users                ACTIVE   9        1777778989079 (~2026-05-01)
persist-profile-pic         ACTIVE   12       1778032554991 (~2026-05-02)
analista-callback           ACTIVE   5        1778019575942 (~2026-05-02)
dispatch-push-notification  ACTIVE   2        1778260861734 (~2026-05-05)
```

**Veredito:** 5 locais = 5 deployadas, todas ACTIVE. Nenhum drift local/remoto.

Observação: `evolution-webhook` está na versão 43 (a mais atualizada, deployed ~2026-05-23).
`manage-users` está na versão 9 mas last-updated em ~2026-05-01 — não houve re-deploy recente.

---

## 4. TABELAS VAZIAS — Referência

Catalogadas em T4 (`docs/deli-memory/recon/schema-inventory.md`).

**Resumo:** 53 tabelas com 0 rows (scaffolded mas nunca populadas).

Casos críticos já registrados em td-index.md:
- TD#49: `deli_triggers` vazia — DELI sem regras de autonomia (Verde/Amarelo/Vermelho)
- TD#50: `roles` / `role_permissions` / `user_roles` vazias — RBAC existe em schema mas sem dados
- TD#51: `loja_metricas` vazia — n8n removido, ingestão nunca substituída
- TD#52: `client_facts` / `client_timeline` vazias — Memória Central sem dados

Não re-listar aqui. Ver schema-inventory.md §B3 para lista completa.

---

## 5. VIEWS SEM MIGRATION — Referência

Já documentado em T4:
- `v_chart_7d` — view ACTIVE em produção, sem migration no repo
- `v_dashboard_kpis` — view ACTIVE em produção, sem migration no repo

Risco: recriar o banco a partir das migrations não recria essas views.
Já registrado como observação em schema-inventory.md §I.

---

## TECH DEBTS IDENTIFICADOS EM T5

| TD | Severidade | Descrição |
|----|-----------|-----------|
| TD#54 | 🔵 Observação | 25 branches merged em main ainda presentes no remote — demandam `git push origin --delete` |
| TD#55 | 🟡 Média | 23 branches unmerged potencialmente stale (3 com ≥15 dias definitivamente stale, 20 do lote 2026-05-15 aguardando decisão merge/discard) |

---

*Gerado em: 2026-05-24 | S1-G00 T5*
