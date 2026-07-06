import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import RequireRole from '../components/auth/RequireRole.jsx';

// ============================================================
// Console v2 — GAP-6: Audit log (compliance multi-tenant)
// Viewer de audit_log (admin do tenant): quem/quê/quando/IP.
// Paginação server-side por keyset (cursor = id, bigint monotônico —
// audit_log é append-only, então id cresce na mesma ordem de created_at).
// Evita o cap de 1000 linhas do PostgREST e evita carregar tudo em array.
// ============================================================

const PAGE_SIZE = 50;

function AuditLogInner({ tenantDbId }) {
  const [rows, setRows] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [recurso, setRecurso] = useState('');
  const [ator, setAtor] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [atorOptions, setAtorOptions] = useState([]);
  const [erro, setErro] = useState(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  const montarQuery = useCallback((cursorId) => {
    let q = supabase.from('audit_log')
      .select('id, user_id, agent_name, action, resource, ip_address, created_at, metadata')
      .eq('tenant_id', tenantDbId)
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1); // +1 só pra saber se há próxima página, sem outra query
    if (filtro) q = q.ilike('action', `%${filtro}%`);
    if (recurso) q = q.ilike('resource', `%${recurso}%`);
    if (ator) {
      const [tipo, valor] = ator.split(':');
      q = tipo === 'agent' ? q.eq('agent_name', valor) : q.eq('user_id', valor);
    }
    if (de) q = q.gte('created_at', `${de}T00:00:00`);
    if (ate) q = q.lte('created_at', `${ate}T23:59:59`);
    if (cursorId) q = q.lt('id', cursorId); // keyset: só linhas mais antigas que o cursor
    return q;
  }, [tenantDbId, filtro, recurso, ator, de, ate]);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    setErro(null);
    const { data, error } = await montarQuery(null);
    if (error) { setErro(error.message); return; }
    const pagina = data ?? [];
    setTemMais(pagina.length > PAGE_SIZE);
    setRows(pagina.slice(0, PAGE_SIZE));
  }, [tenantDbId, montarQuery]);

  useEffect(() => { carregar(); }, [carregar]);

  async function carregarMais() {
    if (!rows || rows.length === 0) return;
    setCarregandoMais(true);
    const cursorId = rows[rows.length - 1].id;
    const { data, error } = await montarQuery(cursorId);
    if (error) { setErro(error.message); setCarregandoMais(false); return; }
    const pagina = data ?? [];
    setTemMais(pagina.length > PAGE_SIZE);
    setRows(r => [...r, ...pagina.slice(0, PAGE_SIZE)]);
    setCarregandoMais(false);
  }

  // opções do select vêm dos dados já carregados (sem query extra) — fixadas na 1ª carga
  useEffect(() => {
    if (rows && atorOptions.length === 0) {
      const map = new Map();
      rows.forEach(r => {
        const key = r.agent_name ? `agent:${r.agent_name}` : (r.user_id ? `user:${r.user_id}` : null);
        const label = r.agent_name || (r.user_id ? r.user_id.slice(0, 8) : null);
        if (key && !map.has(key)) map.set(key, label);
      });
      setAtorOptions([...map.entries()].map(([key, label]) => ({ key, label })));
    }
  }, [rows, atorOptions.length]);

  return (
    <div>
      <h1>Auditoria <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>REGISTRO</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Tudo que acontece no workspace fica registrado — quem fez, o quê, quando.{erro ? ` · erro: ${erro} (só admin vê)` : ''}</div>
      <div className="cv2-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Filtrar por ação (ex.: aprovar, login)" value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} />
        <input placeholder="Filtrar por recurso (ex.: ifood:item, lojas)" value={recurso} onChange={e => setRecurso(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} />
        <select value={ator} onChange={e => setAtor(e.target.value)}
          style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }}>
          <option value="">Todos os usuários/agentes</option>
          {atorOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'flex', gap: 5, alignItems: 'center' }}>
          De
          <input type="date" value={de} onChange={e => setDe(e.target.value)}
            style={{ padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'flex', gap: 5, alignItems: 'center' }}>
          Até
          <input type="date" value={ate} onChange={e => setAte(e.target.value)}
            style={{ padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} />
        </label>
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
          {temMais && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="cv2-btn sec" disabled={carregandoMais} onClick={carregarMais}>
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      ) : <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>{rows ? 'Nenhum registro.' : 'Carregando…'}</div>}
    </div>
  );
}

export default function AuditLog({ tenantDbId, userId }) {
  return (
    <RequireRole roles={['admin']} userId={userId}>
      <AuditLogInner tenantDbId={tenantDbId} />
    </RequireRole>
  );
}
