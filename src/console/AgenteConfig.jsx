import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GAP-2: Configuração de agente por tenant
// modo (humano/híbrido/IA) + liga/desliga via tenant_agent_config.
// RLS: admin/owner do tenant gerencia.
// ============================================================

const MODOS = [
  { v: 'humano', l: 'Humano', d: 'agente só sugere; humano executa tudo' },
  { v: 'hibrido', l: 'Híbrido', d: 'agente propõe, humano aprova (padrão)' },
  { v: 'ia', l: 'IA', d: 'agente executa direto onde for permitido' },
];

const PROVIDERS = [
  { v: '', l: 'Padrão da plataforma' },
  { v: 'anthropic', l: 'Anthropic' },
  { v: 'ollama', l: 'Ollama' },
  { v: 'openrouter', l: 'OpenRouter' },
];

export default function AgenteConfig({ tenantDbId }) {
  const [agentes, setAgentes] = useState(null);
  const [cfg, setCfg] = useState({});
  const [erro, setErro] = useState(null);
  const [agindo, setAgindo] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: tas }, { data: cfgs, error }] = await Promise.all([
      supabase.from('tenant_agents').select('agent_id, agents(id, name, role, letter)').eq('tenant_id', tenantDbId),
      supabase.from('tenant_agent_config').select('agent_id, modo_override, enabled, config, provider, cost_limit_usd').eq('tenant_id', tenantDbId),
    ]);
    if (error) { setErro(error.message); }
    const cmap = {};
    (cfgs ?? []).forEach(c => { cmap[c.agent_id] = c; });
    setCfg(cmap);
    setAgentes((tas ?? []).map(t => t.agents).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)));
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(agentId, patch) {
    setAgindo(agentId); setErro(null);
    const atual = cfg[agentId] || {};
    const { error } = await supabase.from('tenant_agent_config').upsert({
      tenant_id: tenantDbId, agent_id: agentId,
      modo_override: patch.modo_override ?? atual.modo_override ?? 'hibrido',
      enabled: patch.enabled != null ? patch.enabled : (atual.enabled != null ? atual.enabled : true),
      config: atual.config ?? {},
      provider: patch.provider !== undefined ? (patch.provider || null) : (atual.provider ?? null),
      cost_limit_usd: patch.cost_limit_usd !== undefined ? patch.cost_limit_usd : (atual.cost_limit_usd ?? null),
    }, { onConflict: 'tenant_id,agent_id' });
    if (error) { setAgindo(null); setErro(error.message); return; }
    await carregar();
    setAgindo(null);
  }

  return (
    <div>
      <h1>Configuração de Agentes <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>POR CLIENTE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Defina o modo de autonomia de cada agente neste workspace e ligue/desligue individualmente.{erro ? ` · erro: ${erro}` : ''}</div>
      {agentes && agentes.map(a => {
        const c = cfg[a.id] || {};
        const modo = c.modo_override || 'hibrido';
        const enabled = c.enabled != null ? c.enabled : true;
        return (
          <div key={a.id} className="cv2-card">
            <div className="cv2-spread">
              <div>
                <b style={{ fontSize: 14 }}>{a.name}</b>
                <div style={{ color: 'var(--tx2)', fontSize: 12 }}>{a.role}</div>
              </div>
              <button className={enabled ? 'cv2-btn' : 'cv2-btn sec'} disabled={agindo === a.id} onClick={() => salvar(a.id, { enabled: !enabled })}>
                {enabled ? 'Ligado' : 'Desligado'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {MODOS.map(m => (
                <button key={m.v} title={m.d} disabled={agindo === a.id}
                  className={modo === m.v ? 'cv2-btn' : 'cv2-btn sec'} onClick={() => salvar(a.id, { modo_override: m.v })}>
                  {m.l}
                </button>
              ))}
              <span style={{ alignSelf: 'center', fontSize: 11.5, color: 'var(--tx2)' }}>{MODOS.find(m => m.v === modo)?.d}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {PROVIDERS.map(p => (
                <button key={p.v} disabled={agindo === a.id}
                  className={(c.provider || '') === p.v ? 'cv2-btn' : 'cv2-btn sec'} onClick={() => salvar(a.id, { provider: p.v })}>
                  {p.l}
                </button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
                Limite US$/mês:
                <input key={`${tenantDbId}:${a.id}:${c.cost_limit_usd ?? ''}`} type="number" min="0" step="0.01" defaultValue={c.cost_limit_usd ?? ''} placeholder="sem limite"
                  disabled={agindo === a.id} style={{ width: 90 }}
                  onBlur={e => {
                    const raw = e.target.value;
                    const v = raw === '' ? null : Number(raw);
                    if (v !== null && (Number.isNaN(v) || v < 0)) { e.target.value = c.cost_limit_usd ?? ''; return; }
                    if (v !== (c.cost_limit_usd ?? null)) salvar(a.id, { cost_limit_usd: v });
                  }} />
              </label>
              <span title="O roteamento multi-provider e a aplicação do limite ainda não consomem esta configuração." style={{ fontSize: 11, color: 'var(--tx2)', cursor: 'help' }}>
                ⓘ sem efeito em runtime ainda
              </span>
            </div>
          </div>
        );
      })}
      {agentes && !agentes.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum agente habilitado neste workspace.</div>}
    </div>
  );
}
