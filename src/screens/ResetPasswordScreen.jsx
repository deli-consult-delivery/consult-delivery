import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import rocketLogo from '/assets/rocket-logo.png';

export default function ResetPasswordScreen({ isInvite = false, onDone }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pwd !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    if (pwd.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      onDone();
    }
  };

  const inp = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid var(--g-300)', borderRadius: 8,
    outline: 'none', boxSizing: 'border-box',
    background: 'white', color: 'var(--black)',
    marginTop: 4,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--g-50)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 12, padding: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src={rocketLogo} alt="Consult Delivery" style={{ width: 36, height: 'auto' }} />
          <div>
            <div style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', lineHeight: 1 }}>Consult</div>
            <div style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', color: 'var(--red)', lineHeight: 1 }}>Delivery</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--black)', marginBottom: 4 }}>
          {isInvite ? 'Criar sua senha' : 'Nova senha'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--g-500)', marginBottom: 28 }}>
          {isInvite
            ? 'Defina uma senha para acessar a plataforma.'
            : 'Escolha uma nova senha para sua conta.'}
        </p>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nova senha</label>
            <input style={inp} type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" required autoFocus />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirmar senha</label>
            <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700,
            background: 'var(--red)', color: 'white', border: 'none',
            borderRadius: 8, cursor: 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Salvando…' : isInvite ? 'Entrar na plataforma' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
