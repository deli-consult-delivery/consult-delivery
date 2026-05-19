# PILOTO Onda 01 — Fundação: Loja como Entidade Central

> **🔄 VERSÃO 2 — corrigida após reconhecimento (19/05/2026)**
> Substituiu DROP+CREATE por ALTER TABLE incremental.
> Trocou referências a `clientes` por `customers`.
> Adaptou nomes em inglês (`name`, `description`, `resource`, `action`).
> Reaproveita função `update_lojas_updated_at()` existente.
> Conserta bonus: bugs pré-existentes no módulo Campanhas.

---

## 📋 Contexto que mudou após reconhecimento

A Tarefa 1 (Reconhecimento) revelou:

1. **`lojas` JÁ EXISTE em produção** com 10 tabelas filhas (CASCADE quebraria tudo)
2. **`clientes` NÃO EXISTE** — usar `customers` (já existe)
3. **`roles` tem schema em inglês** (`name`, `description`, `tenant_id`, `is_system`)
4. **`role_permissions` em inglês** (`resource`, `action`)
5. **Função `update_lojas_updated_at()` já existe** (vai ser reaproveitada)
6. **Bug pré-existente Campanhas:** colunas `slug`, `tipo`, `skill_criada`, `skill_path`, `dados_skill`, `logo_url` faltam (frontend lê, banco não tem)
7. **Inconsistência `ativa` vs `ativo`** documentada como débito técnico (fora do escopo)

**Estratégia confirmada:** ALTER TABLE incremental. Zero DROP. Adiciona colunas faltantes do PILOTO + colunas faltantes do módulo Campanhas (bonus: conserta bug).

---

## 🎯 Objetivo da Onda (inalterado)

Loja como entidade central com workspace por loja e atribuição de consultores.

## 📦 O que entrega no fim desta onda

- [x] 4 migrations Supabase ALTER-only (zero DROP) — aplicadas 19/05/2026
- [x] 8 endpoints Bridge Server — implementados em bridge-server/index.js
- [x] Tela `/lojas` (lista + filtros) — src/screens/lojas/LojasListView.jsx
- [x] Modal "Nova loja" — src/screens/lojas/NovaLojaModal.jsx
- [x] Tela `/lojas/:id` (workspace 5 abas) — src/screens/lojas/LojaWorkspace.jsx
- [x] Modal "Atribuir consultor" — src/screens/lojas/AtribuirConsultorModal.jsx
- [x] Router LojasScreen + Sidebar "Lojas" entry — App.jsx + Sidebar.jsx
- [x] RBAC: papéis `consultor` e `consultor_senior` adicionados
- [x] Atribuição consultor ↔ loja
- [ ] Smoke test: criar 1 loja real, atribuir consultor, ver workspace, snapshot de métrica
- [ ] **Bonus: módulo Campanhas para de quebrar** (colunas que ele espera passam a existir)

---

## 📐 Schemas SQL — VERSÃO CORRIGIDA

### Migration 01 — ALTER `lojas` (adicionar colunas PILOTO + colunas Campanhas)

