/**
 * MIA-04: Audit Screen — logs de privacidade do worker MIA
 *
 * Rota: 'mia-audit'
 * Acesso: admin apenas
 *
 * Mostra últimas 100 runs do worker por loja, com latência,
 * tokens, sugestões geradas e erros.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getMiaAudit } from '../lib/miaApi.js';

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

  const stats = registros.length > 0 ? {
    total:      registros.length,
    comErro:    registros.filter(r => r.erro).length,
    mediaLat:   Math.round(registros.filter(r => r.latencia_ms).reduce((s, r) => s + r.latencia_ms, 0) / registros.filter(r => r.latencia_ms).length) || 0,
    sugestoes:  registros.reduce((s, r) => s + (r.sugestoes_geradas || 0), 0),
    jsonInvalid: registros.filter(r => r.erro === 'json_invalid').length,
  } : null;

  return (
    <div style={{ padding: 24, maxWidth: 1000, color: 'rgba(255,255,255,0.85)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'white' }}>
        🔍 Audit MIA — Monitor IA
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
        Logs de privacidade de cada run do worker (últimas 100 chamadas por loja)
      </p>

      {/* Selector de loja */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <select
          value={lojaId}
          onChange={e => setLojaId(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'white',
            fontSize: 13,
            padding: '7px 12px',
            minWidth: 240,
          }}
        >
          <option value="">Selecionar loja…</option>
          {lojas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={!lojaId || loading}
          style={{
            padding: '7px 16px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            cursor: !lojaId || loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Carregando…' : '↻ Atualizar'}
        </button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total runs', value: stats.total },
            { label: 'Com erro', value: stats.comErro, warn: stats.comErro > 0 },
            { label: 'Latência média', value: `${stats.mediaLat}ms`, warn: stats.mediaLat > 10000 },
            { label: 'Sugestões geradas', value: stats.sugestoes },
            { label: 'JSON inválido', value: stats.jsonInvalid, warn: stats.jsonInvalid > 0 },
          ].map(s => (
            <div key={s.label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${s.warn ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8,
              padding: '10px 16px',
              minWidth: 120,
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.warn ? '#EF4444' : 'white' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela de registros */}
      {lojaId && !loading && registros.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          Nenhum registro de audit para esta loja.
        </div>
      )}

      {registros.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Data', 'JID', 'Msgs', 'Modelo', 'Latência', 'Tokens in/out', 'Sugestões', 'Erro'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '6px 10px',
                    color: 'rgba(255,255,255,0.45)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    fontSize: 10,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                    {formatarData(r.created_at)}
                  </td>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.remote_jid || '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'white' }}>{r.msg_count}</td>
                  <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                    {r.modelo_usado?.replace(':cloud', '') || '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: r.latencia_ms > 10000 ? '#EF4444' : 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
                    {r.latencia_ms ? `${r.latencia_ms}ms` : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                    {r.tokens_in ? `${r.tokens_in} / ${r.tokens_out || '?'}` : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: r.sugestoes_geradas > 0 ? '#22C55E' : 'rgba(255,255,255,0.4)' }}>
                    {r.sugestoes_geradas}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#EF4444', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.erro ? (
                      <span title={r.erro}>{r.erro.slice(0, 40)}{r.erro.length > 40 ? '…' : ''}</span>
                    ) : (
                      <span style={{ color: '#22C55E' }}>✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
