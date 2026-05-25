import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon.jsx';
import { PACOTES, RECONTRATACAO_TEMPLATES } from './templates.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

export default function EnviarOfertaModal({ customer, tenantDbId, onClose, onSent }) {
  const [pacote, setPacote] = useState('light');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nome = customer.name || 'cliente';
  const preview = RECONTRATACAO_TEMPLATES[pacote]?.(nome) ?? '';

  async function handleEnviar() {
    setLoading(true);
    setError('');
    try {
      const { supabase } = await import('../../lib/supabase.js');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${BRIDGE_URL}/agents/recontratacao/${customer.id}/enviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tenant_id: tenantDbId, pacote }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onSent(customer.id, pacote, json.aceite_id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#1A1A1A', borderRadius: 16, width: '100%', maxWidth: 540, border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Enviar Oferta</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{nome}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Seleção de pacote */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pacote</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PACOTES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPacote(p.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `2px solid ${pacote === p.id ? 'var(--red, #B70C00)' : 'rgba(255,255,255,0.08)'}`,
                    background: pacote === p.id ? 'rgba(183,12,0,0.12)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview da mensagem */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
            <div style={{
              background: 'rgba(37,211,102,0.06)',
              border: '1px solid rgba(37,211,102,0.15)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.55,
            }}>
              {preview}
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: '#F87171' }}>
              {error}
            </div>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              onClick={handleEnviar}
              disabled={loading}
              style={{
                flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
                background: loading ? 'rgba(183,12,0,0.5)' : 'var(--red, #B70C00)',
                color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
                  </svg>
                  Enviando…
                </>
              ) : (
                <>
                  <Icon name="send" size={15} />
                  Enviar via WhatsApp
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
