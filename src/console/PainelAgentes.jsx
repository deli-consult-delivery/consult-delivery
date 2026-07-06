import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// T2 · Painel de Agentes v2 (GAP-1 + GAP-2)
// GAP-1: toggle enable/disable agente por tenant (tenant_agents)
// GAP-2: config por agente (custom_prompt, custom_model, cost limits)
// Fonte: agents (catálogo global) + tenant_agents + agent_runs (30d)
// P6: limit(1000) em agent_runs — agregação client-side
// ============================================================

const MODO_LABELS = { automatico: 'Automático', revisao: 'Revisão', desativado: 'Desativado' };

const MODELOS_DISPONIVEIS = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'gemini-2.0-flash',
];

function BdgStatus({ ativo }) {
  return (
    <span className={`cv2-bdg ${ativo ? 'ok' : 'mut'}`} style={{ fontSize: 11 }}>
      {ativo ? 'ATIVO' : 'INATIVO'}
    </span>
  );
}

function ToggleBtn({ ativo, loading, onClick }) {
  return (
    <button
      className={`cv2-btn${ativo ? ' danger' : ''}`}
      style={{ minWidth: 88, fontSize: 12 }}
      disabled={loading}
      onClick={onClick}
    >
      {loading ? '...' : ativo ? 'Desativar' : 'Ativar'}
    </button>
  );
}

