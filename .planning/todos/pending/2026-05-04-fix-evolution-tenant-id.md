---
created: 2026-05-04T22:00:00-03:00
title: Fix tenant_id em evolution_instances para webhook gravar whatsapp_messages
area: database
files:
  - supabase/migrations/20260504_007_add_tenant_id_to_evolution_instances.sql
  - supabase/functions/evolution-webhook/index.ts
---

## Problem

A tabela `evolution_instances` não possui coluna `tenant_id`. A edge function
`evolution-webhook` faz `.select('id, tenant_id, ...)` nessa tabela — quando
a coluna não existe, PostgREST retorna erro → `instErr` é setado → função
retorna antes de gravar em `whatsapp_messages` e `whatsapp_contacts`.

Resultado: webhook funcionando (HTTP 200), Evolution disparando, mas
`whatsapp_messages` permanece vazio. Diagnóstico feito em 04/05/2026.

## Solution

Migration `20260504_007` já criada no branch `feature/evolution-tenant-fix`:
- ADD COLUMN tenant_id UUID REFERENCES tenants(id)
- Backfill: instâncias existentes → tenant Consult Delivery (slug='consult')
- NOT NULL após backfill
- RLS: user_roles JOIN roles → tenant_id
- apply_migration via Supabase MCP, aguarda aprovação do Wandson
