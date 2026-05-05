import { useState } from 'react';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import Icon from '../../components/Icon.jsx';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://45.39.210.183:3001';
const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET || '';

const CHANNEL_OPTIONS = [
  { value: 'painel', label: 'Painel interno' },
  { value: 'telegram_interno', label: 'Telegram interno' },
];

export default function InvokeModal({ agent, tenantId, onClose, onSuccess }) {
  const [prompt, setPrompt]   = useState('');
  const [channel, setChannel] = useState('painel');
  const [status, setStatus]   = useState('idle'); // 'idle' | 'submitting' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (prompt.trim().length < 10) return;
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch(`${BRIDGE_URL}/agent/${agent.id}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bridge-secret': BRIDGE_SECRET,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          payload: { prompt: prompt.trim(), channel },
        }),
      });

      if (res.status === 202 || res.ok) {
        setStatus('success');
        onSuccess && onSuccess();
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || body.message || `Erro ${res.status} — tente novamente.`);
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg('Falha de conexão com o servidor. Verifique a VPS.');
      setStatus('error');
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.55)',
        zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'var(--white)',
          borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <AgentAvatar id={agent.id} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)' }}>
              Invocar {agent.name}
            </div>
            <div style={{ fontSize: 12, color: agent.color, fontWeight: 600 }}>{agent.role}</div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={status === 'submitting'}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        {status === 'success' ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{
              fontSize: 40, marginBottom: 12,
              color: 'var(--success)',
            }}>
              ✓
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-900)', marginBottom: 6 }}>
              Agente invocado com sucesso!
            </div>
            <div style={{ fontSize: 13, color: 'var(--g-500)', marginBottom: 24 }}>
              {agent.name} recebeu a instrução e está processando.
            </div>
            <button className="btn-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Prompt */}
              <div>
                <label
                  className="label"
                  htmlFor="invoke-prompt"
                  style={{ display: 'block', marginBottom: 6 }}
                >
                  Instrução para o agente
                </label>
                <textarea
                  id="invoke-prompt"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={`Diga o que você quer que ${agent.name} faça…`}
                  rows={4}
                  required
                  minLength={10}
                  disabled={status === 'submitting'}
                  style={{
                    width: '100%', resize: 'vertical', padding: '10px 12px',
                    border: '1px solid var(--g-200)', borderRadius: 8,
                    fontSize: 13, color: 'var(--g-900)', background: 'var(--white)',
                    fontFamily: 'inherit', lineHeight: 1.5,
                    boxSizing: 'border-box',
                  }}
                />
                {prompt.length > 0 && prompt.trim().length < 10 && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                    Mínimo de 10 caracteres.
                  </div>
                )}
              </div>

              {/* Canal */}
              <div>
                <label
                  className="label"
                  htmlFor="invoke-channel"
                  style={{ display: 'block', marginBottom: 6 }}
                >
                  Canal de resposta
                </label>
                <select
                  id="invoke-channel"
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                  disabled={status === 'submitting'}
                  style={{
                    width: '100%', padding: '9px 12px',
                    border: '1px solid var(--g-200)', borderRadius: 8,
                    fontSize: 13, color: 'var(--g-900)', background: 'var(--white)',
                    fontFamily: 'inherit', cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  {CHANNEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {status === 'error' && (
                <div style={{
                  fontSize: 12, color: 'var(--red)', padding: '10px 12px',
                  background: 'rgba(183,12,0,0.06)', borderRadius: 6, lineHeight: 1.5,
                }}>
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid var(--g-100)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={status === 'submitting'}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={status === 'submitting' || prompt.trim().length < 10}
              >
                {status === 'submitting' ? (
                  <>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: 'var(--white)',
                      borderRadius: '50%',
                      animation: 'spin 600ms linear infinite',
                    }} />
                    Invocando…
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={13} /> Invocar
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
