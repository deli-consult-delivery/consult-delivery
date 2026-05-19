# PILOTO Onda 01 — Fundação: Loja como Entidade

**Duração estimada:** 1 semana
**Pré-requisitos:**
- Branch `main` limpa
- Subagents `cd-*` instalados
- Tabela `agent_memories` existente (verificar)
- RBAC schema existente (`roles`, `user_roles`, `role_permissions`, `user_agent_access`)

---

## 🎯 Objetivo da Onda

Transformar "Loja" em entidade central da plataforma. Cada cliente de consultoria tem 1 ou mais Lojas (cada loja = 1 unidade iFood). Cada Loja tem 1 consultor principal + N colaboradores. Workspace por loja: tela única com tudo da loja.

## 📦 O que entrega no fim desta onda

- [ ] 3-4 migrations Supabase aplicadas (lojas, loja_metricas_snapshot, loja_consultores)
- [ ] 6-8 endpoints no Bridge Server
- [ ] Tela `/lojas` (lista + filtros)
- [ ] Tela `/lojas/:id` (workspace da loja com 5 abas)
- [ ] RBAC: papéis `consultor` e `consultor_senior` adicionados
- [ ] Atribuição consultor ↔ loja
- [ ] Smoke test: criar 1 loja real, atribuir consultor, ver workspace

## 📐 Schemas SQL (revisar ANTES de aprovar)

### Migration 01 — Tabela `lojas`

```sql
-- Cabeçalho obrigatório (cd-migration-creator garante)
-- Data: 2026-05-14
-- Autor: cd-task-creator via Wandson
-- Motivo: PILOTO Onda 01 — Loja como entidade central
-- Risco: baixo (nova tabela, sem mexer em existentes)
-- Reversão: DROP TABLE lojas; (preserva agent_memories existente)

BEGIN;

CREATE TABLE IF NOT EXISTS lojas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  
  -- Identificação
  nome text NOT NULL,
  slug text NOT NULL,
  ifood_merchant_id text,
  ifood_url text,
  cidade text,
  estado text CHECK (length(estado) = 2),
  segmento text CHECK (segmento IN ('hamburgueria','pizzaria','japonesa','brasileira','marmita','saudavel','acai','sobremesa','padaria','outro')),
  
  -- Posicionamento
  posicionamento text CHECK (posicionamento IN ('volume','premium','indefinido')) DEFAULT 'indefinido',
  ticket_medio numeric(10,2),
  
  -- Estado da consultoria
  status text NOT NULL CHECK (status IN ('onboarding','ativa','pausada','encerrada')) DEFAULT 'onboarding',
  data_inicio_consultoria date DEFAULT CURRENT_DATE,
  data_fim_consultoria date,
  
  -- Selo Super Restaurante
  super_restaurante boolean DEFAULT false,
  data_super_restaurante date,
  
  -- Metadados
  observacoes text,
  tags text[] DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_lojas_tenant ON lojas(tenant_id);
CREATE INDEX idx_lojas_cliente ON lojas(cliente_id);
CREATE INDEX idx_lojas_status ON lojas(status);
CREATE INDEX idx_lojas_segmento ON lojas(segmento);
CREATE INDEX idx_lojas_search ON lojas USING gin(to_tsvector('portuguese', nome || ' ' || coalesce(cidade,'')));

-- RLS
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lojas visíveis para o próprio tenant"
  ON lojas FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins editam lojas do tenant"
  ON lojas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = lojas.tenant_id
        AND r.slug IN ('admin','consultor_senior')
    )
  );

CREATE POLICY "Consultores editam lojas atribuídas"
  ON lojas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM loja_consultores lc
      WHERE lc.loja_id = lojas.id
        AND lc.user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_lojas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lojas_updated_at
  BEFORE UPDATE ON lojas
  FOR EACH ROW
  EXECUTE FUNCTION update_lojas_updated_at();

COMMIT;
```

### Migration 02 — Tabela `loja_consultores` (atribuição N:N)

```sql
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

-- Apenas 1 consultor principal por loja (constraint)
CREATE UNIQUE INDEX idx_loja_consultor_principal_unico
  ON loja_consultores(loja_id)
  WHERE papel = 'principal' AND ativo = true;

CREATE INDEX idx_loja_consultores_user ON loja_consultores(user_id);
CREATE INDEX idx_loja_consultores_loja ON loja_consultores(loja_id);

-- RLS
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
        AND r.slug IN ('admin','consultor_senior')
    )
  );

COMMIT;
```

### Migration 03 — Tabela `loja_metricas_snapshot`

