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

### P6 — Cap de 1.000 linhas do PostgREST (contagens/somas erradas na UI)
```text
Sintoma: número na tela MENOR que o real (trava perto de 1.000).
Causa: PostgREST corta qualquer select de linhas em 1000 (db-max-rows).
Regra: NUNCA contar/somar buscando linhas no cliente.
  - Contagem → .select('*', { count: 'exact', head: true })
  - Soma     → filtrar no banco (ex.: .gt('cost_usd', 0)) se poucas linhas,
               ou criar RPC/view de agregação.
Verificação: comparar com SQL direto (count(*)/sum) no mesmo filtro.
```

### P7 — Grants órfãos (ex-membros com user_agent_access sem tenant_members)
```sql
-- Detectar usuários com acesso a agentes mas sem membership ativo:
SELECT au.email, uaa.agent_name, uaa.agent_id, uaa.can_invoke, uaa.can_approve_drafts
FROM auth.users au
INNER JOIN user_agent_access uaa ON uaa.user_id = au.id
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_members tm WHERE tm.user_id = au.id
)
ORDER BY au.email, uaa.agent_name;
-- Esperado: 0 linhas após migration 20260608_007 aplicada
```

### P8 — Impersonation RLS correta (padrão validado 2026-06-07)
```sql
-- CORRETO: usar SET LOCAL dentro de transação
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" TO '{"sub": "<user_uuid>", "role": "authenticated"}';
  -- query aqui — retorna apenas registros do usuário via RLS
  SELECT * FROM agent_runs;
ROLLBACK;

-- ERRADO: set_config dentro de CTE não aplica o papel — gera falso positivo de
-- "vazamento" (o SELECT roda como service_role, não como authenticated)
WITH rls_setup AS (
  SELECT set_config('role', 'authenticated', true)
)
SELECT * FROM agent_runs; -- ERRADO
```

