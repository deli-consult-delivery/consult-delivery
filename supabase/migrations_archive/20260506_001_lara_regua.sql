-- ============================================================
-- Migration: LARA — Régua de Disparo
-- Data: 06/05/2026
-- Descrição: cria 4 tabelas para suportar a LARA (agente régua):
--   - marca_pesquisa: documento profundo de pesquisa por loja
--   - reguas: régua de 90 dias por loja
--   - campanhas: cada disparo da régua (28-40 por régua)
--   - campanha_ativos: 3 variações de legenda+mídia por campanha
-- Padrão multi-tenant com RLS por tenant_id obrigatório.
-- ============================================================

-- =====================================================
-- 1. MARCA_PESQUISA — pesquisa profunda da marca
-- =====================================================
CREATE TABLE IF NOT EXISTS marca_pesquisa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  documento_jsonb JSONB NOT NULL,
  fontes JSONB DEFAULT '[]'::jsonb,
  origem TEXT DEFAULT 'manual' CHECK (origem IN ('manual', 'nexus_pesquisa', 'mixed')),
  versao INTEGER DEFAULT 1,
  criado_por UUID REFERENCES auth.users(id),
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marca_pesquisa_loja ON marca_pesquisa(loja_id, ts DESC);
CREATE INDEX idx_marca_pesquisa_tenant ON marca_pesquisa(tenant_id);

COMMENT ON TABLE marca_pesquisa IS
  'Pesquisa profunda da marca de uma loja, gerada pela LARA + Nexus. Versionado: cada nova pesquisa cria nova linha.';
COMMENT ON COLUMN marca_pesquisa.documento_jsonb IS
  'Documento completo: identificacao, operacao, cardapio, identidade, presenca_digital, base_clientes';
COMMENT ON COLUMN marca_pesquisa.fontes IS
  'Array de URLs/origens consultadas: [{url, type, scraped_at}]';

-- =====================================================
-- 2. REGUAS — régua de 90 dias
-- =====================================================
CREATE TABLE IF NOT EXISTS reguas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  pesquisa_id UUID REFERENCES marca_pesquisa(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','revisao','aprovada','em_geracao','revisao_midias','em_execucao','concluida','cancelada')),
  cobertura_dias INTEGER NOT NULL DEFAULT 90 CHECK (cobertura_dias BETWEEN 30 AND 180),
  criada_por_agente TEXT DEFAULT 'lara',
  criada_por UUID REFERENCES auth.users(id),
  aprovada_por UUID REFERENCES auth.users(id),
  aprovada_em TIMESTAMPTZ,
  observacoes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  criada_em TIMESTAMPTZ DEFAULT NOW(),
  atualizada_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reguas_loja_status ON reguas(loja_id, status);
CREATE INDEX idx_reguas_tenant ON reguas(tenant_id);

COMMENT ON TABLE reguas IS
  'Régua de disparo de 90 dias gerada pela LARA. Estado controlado por status (rascunho -> revisao -> aprovada -> em_execucao -> concluida).';

-- =====================================================
-- 3. CAMPANHAS — cada disparo dentro da régua
-- =====================================================
CREATE TABLE IF NOT EXISTS campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  regua_id UUID NOT NULL REFERENCES reguas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  nome_campanha TEXT NOT NULL,
  estagio_funil TEXT
    CHECK (estagio_funil IN ('lead_frio','primeiro_pedido','recorrente_novo','recorrente_fiel',
                             'inativo_recente','inativo_medio','cliente_perdido','aniversariante','pesquisa_satisfacao')),
  objetivo TEXT NOT NULL CHECK (objetivo IN ('vendas','relacionamento','fidelizacao','pesquisa')),
  tipo_campanha TEXT NOT NULL CHECK (tipo_campanha IN ('gatilho_evento','disparo_continuo','disparo_unico')),
  publico_alvo TEXT NOT NULL,
  publico_excluir TEXT,
  dia_envio TEXT,
  horario_envio TEXT,
  justificativa_horario TEXT,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp_oficial','whatsapp_nao_oficial','sms','email')),
  categoria_meta TEXT CHECK (categoria_meta IN ('utility','marketing')),
  usa_cupom BOOLEAN DEFAULT FALSE,
  cupom_jsonb JSONB,
  como_criar TEXT,
  kpi_sucesso TEXT,
  status TEXT DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_midia','pronta','rejeitada','em_execucao','concluida')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (regua_id, ordem)
);