```sql
-- ============================================================
-- PILOTO Onda 01 — Migration 01
-- Data: 2026-05-19
-- Autor: Wandson via Claude Code
-- Motivo: Adicionar colunas necessárias pro PILOTO + colunas
--         faltantes do módulo Campanhas (bonus, conserta bug)
-- Risco: BAIXO (ADD COLUMN IF NOT EXISTS, zero remoção)
-- Reversão: ALTER TABLE lojas DROP COLUMN <coluna_nova>;
--           (mas só se ninguém estiver usando ainda)
-- ============================================================

BEGIN;

-- Colunas do PILOTO
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS ifood_merchant_id text,
  ADD COLUMN IF NOT EXISTS ifood_url text,
  ADD COLUMN IF NOT EXISTS segmento text,
  ADD COLUMN IF NOT EXISTS posicionamento text DEFAULT 'indefinido',
  ADD COLUMN IF NOT EXISTS ticket_medio numeric(10,2),
  ADD COLUMN IF NOT EXISTS data_inicio_consultoria date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS data_fim_consultoria date,
  ADD COLUMN IF NOT EXISTS super_restaurante boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_super_restaurante date,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Colunas do módulo Campanhas (bonus, conserta bug pré-existente)
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS skill_criada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skill_path text,
  ADD COLUMN IF NOT EXISTS dados_skill jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text;

-- Expande o CHECK do status pra aceitar valores PILOTO + legados
-- Primeiro remove o constraint atual (se existir, nome conforme convenção PG)
DO $$
DECLARE
  constraint_name_var text;
BEGIN
  SELECT conname INTO constraint_name_var
  FROM pg_constraint
  WHERE conrelid = 'lojas'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE lojas DROP CONSTRAINT %I', constraint_name_var);
  END IF;
END$$;

-- Adiciona o novo CHECK aceitando valores legados E PILOTO
ALTER TABLE lojas
  ADD CONSTRAINT lojas_status_check
  CHECK (status IN (
    'ativo','inativo','pausado',           -- legado pré-PILOTO
    'ativa',                                 -- inconsistência módulo Campanhas (manter)
    'onboarding','ativa','pausada','encerrada' -- PILOTO
  ));

-- Constraint do segmento (CHECK separado, só aplica quando NOT NULL)
ALTER TABLE lojas
  ADD CONSTRAINT lojas_segmento_check
  CHECK (segmento IS NULL OR segmento IN (
    'hamburgueria','pizzaria','japonesa','brasileira','marmita',
    'saudavel','acai','sobremesa','padaria','outro'
  ));

-- Constraint do posicionamento
ALTER TABLE lojas
  ADD CONSTRAINT lojas_posicionamento_check
  CHECK (posicionamento IN ('volume','premium','indefinido'));

-- Estado validação (length 2 quando preenchido)
ALTER TABLE lojas
  ADD CONSTRAINT lojas_estado_check
  CHECK (estado IS NULL OR length(estado) = 2);

-- Constraint UNIQUE (tenant_id, slug) — quando slug for preenchido
CREATE UNIQUE INDEX IF NOT EXISTS idx_lojas_tenant_slug_unique
  ON lojas(tenant_id, slug)
  WHERE slug IS NOT NULL;

-- Índices novos
CREATE INDEX IF NOT EXISTS idx_lojas_status ON lojas(status);
CREATE INDEX IF NOT EXISTS idx_lojas_segmento ON lojas(segmento);
CREATE INDEX IF NOT EXISTS idx_lojas_super_restaurante ON lojas(super_restaurante) WHERE super_restaurante = true;
CREATE INDEX IF NOT EXISTS idx_lojas_search ON lojas USING gin(
  to_tsvector('portuguese', nome || ' ' || coalesce(cidade,'') || ' ' || coalesce(segmento,''))
);

-- Trigger updated_at: a função update_lojas_updated_at() já existe
-- (criada em 20260506_campanhas.sql). Só criamos o trigger se não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'lojas_updated_at'
      AND tgrelid = 'lojas'::regclass
  ) THEN
    CREATE TRIGGER lojas_updated_at
      BEFORE UPDATE ON lojas
      FOR EACH ROW
      EXECUTE FUNCTION update_lojas_updated_at();
  END IF;
END$$;

COMMIT;
```

**📝 Nota sobre `client_id` vs `cliente_id`:** A coluna `client_id` já existe em `lojas` referenciando `customers(id)`. Vamos usar essa, **não criamos `cliente_id`**.

---

### Migration 02 — Tabela `loja_consultores` (NOVA, sem conflito)

```sql
-- ============================================================
-- PILOTO Onda 01 — Migration 02
-- Data: 2026-05-19
-- Motivo: Atribuição N:N entre lojas e consultores
-- Risco: BAIXO (tabela nova)
-- Reversão: DROP TABLE loja_consultores;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS loja_consultores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('principal','colaborador','observador')) DEFAULT 'colaborador',
  atribuido_em timestamptz DEFAULT now(),
  atribuido_por uuid REFERENCES auth.users(id),
  ativo boolean DEFAULT true,
  
  UNIQUE (loja_id, user_id)
);

-- Apenas 1 consultor principal por loja
CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_consultor_principal_unico
  ON loja_consultores(loja_id)
  WHERE papel = 'principal' AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_loja_consultores_user ON loja_consultores(user_id);
CREATE INDEX IF NOT EXISTS idx_loja_consultores_loja ON loja_consultores(loja_id);

ALTER TABLE loja_consultores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver atribuições do próprio tenant"
  ON loja_consultores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = loja_consultores.loja_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins gerenciam atribuições"
  ON loja_consultores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      JOIN roles r ON r.id = ur.role_id
      WHERE l.id = loja_consultores.loja_id
        AND ur.user_id = auth.uid()
        AND r.name IN ('admin','consultor_senior')
    )
  );

COMMIT;
```

---

### Migration 03 — Tabela `loja_metricas_snapshot` (NOVA, atenção ao nome)

> **⚠️ Importante:** `loja_metricas` JÁ EXISTE no banco (schema diferente). Nossa tabela é `loja_metricas_snapshot` — nome diferente, sem conflito.

