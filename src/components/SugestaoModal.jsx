import { useState } from 'react';
import { createSugestao } from '../lib/api.js';

export default function SugestaoModal({ tenantDbId, tela, onClose }) {
  const [texto, setTexto]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSend() {
    if (!texto.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createSugestao({ tenant_id: tenantDbId, texto: texto.trim(), tela });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError('Não foi possível enviar. Tente novamente.');
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', flex: 1 }}>
            Sugestão para o desenvolvedor
          </h3>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--g-400)', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 32 }}>✅</span>
            <p style={{ marginTop: 8, color: 'var(--g-700)', fontWeight: 600 }}>Sugestão enviada!</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--g-500)', marginBottom: 12 }}>
              Descreva a melhoria ou problema que você identificou. Isso vai direto para o pipeline de desenvolvimento.
            </p>
            <textarea
              autoFocus
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex: Seria útil ter um filtro por data no histórico de análises..."
              rows={4}
              style={{
                width: '100%', resize: 'vertical',
                padding: '10px 12px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--g-300)', fontSize: 13,
                color: 'var(--g-900)', background: 'var(--white)',
                fontFamily: 'inherit', lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSend}
                disabled={saving || !texto.trim()}
                style={{ opacity: !texto.trim() ? 0.5 : 1 }}
              >
                {saving ? 'Enviando...' : 'Enviar sugestão'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
