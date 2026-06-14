import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — Etapa D: White-label (marca por tenant)
// Admin define cor e logo do workspace. Grava tenants.theme_color
// e tenants.logo_url (RLS: tenants_update_admin). Sem SQL novo.
// ============================================================

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };

export default function Marca({ tenantDbId, onChanged }) {
  const [t, setT] = useState(null);
  const [cor, setCor] = useState('#B70C00');
  const [logo, setLogo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const { data, error } = await supabase.from('tenants').select('id, name, slug, color, theme_color, logo_url').eq('id', tenantDbId).maybeSingle();
    if (error) { setErro(error.message); return; }
    setT(data);
    setCor(data?.theme_color || data?.color || '#B70C00');
    setLogo(data?.logo_url || '');
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setErro(null); setMsg(null);
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) { setErro('Cor inválida (use formato #RRGGBB).'); return; }
    setSalvando(true);
    const { error } = await supabase.from('tenants').update({ theme_color: cor, logo_url: logo.trim() || null, updated_at: new Date().toISOString() }).eq('id', tenantDbId);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setMsg('Marca salva. Recarregue para ver aplicada em todo o console.');
    if (onChanged) onChanged({ theme_color: cor, logo_url: logo.trim() || null });
    await carregar();
  }

  return (
    <div>
      <h1>Marca <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>WHITE-LABEL</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Personalize a identidade deste workspace — a cor e o logo aparecem em todo o console para este cliente.{erro ? ` · erro: ${erro}` : ''}</div>
      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'start' }}>
        <div className="cv2-card">
          <h3>{t?.name || 'Workspace'}</h3>
          <label style={labelStyle}>Cor da marca</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={cor} onChange={e => setCor(e.target.value)} style={{ width: 44, height: 38, border: '1px solid var(--line)', borderRadius: 4, background: '#fff', cursor: 'pointer' }} />
            <input style={inputStyle} value={cor} onChange={e => setCor(e.target.value)} placeholder="#B70C00" />
          </div>
          <label style={labelStyle}>URL do logo (opcional)</label>
          <input style={inputStyle} value={logo} onChange={e => setLogo(e.target.value)} placeholder="https://.../logo.png" />
          <div style={{ marginTop: 16 }}><button className="cv2-btn" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar marca'}</button></div>
        </div>
        <div className="cv2-card">
          <h3>Pré-visualização</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--line)', borderRadius: 6 }}>
            {logo
              ? <img src={logo} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
              : <div style={{ width: 26, height: 26, borderRadius: 6, background: cor }} />}
            <b style={{ fontSize: 14 }}>{t?.name || 'Workspace'}</b>
          </div>
          <div style={{ marginTop: 12 }}>
            <button style={{ background: cor, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12, fontWeight: 700 }}>Botão de exemplo</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 12 }}>O Consult Delivery mantém a identidade própria; cada cliente vê a sua.</div>
        </div>
      </div>
    </div>
  );
}