```sql
-- ============================================================
-- PILOTO Onda 01 — Migration 03
-- Data: 2026-05-19
-- Motivo: Snapshots periódicos de métricas iFood por loja
-- Risco: BAIXO (tabela nova, nome distinto de loja_metricas)
-- Reversão: DROP TABLE loja_metricas_snapshot;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS loja_metricas_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  data date NOT NULL,
  
  -- Métricas iFood (manual MVP)
  pedidos_30d integer,
  pedidos_90d integer,
  avaliacoes_30d integer,
  avaliacoes_90d integer,
  nota_media numeric(3,2),
  taxa_cancelamento numeric(5,4),
  taxa_chamados numeric(5,4),
  tempo_preparo_min integer,
  tempo_loja_aberta_pct numeric(5,4),
  tempo_espera_motoboy_min integer,
  
  -- Mídia/Marketing
  invest_midia_30d numeric(10,2),
  custo_por_pedido numeric(10,2),
  
  -- Posicionamento
  ticket_medio numeric(10,2),
  posicao_categoria text,
  
  fonte text NOT NULL CHECK (fonte IN ('manual','api_ifood','print_ocr')) DEFAULT 'manual',
  capturado_por uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE (loja_id, data)
);

CREATE INDEX IF NOT EXISTS idx_metricas_snapshot_loja_data 
  ON loja_metricas_snapshot(loja_id, data DESC);

ALTER TABLE loja_metricas_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Métricas do próprio tenant"
  ON loja_metricas_snapshot FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = loja_metricas_snapshot.loja_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Editar métricas: admins e consultores atribuídos"
  ON loja_metricas_snapshot FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      JOIN roles r ON r.id = ur.role_id
      WHERE l.id = loja_metricas_snapshot.loja_id
        AND ur.user_id = auth.uid()
        AND r.name IN ('admin','consultor_senior')
    )
    OR EXISTS (
      SELECT 1 FROM loja_consultores lc
      WHERE lc.loja_id = loja_metricas_snapshot.loja_id
        AND lc.user_id = auth.uid()
        AND lc.ativo = true
    )
  );

COMMIT;
```

---

### Migration 04 — Papéis `consultor` e `consultor_senior` (CORRIGIDA para schema real)

```sql
-- ============================================================
-- PILOTO Onda 01 — Migration 04
-- Data: 2026-05-19
-- Motivo: Adicionar papéis consultor e consultor_senior
-- Risco: BAIXO (apenas INSERT, schema preservado)
-- IMPORTANTE: roles tem schema em inglês (name, description, tenant_id)
--             role_permissions usa (resource, action)
-- Reversão: 
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE name IN ('consultor','consultor_senior'));
--   DELETE FROM roles WHERE name IN ('consultor','consultor_senior');
-- ============================================================

BEGIN;

-- Roles por tenant (precisa ser feito pra CADA tenant existente)
-- IMPORTANTE: este script insere para o tenant 'consult'. Se houver outros 
-- tenants no futuro, precisa replicar.

INSERT INTO roles (id, tenant_id, name, description, is_system)
SELECT 
  gen_random_uuid(),
  t.id,
  'consultor',
  'Consultor de delivery atribuído a lojas específicas',
  false
FROM tenants t
WHERE t.slug = 'consult'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO roles (id, tenant_id, name, description, is_system)
SELECT 
  gen_random_uuid(),
  t.id,
  'consultor_senior',
  'Consultor sênior: cria lojas e gerencia atribuições',
  false
FROM tenants t
WHERE t.slug = 'consult'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Permissões do consultor
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, perms.resource, perms.action
FROM roles r
JOIN tenants t ON t.id = r.tenant_id
CROSS JOIN (VALUES
  ('lojas', 'read'),
  ('lojas', 'update'),
  ('tarefas_loja', 'read'),
  ('tarefas_loja', 'create'),
  ('tarefas_loja', 'update'),
  ('analises', 'read'),
  ('analises', 'create'),
  ('loja_metricas_snapshot', 'read'),
  ('loja_metricas_snapshot', 'create'),
  ('agent_memories', 'read'),
  ('agent_memories', 'create')
) AS perms(resource, action)
WHERE r.name = 'consultor' AND t.slug = 'consult'
ON CONFLICT DO NOTHING;

-- Permissões do consultor_senior (inclui gerenciar lojas e atribuições)
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, perms.resource, perms.action
FROM roles r
JOIN tenants t ON t.id = r.tenant_id
CROSS JOIN (VALUES
  ('lojas', 'read'),
  ('lojas', 'create'),
  ('lojas', 'update'),
  ('lojas', 'delete'),
  ('loja_consultores', 'create'),
  ('loja_consultores', 'update'),
  ('loja_consultores', 'delete'),
  ('tarefas_loja', '*'),
  ('analises', '*'),
  ('loja_metricas_snapshot', '*'),
  ('agent_memories', '*')
) AS perms(resource, action)
WHERE r.name = 'consultor_senior' AND t.slug = 'consult'
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## 🤖 PROMPT ATUALIZADO PRA COLAR NO CLAUDE CODE

**Cola este prompt (substitui o anterior) na sessão atual:**

```
Tarefa 1 validada por Wandson. Estratégia decidida: ALTER-only (zero DROP).