```sql
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
  taxa_cancelamento numeric(5,4), -- 0.04 = 4%
  taxa_chamados numeric(5,4),
  tempo_preparo_min integer,
  tempo_loja_aberta_pct numeric(5,4), -- 0.25 = 25%
  tempo_espera_motoboy_min integer,
  
  -- Mídia/Marketing
  invest_midia_30d numeric(10,2),
  custo_por_pedido numeric(10,2),
  
  -- Posicionamento
  ticket_medio numeric(10,2),
  posicao_categoria text,
  
  -- Origem do dado
  fonte text NOT NULL CHECK (fonte IN ('manual','api_ifood','print_ocr')) DEFAULT 'manual',
  capturado_por uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE (loja_id, data)
);

CREATE INDEX idx_metricas_loja_data ON loja_metricas_snapshot(loja_id, data DESC);

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
        AND r.slug IN ('admin','consultor_senior')
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

### Migration 04 — Papéis novos no RBAC

```sql
BEGIN;

INSERT INTO roles (id, slug, nome, descricao, created_at)
VALUES 
  (gen_random_uuid(), 'consultor', 'Consultor', 'Consultor de delivery atribuído a lojas específicas', now()),
  (gen_random_uuid(), 'consultor_senior', 'Consultor Sênior', 'Consultor sênior com permissão pra criar lojas e atribuir colaboradores', now())
ON CONFLICT (slug) DO NOTHING;

-- Permissões base do consultor
INSERT INTO role_permissions (role_id, recurso, acao)
SELECT r.id, recurso, acao
FROM roles r
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
) AS perms(recurso, acao)
WHERE r.slug = 'consultor'
ON CONFLICT DO NOTHING;

-- Consultor sênior herda + admin de lojas
INSERT INTO role_permissions (role_id, recurso, acao)
SELECT r.id, recurso, acao
FROM roles r
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
) AS perms(recurso, acao)
WHERE r.slug = 'consultor_senior'
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## 🤖 PROMPT PRA COLAR NO CLAUDE CODE

**Antes de colar:**

```powershell
cd "C:\Users\Consult Delivery\consult-delivery"
git checkout main
git pull
git checkout -b feature/piloto-01-fundacao
claude
```

**Cola tudo abaixo, dentro do bloco de código triplo crase:**

