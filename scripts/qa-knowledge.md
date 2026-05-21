# QA Knowledge Base — Consult Delivery
# Atualizar após cada problema resolvido. Lido pelo QA Agent antes de investigar.

## Como usar
- Antes de investigar um bug: leia este arquivo para identificar padrões conhecidos
- Após resolver: adicione nova entrada no topo da seção ## Casos Resolvidos
- Padrões de teste ficam em ## Test Patterns — use-os como base para novos testes

---

## Test Patterns Padrão

### P1 — Queries Supabase com colunas inexistentes
```bash
# Detecta colunas em .select() que podem não existir na tabela
grep -rn "\.select(" src/ --include="*.jsx" --include="*.tsx" | grep -v node_modules
# Para cada tabela usada, confirmar colunas com:
# SELECT column_name FROM information_schema.columns WHERE table_name = '<tabela>';
```

### P2 — Build sem erros
```bash
npm run build 2>&1 | tail -5
# Esperado: "✓ built in"
```

### P3 — Bundle de produção atualizado
```bash
BUNDLE=$(curl -s "https://app.consultdelivery.com.br/" | grep -o '"[^"]*\.js"' | head -1 | tr -d '"')
echo "Bundle ativo: $BUNDLE"
# Comparar hash com git rev-parse HEAD para confirmar deploy do commit correto
```

### P4 — Supabase query funcional (via MCP)
```sql
-- Substituir <tabela> e <tenant_id> conforme contexto
SELECT COUNT(*) FROM <tabela>
WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
-- Esperado: > 0
```

### P5 — RLS não bloqueia acesso
```sql
-- Verificar políticas da tabela
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = '<tabela>';
-- Garantir que SELECT está coberto para tenant_members
```

---

## Casos Resolvidos

### [2026-05-20] BomDia — Grupos não carregavam em "Enviar nos grupos"
**Arquivo:** `src/screens/BomDiaScreen.jsx` linha ~444  
**Sintoma:** Painel "Enviar nos grupos" mostrava "Nenhum grupo cadastrado" apesar de 69 grupos existirem  
**Causa raiz:** `.select('id,evolution_jid,group_name,picture_url')` — `picture_url` não existe em `whatsapp_groups`  
**Fix:** Remover `picture_url` do SELECT → `.select('id,evolution_jid,group_name')`  
**Teste de regressão:**
```sql
SELECT id, evolution_jid, group_name
FROM whatsapp_groups
WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900' AND ativo = true
LIMIT 3;
-- Deve retornar >= 1 linha sem erro
```
**Lição:** Sempre validar que colunas em `.select()` existem na migration antes de fazer query. A tabela `whatsapp_groups` tem: `id, tenant_id, evolution_jid, group_name, loja_id, ativo, created_at`.

---

### [2026-05-20] BomDia — Timeout 15s ao carregar grupos (Evolution API)
**Arquivo:** `src/screens/BomDiaScreen.jsx` função `handleOpenSend`  
**Sintoma:** Grupos demoravam 15 segundos para aparecer (ou não apareciam)  
**Causa raiz:** Chamava Bridge → Evolution API `fetchAllGroups` (lenta/timeout 15s) antes do fallback Supabase  
**Fix:** Eliminar chamada ao Bridge/Evolution. Usar Supabase `whatsapp_groups` diretamente como fonte primária  
**Lição:** Evolution API `fetchAllGroups` é instável. Dados de grupos ficam no Supabase e devem ser a fonte primária de leitura.

---

## Schema Reference (tabelas críticas)

### whatsapp_groups
`id, tenant_id, evolution_jid, group_name, loja_id, ativo, created_at`  
❌ NÃO tem: `picture_url`, `jid`, `nome`, `group_jid`

### whatsapp_messages  
`id, tenant_id, conversation_id, content, sender_jid, created_at, status`

### agent_runs
`id, tenant_id, agent_id, status, output, created_at, trigger_dev_run_id`

### tenant_members
`id, tenant_id, user_id, role, created_at`

---

## Tenant ID de Produção
`consult` → `9079bd4d-4df7-4023-90fb-d79c8ba7e900`
