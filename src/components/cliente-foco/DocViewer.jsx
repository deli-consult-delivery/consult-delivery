/**
 * MIA-03: DocViewer — exibe client_facts da loja
 * Permite adicionar fatos manualmente.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDoc, createFact } from '../../lib/miaApi.js';

export default function DocViewer({ lojaId }) {
  const [facts, setFacts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [novoFato, setNovoFato] = useState('');
  const [saving, setSaving]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!lojaId) return;
    setLoading(true);
    try {
      const data = await getDoc(lojaId);
      setFacts(data || []);
    } catch (err) {
      console.error('[DocViewer] load:', err.message);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  useEffect(() => { load(); }, [load]);

  async function addFact() {
    if (!novoFato.trim()) return;
    setSaving(true);
    try {
      const fact = await createFact(lojaId, { fact: novoFato.trim(), category: 'manual' });
      setFacts(prev => [fact, ...prev]);
      setNovoFato('');
    } catch (err) {
      console.error('[DocViewer] addFact:', err.message);
    } finally {
      setSaving(false);
    }
  }

  const visiveis = expanded ? facts : facts.slice(0, 4);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
          📋 DOC do Cliente
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
          {facts.length} fato{facts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: 12 }}>
          Carregando…
        </div>
      ) : (
        <>
          {visiveis.map(f => (
            <div key={f.id} style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 6,
              padding: '7px 10px',
              marginBottom: 5,
              fontSize: 11,
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.5,
              borderLeft: '2px solid rgba(255,255,255,0.15)',
            }}>
              {f.fact}
              {f.category && f.category !== 'manual' && (
                <span style={{
                  display: 'inline-block',
                  marginLeft: 6,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.3)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {f.category}
                </span>
              )}
            </div>
          ))}

          {facts.length > 4 && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                width: '100%',
                padding: '5px 0',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.35)',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {expanded ? '▲ Menos' : `▼ Ver mais ${facts.length - 4} fatos`}
            </button>
          )}

          {facts.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', padding: '8px 0 12px' }}>
              Nenhum fato registrado ainda
            </div>
          )}
        </>
      )}

      {/* Adicionar fato manual */}
      <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
        <input
          value={novoFato}
          onChange={e => setNovoFato(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addFact()}
          placeholder="Adicionar fato manual…"
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            color: 'white',
            fontSize: 11,
            padding: '5px 8px',
          }}
        />
        <button
          onClick={addFact}
          disabled={saving || !novoFato.trim()}
          style={{
            padding: '5px 10px',
            background: saving || !novoFato.trim() ? 'rgba(255,255,255,0.07)' : '#B70C00',
            border: 'none',
            borderRadius: 5,
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            cursor: saving || !novoFato.trim() ? 'default' : 'pointer',
          }}
        >
          {saving ? '…' : '+'}
        </button>
      </div>
    </div>
  );
}