function ConfigPanel({ agente, config, onSave, saving }) {
  const [prompt, setPrompt] = useState(config?.custom_prompt ?? agente.custom_prompt ?? '');
  const [modelo, setModelo] = useState(config?.custom_model ?? agente.custom_model ?? '');
  const [maxTokens, setMaxTokens] = useState(config?.custom_max_tokens ?? agente.custom_max_tokens ?? '');
  const dirty = prompt !== (config?.custom_prompt ?? agente.custom_prompt ?? '')
    || modelo !== (config?.custom_model ?? agente.custom_model ?? '')
    || String(maxTokens) !== String(config?.custom_max_tokens ?? agente.custom_max_tokens ?? '');

  return (
    <div style={{ padding: '14px 0 4px', borderTop: '1px solid var(--line)', marginTop: 10 }}>
      <div className="cv2-sub" style={{ marginBottom: 10 }}>Configuracao deste agente para este workspace</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11.5, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
            MODELO (deixe em branco para usar o padrao do agente · <b>{agente.custom_model || 'padrao'}</b>)
          </label>
          <select
            value={modelo}
            onChange={e => setModelo(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 12.5, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}
          >
            <option value="">-- padrao do agente --</option>
            {MODELOS_DISPONIVEIS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11.5, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
            MAX TOKENS (0 = padrao · padrao do agente: <b>{agente.custom_max_tokens || '—'}</b>)
          </label>
          <input
            type="number"
            min={0}
            max={128000}
            value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)}
            placeholder={String(agente.custom_max_tokens || '')}
            style={{ width: 120, fontFamily: 'inherit', fontSize: 12.5, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11.5, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
            PROMPT PERSONALIZADO (vazio = usa prompt base do agente)
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={6}
            placeholder={agente.custom_prompt ? `Prompt base (${agente.custom_prompt.length} chars)` : 'Nenhum prompt base definido'}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 12, padding: 8, border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical', background: 'var(--bg)', color: 'var(--ink)' }}
          />
        </div>
        <div>
          <button
            className="cv2-btn"
            disabled={saving || !dirty}
            onClick={() => onSave({ custom_prompt: prompt || null, custom_model: modelo || null, custom_max_tokens: maxTokens ? Number(maxTokens) : null })}
          >
            {saving ? 'Salvando...' : dirty ? 'Salvar configuracao' : 'Salvo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PainelAgentes({ tenantDbId }) {
  const [agentes, setAgentes] = useState(null);
  const [ativos, setAtivos] = useState({}); // agentId -> bool
  const [configs, setConfigs] = useState({}); // agentId -> row tenant_agent_config (se existir)
  const [runs30d, setRuns30d] = useState({}); // agentId -> { runs, custo }
  const [expandido, setExpandido] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [saving, setSaving] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    try {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const [
        { data: ag, error: e1 },
        { data: ta, error: e2 },
        { data: tac, error: e4 },
        { data: runs, error: e3 },
      ] = await Promise.all([
        supabase.from('agents').select('id, name, role, letter, color, description, is_active, category, default_modo, custom_model, custom_max_tokens, custom_prompt').order('name'),
        supabase.from('tenant_agents').select('agent_id').eq('tenant_id', tenantDbId),
        // fonte canônica de config: tenant_agent_config (docs/decisions/gap2-unificacao-config.md)
        supabase.from('tenant_agent_config').select('agent_id, config').eq('tenant_id', tenantDbId),
        supabase.from('agent_runs').select('agent_id, cost_usd, status').eq('tenant_id', tenantDbId).gte('created_at', desde).limit(1000),
      ]);
      if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4);

      // mapa ativo (habilitação vem de tenant_agents; config vem de tenant_agent_config)
      const ativoMap = {};
      for (const row of (ta ?? [])) ativoMap[row.agent_id] = true;
      const configMap = {};
      for (const row of (tac ?? [])) {
        if (row.config) configMap[row.agent_id] = row.config;
      }

      // agregação runs 30d client-side (P6 cumprido: limit(1000))
      const runsMap = {};
      for (const r of (runs ?? [])) {
        const id = r.agent_id || '(sem agente)';
        if (!runsMap[id]) runsMap[id] = { runs: 0, custo: 0 };
        runsMap[id].runs++;
        runsMap[id].custo += Number(r.cost_usd) || 0;
      }

      setAgentes(ag ?? []);
      setAtivos(ativoMap);
      setConfigs(configMap);
      setRuns30d(runsMap);
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleAgente(agentId, estaAtivo) {
    setToggling(agentId);
    try {
      if (estaAtivo) {
        const { error } = await supabase.from('tenant_agents').delete().eq('tenant_id', tenantDbId).eq('agent_id', agentId);
        if (error) throw error;
        setAtivos(prev => { const n = { ...prev }; delete n[agentId]; return n; });
      } else {
        const { error } = await supabase.from('tenant_agents').upsert({
          tenant_id: tenantDbId,
          agent_id: agentId,
        }, { onConflict: 'tenant_id,agent_id' });
        if (error) throw error;
        setAtivos(prev => ({ ...prev, [agentId]: true }));
      }
    } catch (err) {
      setErro(err?.message || 'erro ao alterar agente');
    } finally {
      setToggling(null);
    }
  }

  async function salvarConfig(agentId, patch) {
    setSaving(agentId);
    try {
      // fonte canônica: tenant_agent_config (docs/decisions/gap2-unificacao-config.md);
      // upsert pois pode não existir linha ainda para este (tenant, agente)
      const { error } = await supabase.from('tenant_agent_config')
        .upsert({
          tenant_id: tenantDbId,
          agent_id: agentId,
          config: { ...(configs[agentId] || {}), ...patch },
        }, { onConflict: 'tenant_id,agent_id' });
      if (error) throw error;
      setConfigs(prev => ({ ...prev, [agentId]: { ...(prev[agentId] || {}), ...patch } }));
    } catch (err) {
      setErro(err?.message || 'erro ao salvar config');
    } finally {
      setSaving(null);
    }
  }

  const fmt = n => (n ?? 0).toLocaleString('pt-BR');
  const totalAtivos = Object.keys(ativos).length;
  const totalAgentes = agentes?.length ?? 0;
  const custoTotal = Object.values(runs30d).reduce((s, r) => s + r.custo, 0);

  return (
    <div>
      <h1>Painel de Agentes v2 <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Ative, desative e configure cada agente para este workspace. Alteracoes sao imediatas.</div>

      {erro && <div className="cv2-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 12 }}>Erro: {erro}</div>}

      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Agentes ativos</div>
          <div className="v">{agentes ? `${totalAtivos} / ${totalAgentes}` : '…'}</div>
          <div className="d mut">neste workspace</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Custo total (30d)</div>
          <div className="v">{agentes ? `US$ ${custoTotal.toFixed(4)}` : '…'}</div>
          <div className="d mut">todos os agentes ativos</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Execucoes (30d)</div>
          <div className="v">{agentes ? fmt(Object.values(runs30d).reduce((s, r) => s + r.runs, 0)) : '…'}</div>
          <div className="d mut">limite P6: 1000 amostras</div>
        </div>
      </div>

      {!agentes && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando catalogo de agentes...</div>}

      {agentes && agentes.map(ag => {
        const ativo = !!ativos[ag.id];
        const r = runs30d[ag.id];
        const config = configs[ag.id];
        const isExp = expandido === ag.id;

        return (
          <div key={ag.id} className="cv2-card" style={{ marginBottom: 10, opacity: ativo ? 1 : 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* letra do agente */}
              <div style={{
                width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                background: ag.color || '#0D0D0D', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: 1,
              }}>{ag.letter || ag.id[0].toUpperCase()}</div>

              {/* info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{ag.name}</b>
                  <BdgStatus ativo={ativo} />
                  {ag.category && <span className="cv2-bdg mut" style={{ fontSize: 10 }}>{ag.category}</span>}
                  {r && <span className="cv2-bdg mut" style={{ fontSize: 10 }}>{fmt(r.runs)} runs · US$ {r.custo.toFixed(4)}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>{ag.role || ag.description || ag.id}</div>
              </div>

              {/* acoes */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {ativo && (
                  <button
                    className="cv2-btn sec"
                    style={{ fontSize: 12 }}
                    onClick={() => setExpandido(isExp ? null : ag.id)}
                  >
                    {isExp ? 'Fechar' : 'Configurar'}
                  </button>
                )}
                <ToggleBtn ativo={ativo} loading={toggling === ag.id} onClick={() => toggleAgente(ag.id, ativo)} />
              </div>
            </div>

            {isExp && ativo && (
              <ConfigPanel
                agente={ag}
                config={config}
                saving={saving === ag.id}
                onSave={patch => salvarConfig(ag.id, patch)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
