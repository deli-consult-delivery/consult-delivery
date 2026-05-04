import { useState } from 'react';
import { createCorrecao } from '../lib/api.js';

const BLOCO_LABEL = {
  identidade_visual: 'Identidade Visual',
  desempenho:        'Desempenho',
  operacao:          'Operação',
  funil_conversao:   'Funil de Conversão',
  cardapio:          'Cardápio',
  concorrencia:      'Concorrência',
  marketing:         'Marketing',
  avaliacoes:        'Avaliações',
  configuracoes:     'Configurações',
};

export default function AgenteFeedbackModal({ tenantDbId, blocoKey, onClose }) {
  const [instrucao, setInstrucao] = useState('');
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  const blocoLabel = BLOCO_LABEL[blocoKey] || blocoKey || 'Geral';

  async function handleSend() {
    if (!instrucao.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createCorrecao({ tenant_id: tenantDbId, bloco: blocoKey || null, instrucao: instrucao.trim() });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: '100%', maxWidth: 500, padding: 24 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🧠</span>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)', marginBottom: 2 }}>
              Treinar o agente
            </h3>
            <p style={{ fontSize: 12, color: 'var(--g-500)' }}>
              Bloco: <strong>{blocoLabel}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--g-400)', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 32 }}>✅</span>
            <p style={{ marginTop: 8, color: 'var(--g-700)', fontWeight: 600 }}>Correção salva!</p>
            <p style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
              O agente vai aplicar essa instrução nas próximas análises.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 12, lineHeight: 1.5 }}>
              Descreva o erro ou melhoria. O agente vai seguir essa instrução em todas as análises futuras.
            </p>
            <div style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--g-50)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--g-500)' }}>
              <strong>Exemplos:</strong><br />
              • "Não confundir faturamento com ticket médio"<br />
              • "A palavra correta é 'oferta', não 'promoção'"<br />
              • "Evitar citar concorrentes pelo nome"
            </div>
            <textarea
              autoFocus
              value={instrucao}
              onChange={e => setInstrucao(e.target.value)}
              placeholder="Instrução para o agente..."
              rows={3}
              style={{
                width: '100%', resize: 'vertical', padding: '10px 12px',
                borderRadius: 'var(--r-sm)', border: '1px solid var(--g-300)',
                fontSize: 13, color: 'var(--g-900)', background: 'var(--white)',
                fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={handleSend}
                disabled={saving || !instrucao.trim()}
                style={{ opacity: !instrucao.trim() ? 0.5 : 1 }}>
                {saving ? 'Salvando...' : '🧠 Salvar instrução'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