```
# PILOTO Onda 01 — FUNDAÇÃO: Loja como Entidade Central

## OBJETIVO
Construir a base do produto PILOTO: tornar "Loja" entidade central, com 
workspace por loja e atribuição de consultores. Fundação pra ondas 02-04.

## CONTEXTO
- Doc autoritativo: docs/piloto/PILOTO-00-ROADMAP.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- Branch: feature/piloto-01-fundacao
- Migrations existentes preservadas (nada quebra)
- Decisões: 3-5 consultores; Loja-GPT compartilhado (vem na Onda 03)
- Tenant principal: consult (slug=consult)

## REGRAS NÃO-NEGOCIÁVEIS

1. Output bruto sempre. Antes de declarar tarefa pronta:
   - SQL real executado (não apenas escrito)
   - JSON real de endpoints (não mockup)
   - Print/output do componente renderizado
2. ME PERGUNTAR ao terminar cada tarefa antes de avançar
3. Use @cd-migration-creator pras 4 migrations
4. Use @cd-task-creator se criar tasks Trigger.dev (NÃO previsto nesta onda)
5. Antes de mergear: @cd-validator obrigatório
6. NÃO mexer em features V2 anteriores (CORA, BRENO, etc)
7. NÃO mexer em chat ao vivo
8. NÃO criar tabelas alternativas que conflitem com schema existente — 
   ANTES de criar, ler migration anterior e confirmar não-conflito

## TAREFAS

### Tarefa 1 — Reconhecimento (30 min)
Antes de criar qualquer coisa nova:
1. Lista TODAS as migrations existentes em supabase/migrations/
2. Verifica se há tabela `clientes` (precisamos referenciar)
3. Verifica se há tabela `tarefas` ou `tasks` (vamos criar `tarefas_loja` 
   na Onda 02, não pode conflitar)
4. Verifica se há tabela `lojas` ou similar (não pode duplicar)
5. Lê schema atual de roles, user_roles, role_permissions
6. Lê schema de agent_memories (vai ser consumido em Onda 03)
7. Apresenta resumo do estado atual e confirma que não há conflitos

ME PERGUNTAR antes de criar qualquer migration.

### Tarefa 2 — 4 migrations (use @cd-migration-creator)
Conforme docs/piloto/PILOTO-01-FUNDACAO.md seção "Schemas SQL":

2.1. NNNN_create_lojas.sql (Migration 01 do doc)
2.2. NNNN_create_loja_consultores.sql (Migration 02)
2.3. NNNN_create_loja_metricas_snapshot.sql (Migration 03)
2.4. NNNN_insert_roles_consultor.sql (Migration 04)

REGRAS:
- Cabeçalho obrigatório (cd-migration-creator garante)
- Numeração sequencial conforme as anteriores
- BEGIN/COMMIT explícitos
- RLS em todas as tabelas (já incluído nos schemas)
- ON DELETE explícito (cascade, set null conforme spec)
- Testar PRIMEIRO em ambiente DEV antes de prod

Antes de aplicar:
- Mostre o SQL final de cada migration
- Aguarde minha aprovação
- Aplique em DEV
- Mostre output do supabase db push ou equivalente
- Mostre as tabelas criadas via \d lojas no psql

### Tarefa 3 — Endpoints Bridge Server

Em /root/consult-delivery/bridge-server/ (ou pasta correspondente do código):

3.1. GET    /api/lojas?status=&consultor=&search=    listagem com filtros
3.2. GET    /api/lojas/:id                            workspace completo
3.3. POST   /api/lojas                                criar loja
3.4. PATCH  /api/lojas/:id                            editar loja
3.5. DELETE /api/lojas/:id                            soft delete (status=encerrada)
3.6. POST   /api/lojas/:id/consultores                atribuir consultor
3.7. DELETE /api/lojas/:id/consultores/:user_id       desatribuir
3.8. POST   /api/lojas/:id/metricas                   inserir snapshot manual

Cada endpoint:
- Valida JWT (padrão existente)
- Verifica RBAC (papel + tenant + atribuição)
- Validação Zod input/output
- Audit log (action: lojas_*)
- Retorno JSON consistente
- Tratamento de erro padrão

Testes: dispara cada endpoint via curl com token real. Documente:
- Request
- Response
- Status code

### Tarefa 4 — Tela /lojas (lista)

Frontend React + Tailwind:
- Header com filtros: status (chips), consultor (dropdown), segmento, busca
- Tabela responsiva ou grid de cards
- Cada card mostra: nome, cidade, status badge, consultor principal, 
  data início, indicadores (tem Super Restaurante?, ticket médio)
- Botão "Nova loja" → modal
- Click no card → /lojas/:id

Componentes existentes:
- Reaproveitar Layout principal
- Reaproveitar Modal genérico
- Reaproveitar Badge, Card
- Seguir padrão visual do projeto (verificar src/components/)

### Tarefa 5 — Modal "Nova loja"

Campos:
- Nome (text, obrigatório)
- Slug (auto gerado, editável)
- Cliente relacionado (autocomplete em clientes, opcional)
- iFood URL (text, validação básica)
- iFood Merchant ID (text)
- Cidade + Estado (UF select)
- Segmento (select)
- Posicionamento (radio: volume / premium / indefinido)
- Data início consultoria (date picker)
- Observações (textarea)

Validação Zod no frontend e backend.

### Tarefa 6 — Tela /lojas/:id (workspace)

Layout: sidebar lateral + área principal com 5 abas.

Sidebar (sticky):
- Avatar/logo da loja
- Nome + cidade
- Status badge
- Botão "Editar dados"
- Consultor principal (avatar + nome)
- Colaboradores (lista)
- Botão "+ Adicionar colaborador" (abre modal)

Área principal — 5 abas:
1. **Visão geral** — métricas resumidas, próximas tarefas (placeholder Onda 02), atividades recentes
2. **Métricas** — gráficos das colunas de loja_metricas_snapshot, botão "Atualizar métricas" (modal de input manual)
3. **Tarefas** — placeholder "Disponível na Onda 02"
4. **Análises** — placeholder "Disponível na Onda 04 (Loom→Relatório)"
5. **IA Especialista** — placeholder "Disponível na Onda 03 (Loja-GPT)"

Aba "Métricas" é a única funcional nesta onda. Modal de input:
- Data (date picker, padrão hoje)
- 12 campos numéricos (pedidos, avaliações, taxa cancelamento, etc)
- Validação Zod
- Salva via POST /api/lojas/:id/metricas

### Tarefa 7 — Atribuir consultor (modal "+ Adicionar colaborador")

Modal:
- Select de usuário (busca em auth.users do mesmo tenant)
- Select de papel (principal | colaborador | observador)
- Botão "Atribuir"

Regra: só 1 consultor `principal` ativo por loja. Se já houver e tentar 
criar outro, sistema avisa e oferece "trocar principal" ou cancelar.

### Tarefa 8 — Sidebar global da plataforma

Adicionar item de menu "Lojas" no sidebar global, com ícone (lucide-react: 
Store). Reordenar conforme RESTRUCTURE.md (admin + operação + agentes + 
dados). "Lojas" entra em "OPERAÇÃO".

### Tarefa 9 — Documentação

- docs/piloto/PILOTO-01-FUNDACAO-IMPLEMENTACAO.md (o que foi feito)
- Atualizar RESTRUCTURE.md mencionando lojas como entidade central
- Atualizar CLAUDE.md se padrão novo emergir

### Tarefa 10 — Smoke test E2E

Manual no ambiente local + produção:

1. Login como admin (Wandson)
2. Cria loja "Pizzaria Teste PILOTO" (segmento pizzaria, posicionamento volume)
3. Atribui Wandson como consultor principal
4. Atribui um segundo usuário como colaborador
5. Abre /lojas/<id> → workspace renderiza
6. Aba Métricas: input dados manuais (pedidos=45, cancelamento=0.03, etc)
7. Confere snapshot salvo via SQL: SELECT * FROM loja_metricas_snapshot
8. Logout
9. Login como consultor (segundo usuário)
10. Verifica que vê APENAS a loja em que está atribuído
11. Tenta editar loja em que NÃO está atribuído → bloqueado (RLS)

Documentar output bruto de cada passo.

## CRITÉRIO DE ACEITE FINAL

- [ ] Tarefa 1: reconhecimento completo, sem conflitos detectados
- [ ] 4 migrations aplicadas (DEV + PROD)
- [ ] 8 endpoints funcionando (curl test)
- [ ] Tela /lojas lista lojas com filtros funcionais
- [ ] Modal "Nova loja" cria loja com sucesso
- [ ] Tela /lojas/:id renderiza workspace com 5 abas
- [ ] Aba "Métricas" insere e exibe snapshots
- [ ] Atribuição de consultor funciona (principal + colaborador)
- [ ] RLS bloqueando consultor de ver loja não-atribuída (smoke test 11)
- [ ] Sidebar global mostra "Lojas" em OPERAÇÃO
- [ ] Documentação atualizada
- [ ] @cd-validator passa com VEREDITO ✅ ou ⚠️ aceitável
- [ ] Sem regressão: chat ao vivo continua, DELI continua, demais agentes intactos

## RESTRIÇÕES IMPORTANTES

- Branch dedicada: feature/piloto-01-fundacao
- NÃO commitar credenciais
- NÃO mexer em outras features V2
- NÃO mexer em chat ao vivo
- Multi-tenant rigoroso: nada vaza entre tenants
- Audit log em CRUD de lojas e atribuições
- Todos os componentes React seguem o design system existente

## USO DOS SUBAGENTS

- @cd-migration-creator: cada uma das 4 migrations
- @cd-validator: gate final antes do PR

## OUTPUT BRUTO SEMPRE

Pra cada tarefa concluída:
- Comandos executados
- Output bruto (não resumo)
- Screenshots quando aplicável
- SQL real, não pseudo-SQL

Começar pela Tarefa 1 (reconhecimento). 
ME PERGUNTAR ao terminar cada tarefa.
```