CREATE INDEX idx_campanhas_regua ON campanhas(regua_id, ordem);
CREATE INDEX idx_campanhas_status ON campanhas(status);
CREATE INDEX idx_campanhas_tenant ON campanhas(tenant_id);

COMMENT ON TABLE campanhas IS
  'Cada campanha individual dentro de uma régua. Tipicamente 25-40 campanhas por régua de 90 dias.';
COMMENT ON COLUMN campanhas.cupom_jsonb IS
  'Estrutura: {nome, tipo (percentual|valor_fixo|frete_gratis|brinde), valor, pedido_minimo, validade_dias}';

-- =====================================================
-- 4. CAMPANHA_ATIVOS — variações de legenda + mídia
-- =====================================================
CREATE TABLE IF NOT EXISTS campanha_ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  variacao INTEGER NOT NULL CHECK (variacao BETWEEN 1 AND 5),
  legenda TEXT NOT NULL,
  midia_url TEXT,
  tipo_midia TEXT CHECK (tipo_midia IN ('imagem','video','audio')),
  fonte TEXT NOT NULL DEFAULT 'nexus' CHECK (fonte IN ('nexus','upload_manual','gerado_lara','editado')),
  selecionada BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campanha_id, variacao)
);

CREATE INDEX idx_campanha_ativos_campanha ON campanha_ativos(campanha_id);
CREATE INDEX idx_campanha_ativos_selecionada ON campanha_ativos(campanha_id) WHERE selecionada = TRUE;

COMMENT ON TABLE campanha_ativos IS
  'Variações de legenda + mídia geradas pelo Nexus para cada campanha. Tipicamente 3 variações.';
COMMENT ON COLUMN campanha_ativos.selecionada IS
  'Marca qual variação a Wélida escolheu pra disparar.';

-- =====================================================
-- TRIGGERS — atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizada_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reguas_updated
  BEFORE UPDATE ON reguas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE OR REPLACE FUNCTION trg_set_updated_at_campanhas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campanhas_updated
  BEFORE UPDATE ON campanhas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_campanhas();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE marca_pesquisa  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reguas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanha_ativos ENABLE ROW LEVEL SECURITY;

-- Política: usuário só vê dados do tenant ao qual pertence (via tenant_members)
CREATE POLICY tenant_isolation_marca_pesquisa ON marca_pesquisa
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_reguas ON reguas
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_campanhas ON campanhas
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_campanha_ativos ON campanha_ativos
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Permite INSERT/UPDATE/DELETE para usuários do tenant (mantém isolamento)
CREATE POLICY tenant_write_marca_pesquisa ON marca_pesquisa
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_write_reguas ON reguas
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_write_campanhas ON campanhas
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_write_campanha_ativos ON campanha_ativos
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- =====================================================
-- AUDIT — registrar criação automática em audit_log
-- =====================================================
CREATE OR REPLACE FUNCTION trg_audit_regua()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (tenant_id, user_id, agent_name, action, resource, metadata)
  VALUES (
    NEW.tenant_id,
    NEW.criada_por,
    'lara',
    TG_OP,
    'reguas',
    jsonb_build_object('regua_id', NEW.id, 'loja_id', NEW.loja_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reguas_audit
  AFTER INSERT OR UPDATE OF status ON reguas
  FOR EACH ROW EXECUTE FUNCTION trg_audit_regua();

-- =====================================================
-- FIM da migration
-- =====================================================
