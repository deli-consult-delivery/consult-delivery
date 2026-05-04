---
created: 2026-05-04T00:00:00-03:00
title: Alinhar schemas das migrations com RESTRUCTURING_REVISED.md
area: database
files:
  - supabase/migrations/20260504_004_whatsapp.sql
  - supabase/migrations/20260504_003_memoria_central.sql
  - supabase/migrations/20260504_005_drafts_deli.sql
  - supabase/functions/evolution-webhook/index.ts
  - src/screens/ChatScreen.jsx
  - src/screens/GruposScreen.jsx
  - src/screens/DraftsPendentesScreen.jsx
  - src/lib/api.js
---

## Problem

Migrations aplicadas nas Etapas 3-5 da reestruturação usaram nomes de colunas diferentes
do documento autoritativo (RESTRUCTURING_REVISED.md Seções 6-10). Isso causa:

1. **🔴 QUEBRANDO:** edge function `evolution-webhook` falha ao gravar WhatsApp porque usa
   nomes do doc (evolution_jid, display_name, group_name, sender_contact_id, content, ts)
   mas migration criou (jid, nome, group_jid, body, media_type, created_at).
2. **🟡 DIVERGENTE:** client_facts, client_timeline, lojas, loja_metricas, agent_drafts,
   deli_triggers, deli_pending_approvals, deli_actions_log — colunas renomeadas ou faltando.

Diagnóstico completo feito na sessão de 04/05/2026 — 12 tabelas auditadas, RBAC ✅ (ok).

## Solution

Migration consolidada `[timestamp]_align_schemas_with_restructuring_revised.sql` em
`feature/schema-alignment` branch. Cobrir em 4 blocos:

A) WhatsApp (🔴 urgente): rename + add is_internal/internal_user_id/sender_contact_id
B) Memória Central: rename + add colunas faltando em lojas/client_facts/client_timeline/loja_metricas
C) Drafts: rename + add reasoning/edits_made/rejection_reason/expires_at
D) DELI: rename + type changes + status value migration

Depois: atualizar frontend (ChatScreen, GruposScreen, DraftsPendentesScreen, api.js).
Edge function já usa nomes do doc — funcionará após rename.