---

## ✅ Critério de aceite (checklist Wandson)

Antes de mergear a PR `feature/piloto-01-fundacao`:

- [ ] 4 migrations aplicadas em DEV + PROD com output mostrado
- [ ] Curl test de cada um dos 8 endpoints (status 200/201)
- [ ] Tela /lojas funcional, com 2-3 lojas reais cadastradas
- [ ] Workspace renderiza pra cada loja
- [ ] Snapshot de métricas inserido e visível
- [ ] Smoke test E2E completo (todos os 11 passos)
- [ ] RLS testado: consultor B não vê loja A
- [ ] @cd-validator passa
- [ ] Chat ao vivo continua funcionando (regressão)
- [ ] PR aberta com descrição completa + screenshots

## 📊 Estimativa detalhada

| Tarefa | Tempo |
|---|---|
| 1. Reconhecimento | 30min |
| 2. 4 migrations | 4-6h |
| 3. 8 endpoints | 1-2 dias |
| 4. Tela /lojas | 4-6h |
| 5. Modal nova loja | 2-3h |
| 6. Workspace 5 abas | 1 dia |
| 7. Atribuir consultor | 2h |
| 8. Sidebar | 1h |
| 9. Docs | 1-2h |
| 10. Smoke test E2E | 4h |

**Total: 5-7 dias úteis** (1 semana)

## 🚨 O que FAZER se algo der errado

- **Migration falha em prod**: rollback imediato (script de reversão no cabeçalho)
- **Endpoint quebra outra feature**: revert da branch, isolar mudança
- **Tela renderiza errado**: console + network do browser; mostrar erro real
- **RLS bloqueia admin**: revisar policies, testar com `SET ROLE`

## ➡️ Quando esta onda fechar

Quando todos os checklist passarem:
1. `git push`
2. PR no GitHub com descrição completa
3. Code review (mesmo solo: leia o diff)
4. Merge na main
5. **Avisa aqui** que terminou
6. Eu te entrego PILOTO-02-PIPELINE-TAREFAS para começar a Onda 02

NÃO disparar Onda 02 antes da 01 estar mergeada.