Doc atualizado: docs/piloto/PILOTO-01-FUNDACAO.md (v2)

PROSSIGA pra TAREFA 2: aplicar as 4 migrations corrigidas conforme o doc v2.

REGRAS:
1. Use @cd-migration-creator pra cada migration
2. ORDEM IMPORTANTE: aplica nesta ordem (Migration 01 → 02 → 03 → 04)
3. ANTES de aplicar em prod: testa em DEV
4. Mostra o SQL final de cada migration ANTES de aplicar
5. Aguarda minha aprovação migration-by-migration
6. Mostra output do `supabase db push` ou equivalente
7. Mostra `\d lojas` antes e depois de cada ALTER
8. Output bruto sempre

ESPECIAL ATENÇÃO:
- Migration 01: usa ALTER TABLE ADD COLUMN IF NOT EXISTS, não CREATE TABLE
- Migration 01: NÃO mexer em colunas existentes (nicho, plataforma, status original)
- Migration 01: novas constraints USANDO IF NOT EXISTS quando possível
- Migration 04: roles usa NAME (não slug), tenant_id obrigatório
- Migration 04: role_permissions usa resource/action (não recurso/acao)
- NÃO criar nova função update_lojas_updated_at — REAPROVEITAR a existente

NUMERAÇÃO DAS MIGRATIONS:
- Olhe a última migration aplicada e use número sequencial:
  ex: 20260519_001_alter_lojas_piloto.sql
       20260519_002_loja_consultores.sql
       20260519_003_loja_metricas_snapshot.sql
       20260519_004_roles_consultor.sql

ANTES de aplicar Migration 01 em produção, ME PERGUNTAR uma última vez 
mostrando o SQL final + o estado atual de `\d lojas`.

Começa pela Migration 01.
```

---

## ✅ Critério de aceite atualizado

- [ ] 4 migrations aplicadas em DEV + PROD com output mostrado
- [ ] `\d lojas` depois das migrations mostra: colunas legadas + colunas PILOTO + colunas Campanhas
- [ ] `roles` com 2 papéis novos (consultor, consultor_senior) e suas permissions
- [ ] **REGRESSÃO:** módulo Campanhas continua funcionando (e idealmente para de quebrar)
- [ ] **REGRESSÃO:** chat ao vivo continua
- [ ] **REGRESSÃO:** DELI continua
- [ ] **REGRESSÃO:** Outros agentes (LARA, MAX, CORA) continuam
- [ ] 8 endpoints funcionando
- [ ] Tela /lojas + workspace renderizando
- [ ] @cd-validator passa

---

## 📋 Status de todas as tarefas (19/05/2026)

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Reconhecimento — ALTER-only strategy | ✅ |
| 2 | 4 migrations Supabase | ✅ |
| 3 | 8 endpoints Bridge Server | ✅ |
| 4 | Tela /lojas (lista + filtros) | ✅ |
| 5 | Modal "Nova loja" | ✅ |
| 6 | Tela /lojas/:id workspace 5 abas | ✅ |
| 7 | Modal "Atribuir consultor" | ✅ |
| 8 | Sidebar "Lojas" + App.jsx route | ✅ |
| 9 | Documentação | ✅ |
| 10 | Smoke test E2E | ⏳ pendente |

---

## 🐛 Débitos técnicos documentados (NÃO consertar nesta onda)

| Item | Localização | Severidade |
|---|---|---|
| Inconsistência `ativa` vs `ativo` em `lojas.status` | Module Campanhas (frontend escreve 'ativa', migration default 'ativo') | Médio — não afeta PILOTO |
| Migration `20260506_campanhas.sql` foi NO-OP | Histórico | Documentar |
| Outros tenants futuros precisam replicar Migration 04 | Migration 04 só cria roles pro tenant 'consult' | Baixo |
| 10 tabelas filhas de `lojas` não têm padrão consistente de ON DELETE | Schema | Baixo |

Registrar em `RESTRUCTURE.md` como débito técnico.