### P9 — Vazamento de tema (data-theme no `<html>`) em superfície escopada-clara
```
# Console v2 (.cv2) é sempre claro, mas as telas LEGADO clássicas embutidas usam
# a escala --g-*/--white/--black do :root. O console clássico aplica
# data-theme="cinza"|"escuro" no <html> (App.jsx), que INVERTE essa escala.
# Como .cv2 não redefinia --g-*, a escala escura vazava para os embeds:
#   - --white vira surface escura     → "página preta"
#   - bg:#fff hardcoded + --g-900 #fff → "branco no branco" (texto invisível)
# Detecção: a tela só fica escura quando o usuário tem tema escuro salvo
# (localStorage cd-theme). Em tema claro parece OK → bug intermitente por usuário.
# Verificação no bundle de prod (deploy correto):
curl -s https://app.consultdelivery.com.br/$(curl -s https://app.consultdelivery.com.br/ | grep -o 'assets/index-[^"]*\.css' | head -1) | grep -o '\.cv2{--g-900:#111827'
# Esperado: match (override de escala clara presente)
```
Fix: redeclarar a escala light (`--g-*`, `--white`, `--black`, `*-soft` não cobertos pelo cv2) no escopo `.cv2` em `console.css`. Resolvido na sessão 27 (PR #262).

---

## Casos Resolvidos

### [2026-06-09] Console v2 — telas LEGADO pretas / branco-no-branco (vazamento de tema)
**Arquivo:** `src/console/console.css` (escopo `.cv2`)  
**Sintoma:** Wandson reportou "páginas com cores escuras, preto" e "umas que ficaram branca mas não dá pra ver as letras" em telas do Console v2 (claro).  
**Causa raiz (P9):** o console clássico salva o tema do usuário e aplica `data-theme="cinza"|"escuro"` no `document.documentElement` (`App.jsx:272-276`), o que **inverte** a escala `--g-*`/`--white`/`--black` definida no `:root` (`index.css`). O bloco `.cv2` define `--bg`/`--panel` próprios mas **não** redefinia `--g-*` → as telas clássicas (LEGADO) embutidas herdavam a escala invertida (escura). Dois sintomas, uma raiz: `--white` virava surface escura ("preto"); telas com `background:#fff` hardcoded + texto `var(--g-900)` (que virava `#FFFFFF`) ficavam branco-no-branco.  
**Fix:** redeclarar a escala light (`--g-900..--g-50`, `--white`, `--black`, `--black-soft`, `--success/warn/info-soft`) no escopo `.cv2`. **Não** sobrescrever `--red-soft` (o cv2 já o define como `#faeae8` — sobrescrever mudaria os badges nativos do cv2).  
**Teste de regressão:** build verde + grep do override no CSS de prod (ver P9). Confirmado live em `index-BcUDSZH6.css`.  
**Lição:** qualquer superfície que fixa um tema (claro) mas embute componentes que leem custom properties globais DEVE redeclarar essas properties no seu escopo — senão um `data-theme` no ancestral (`<html>`) vaza pela herança de CSS custom properties. Atributo de tema no `<html>` tem alcance global; escopo de cor precisa de reset explícito.

### [2026-06-08] FASE 2 onda 2 — Runs de sistema gravavam tenant_id = NULL
**Arquivo:** `trigger/_shared/audit.ts`  
**Sintoma:** Tasks de cron (backup, bom-dia global) logeavam `tenant_id = NULL` em `agent_runs`  
**Causa raiz:** Interface `AgentRunLog` tem `tenantId?: string` (opcional). Tasks de sistema sem contexto de tenant simplesmente não passavam o campo → `tenantId ?? null`.  
**Fix (P-2, feat/seguranca-s1):** Adicionar `CONSULT_TENANT_ID = '9079...'` como constante; trocar `?? null` por `?? CONSULT_TENANT_ID`. Nenhuma task individual precisou ser alterada — o default centralizado cobre tudo.  
**Migration:** `20260608_005_p2_agent_runs_not_null.sql` — backfill final + SET NOT NULL + DROP POLICY `authenticated_view_global_runs`.  
**Teste de regressão:**
```sql
-- Após migration: esperado 0
SELECT count(*) FROM public.agent_runs WHERE tenant_id IS NULL;
-- Policy já não deve existir: esperado 0
SELECT count(*) FROM pg_policies
 WHERE tablename = 'agent_runs' AND policyname = 'authenticated_view_global_runs';
```
**Lição:** Toda função de audit que grava em tabela multi-tenant DEVE ter um fallback explícito para o tenant padrão — nunca `?? null`. Sistemas de sistema (cron, backup) sempre caem sob o tenant consult.

---

### [2026-06-08] FASE 2 onda 2 — usePermissions indexava por agent_name legado
**Arquivo:** `src/hooks/usePermissions.js`  
**Sintoma:** Callers usando agent_id canônico (ex: `canInvokeAgent('analise-ifood')`) recebiam `false` mesmo com grant ativo, porque o mapa era construído apenas por `agent_name` (ex: `'analista-ifood'`).  
**Causa raiz:** Onda 1 adicionou `agent_id` na tabela mas o hook só selecionava `agent_name` e indexava por ele.  
**Fix (P-3, feat/seguranca-s2):** Adicionar `agent_id` ao `.select()`; construir `agentMap` indexado por AMBOS `agent_id` e `agent_name`. Backward compat garantido.  
**Migration:** `20260608_006_p3_user_agent_access_contract.sql` — NOT NULL em `tenant_id`/`agent_id` + UNIQUE `(tenant_id, user_id, agent_id)`.  
**Teste de regressão:**
```sql
-- Verificar que todas as linhas têm agent_id preenchido: esperado 0
SELECT count(*) FROM public.user_agent_access WHERE agent_id IS NULL;
-- Unique constraint deve existir:
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.user_agent_access'::regclass AND contype = 'u';
```

---

### [2026-06-08] FASE 2 onda 2 — Grants órfãos de ex-membros (Eduardo + Wellida)
**Tabela:** `public.user_agent_access`  
**Sintoma:** Eduardo e Wellida (removidos de `tenant_members` em jun/2026) ainda tinham grants ativos: Eduardo em `analise-ifood`; Wellida em `analise-ifood` e `lara` (com `can_approve_drafts=true`).  
**Fix (P-5, feat/seguranca-s3):** Migration `20260608_007_p5_revoke_orphan_grants.sql` — DELETE por user_id.  
**Teste de regressão:** usar P7 (query de grants órfãos acima). Esperado: 0 linhas.  
**Lição:** Remoção de membro do `tenant_members` NÃO cascateia em `user_agent_access`. Adicionar ON DELETE CASCADE ou trigger em futura onda.

---

### [2026-06-07] Console v2 — KPIs da Visão Geral não batiam com o banco
**Arquivo:** `src/console/ConsoleV2.jsx` (hook `useKpisReais`)  
**Sintoma:** Tela mostrava ~1.000 execuções; SQL direto retornava 1.704  
**Causa raiz:** padrão P6 — select de linhas + soma no cliente sofre o cap de 1.000 do PostgREST. RLS foi descartada por impersonação (`set local role authenticated` + jwt do usuário → via 1.704)  
**Fix (#173):** counts exatos (`count: 'exact', head: true`) para total/ok; custo busca apenas `cost_usd > 0` (7 linhas)  
**Teste de regressão:**
```sql
SELECT count(*),
       count(*) FILTER (WHERE status IN ('ok','completed','success')),
       COALESCE(sum(cost_usd),0)
FROM agent_runs
WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
  AND created_at >= now() - interval '30 days';
-- Comparar com os 3 KPIs da Visão Geral (devem ser idênticos)
```
**Lição:** agregação SEMPRE no banco. Atenção extra: testes de impersonação RLS exigem `BEGIN; SET LOCAL role ...; SET LOCAL request.jwt.claims ...;` — o truque de `set_config` dentro de CTE NÃO aplica o papel (gera falso positivo de vazamento).

---

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

## Advisors Abertos (não cobertas por esta frente)

| Tabela | Advisor | Observação |
|---|---|---|
| `customer_group_members` | rls_enabled_no_policy | RLS ativo sem policies — acesso bloqueado para authenticated |
| `customer_groups` | rls_enabled_no_policy | Idem |
| `tarefas_analise` | rls_enabled_no_policy | Idem |

Ação: criar policies ou desabilitar RLS se a tabela não é acessada por usuários authenticated. Incluir em frente separada.

---

## Schema Reference (tabelas críticas)

### whatsapp_groups
`id, tenant_id, evolution_jid, group_name, loja_id, ativo, created_at`  
❌ NÃO tem: `picture_url`, `jid`, `nome`, `group_jid`

### whatsapp_messages  
`id, tenant_id, conversation_id, content, sender_jid, created_at, status`

### agent_runs (após P-2)
`id, tenant_id NOT NULL, agent_id, status, output, created_at, trigger_dev_run_id`  
Policies: `service_role_manage_runs`, `tenant_members_view_own_runs`  
(authenticated_view_global_runs removida em 20260608_005)

### tenant_members
`id, tenant_id, user_id, role, created_at`

### user_agent_access (após P-3)
`user_id, agent_name, can_invoke, can_view_history, can_approve_drafts, tenant_id NOT NULL, agent_id NOT NULL`  
UNIQUE: `(tenant_id, user_id, agent_id)` | PK legada: `(user_id, agent_name)`

### tenant_agent_config (criada 20260512_004)
`tenant_id, agent_id, modo_override, enabled, config jsonb`  
PK: `(tenant_id, agent_id)` | Leitura via helper `getTenantAgentConfig(tenantId, agentId)`

### defesa_casos (criada 2026-06-07, migration 20260607_006)
`id, tenant_id, loja_id, canal, tipo, pedido_ref, valor_centavos, motivo, analise, draft_resposta, status, resultado_valor_centavos, criado_por_agente, aprovado_por, aprovado_em, enviado_em, created_at, updated_at`  
Estados: `rascunho → aguardando_ok → aprovado → enviado → ganho|perdido` (ou `descartado`). Sem DELETE por RLS.

### defesa_aprovadores (criada 2026-06-07)
`id, tenant_id, user_id, ativo, criado_em`  
Policies: select, insert, update, delete (4 completas) ✓

### defesa_assinaturas (criada 2026-06-07)
`id, tenant_id, caso_id, aprovador_id, assinado_em, ...`  
Policies: select, insert_admin (2) — UPDATE/DELETE intencionalmente ausentes (assinaturas são imutáveis).

### estudio_criacoes (criada 2026-06-08)
`id, tenant_id, ...`  
Policies: select, insert, update (3) ✓

---

## Tenant ID de Produção
`consult` → `9079bd4d-4df7-4023-90fb-d79c8ba7e900`
