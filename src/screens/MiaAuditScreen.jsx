/**
 * MIA-04: Audit Screen — logs de privacidade do worker MIA
 *
 * Rota: 'mia' (Console v2 · LEGADO → wrapper .cv2-legado, fundo claro)
 * Acesso: admin apenas
 *
 * Mostra últimas 100 runs do worker por loja, com latência,
 * tokens, sugestões geradas e erros.
 *
 * Visual: tema claro do Console v2 (cv2-*), consistente com as demais
 * telas reusadas do clássico em fundo claro (#232–235).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getMiaAudit } from '../lib/miaApi.js';

const inp = { background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 11px', fontSize: 13, outline: 'none', fontWeight: 500, color: 'var(--tx)', fontFamily: 'inherit', minWidth: 240 };
const th = { textAlign: 'left', padding: '8px 10px', color: 'var(--tx2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', fontSize: 10, borderBottom: '1px solid var(--line)' };
const td = { padding: '7px 10px', fontSize: 11.5, color: 'var(--tx)', whiteSpace: 'nowrap' };

export default function MiaAuditScreen({ tenantDbId }) {
  const [lojas, setLojas]         = useState([]);
  const [lojaId, setLojaId]       = useState('');
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase
      .from('lojas')
      .select('id, nome')
      .eq('tenant_id', tenantDbId)
      .eq('status', 'ativo')
      .eq('is_contato', false)
      .order('nome')
      .then(({ data }) => setLojas(data || []));
  }, [tenantDbId]);

  const load = useCallback(async () => {
    if (!lojaId) return;
    setLoading(true);
    try {
      const data = await getMiaAudit(lojaId, 100);
      setRegistros(data || []);
    } catch (err) {
      console.error('[MiaAuditScreen]', err.message);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  useEffect(() => { load(); }, [load]);

  function formatarData(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  const comLat = registros.filter(r => r.latencia_ms);
  const stats = registros.length > 0 ? {
    total:       registros.length,
    comErro:     registros.filter(r => r.erro).length,
    mediaLat:    comLat.length ? Math.round(comLat.reduce((s, r) => s + r.latencia_ms, 0) / comLat.length) : 0,
    sugestoes:   registros.reduce((s, r) => s + (r.sugestoes_geradas || 0), 0),
    jsonInvalid: registros.filter(r => r.erro === 'json_invalid').length,
  } : null;

  return (
    <div className="cv2-ct">
      <h1>Audit MIA — Monitor IA</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Logs de privacidade de cada run do worker (últimas 100 chamadas por loja).</div>

      {/* Selector de loja */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={inp}>
          <option value="">Selecionar loja…</option>
          {lojas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
        <button className="cv2-btn sec" onClick={load} disabled={!lojaId || loading}>
          {loading ? 'Carregando…' : '↻ Atualizar'}
        </button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="cv2-kpis">
          {[
            { label: 'Total runs', value: stats.total },
            { label: 'Com erro', value: stats.comErro, warn: stats.comErro > 0 },
            { label: 'Latência média', value: `${stats.mediaLat}ms`, warn: stats.mediaLat > 10000 },
            { label: 'Sugestões geradas', value: stats.sugestoes },
            { label: 'JSON inválido', value: stats.jsonInvalid, warn: stats.jsonInvalid > 0 },
          ].map(s => (
            <div key={s.label} className="cv2-kpi">
              <div className="l">{s.label}</div>
              <div className="v" style={s.warn ? { color: 'var(--red)' } : undefined}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Estados vazios */}
      {lojaId && !loading && registros.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)', fontSize: 13 }}>
          Nenhum registro de audit para esta loja.
        </div>
      )}
      {!lojaId && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)', fontSize: 13 }}>
          Selecione uma loja para ver os logs do worker MIA.
        </div>
      )}

      {/* Tabela de registros */}
      {registros.length > 0 && (
        <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Data', 'JID', 'Msgs', 'Modelo', 'Latência', 'Tokens in/out', 'Sugestões', 'Erro'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ ...td, color: 'var(--tx2)' }}>{formatarData(r.created_at)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.remote_jid || '—'}
                    </td>
                    <td style={td}>{r.msg_count}</td>
                    <td style={{ ...td, color: 'var(--tx2)' }}>{r.modelo_usado?.replace(':cloud', '') || '—'}</td>
                    <td style={{ ...td, color: r.latencia_ms > 10000 ? 'var(--red)' : 'var(--tx)' }}>
                      {r.latencia_ms ? `${r.latencia_ms}ms` : '—'}
                    </td>
                    <td style={{ ...td, color: 'var(--tx2)' }}>
                      {r.tokens_in ? `${r.tokens_in} / ${r.tokens_out || '?'}` : '—'}
                    </td>
                    <td style={{ ...td, color: r.sugestoes_geradas > 0 ? 'var(--green)' : 'var(--tx2)', fontWeight: 700 }}>
                      {r.sugestoes_geradas}
                    </td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.erro ? (
                        <span style={{ color: 'var(--red)' }} title={r.erro}>{r.erro.slice(0, 40)}{r.erro.length > 40 ? '…' : ''}</span>
                      ) : (
                        <span style={{ color: 'var(--green)' }}>✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
