import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GAP-6: Audit log (compliance multi-tenant)
// Viewer de audit_log (admin do tenant): quem/quê/quando/IP.
// ============================================================

export default function AuditLog({ tenantDbId }) {
  const [rows, setRows] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    let q = supabase.from('audit_log')
      .select('id, user_id, agent_name, action, resource, ip_address, created_at, metadata')
      .eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(200);
    if (filtro) q = q.ilike('action', `%${filtro}%`);
    const { data, error } = await q;
    if (error) { setErro(error.message); return; }
    setRows(data ?? []);
  }, [tenantDbId, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <h1>Auditoria <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>REGISTRO</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Tudo que acontece no workspace fica registrado — quem fez, o quê, quando.{erro ? ` · erro: ${erro} (só admin vê)` : ''}</div>
      <div className="cv2-card" style={{ maxWidth: 360 }}>
        <input placeholder="Filtrar por ação (ex.: aprovar, login)" value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} />
      </div>
      {rows && rows.length > 0 ? (
        <div className="cv2-card">
          <div className="cv2-tbl-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Ação</th><th>Recurso</th><th>Agente/Usuário</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--tx2)' }}>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                  <td><b>{r.action}</b></td>
                  <td style={{ color: 'var(--tx2)' }}>{r.resource || '—'}</td>
                  <td>{r.agent_name || (r.user_id ? r.user_id.slice(0, 8) : '—')}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{r.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>{rows ? 'Nenhum registro.' : 'Carregando…'}</div>}
    </div>
  );
}
