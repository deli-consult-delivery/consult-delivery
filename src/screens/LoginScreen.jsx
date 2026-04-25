import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import rocketLogo from '/assets/rocket-logo.png';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('wandson@consultdelivery.com.br');
  const [pwd, setPwd] = useState('••••••••••');
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => onLogin(), 900);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Left — brand panel */}
      <div style={{
        background: '#0D0D0D',
        color: 'white',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Decorative red glow */}
        <div style={{
          position: 'absolute', top: '-30%', left: '-20%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(183,12,0,0.4) 0%, rgba(183,12,0,0) 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-20%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(183,12,0,0.25) 0%, rgba(183,12,0,0) 60%)',
          pointerEvents: 'none',
        }} />
        {/* Grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={rocketLogo} alt="Consult Delivery" style={{
            width: 44, height: 'auto', display: 'block',
            filter: 'drop-shadow(0 6px 16px rgba(183,12,0,0.5))',
          }} />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 20, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Consult</div>
            <div style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 20, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--red)' }}>Delivery</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, maxWidth: 500 }}>
          <div style={{
            fontFamily: 'Oswald, Impact, sans-serif',
            fontWeight: 700,
            fontSize: 72,
            lineHeight: 0.95,
            letterSpacing: '-1px',
            textTransform: 'uppercase',
          }}>
            A plataforma<br />
            que transforma<br />
            <span style={{ color: 'var(--red)' }}>delivery</span> em<br />
            <span style={{ color: 'var(--red)' }}>resultado.</span>
          </div>
          <p style={{ marginTop: 28, fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: 440 }}>
            Gestão, cobrança, atendimento e marketing em um só lugar —
            com 7 agentes IA trabalhando 24/7 pelo seu restaurante.
          </p>

          <div style={{ marginTop: 40, display: 'flex', gap: 24, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--red)', lineHeight: 1 }}>+127</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>restaurantes ativos</div>
            </div>
            <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.15)' }} />
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--red)', lineHeight: 1 }}>R$2.1M</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>recuperados pela CORA</div>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          © 2026 Consult Delivery · consultdelivery.com.br
        </div>
      </div>

      {/* Right — form */}
      <div style={{ background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--black)', letterSpacing: '-0.5px' }}>Entrar na plataforma</h1>
          <p style={{ fontSize: 14, color: 'var(--g-500)', marginTop: 8 }}>Bem-vindo de volta, Wandson 👋</p>

          <div style={{ marginTop: 32 }}>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>E-mail</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Senha</label>
              <a href="#" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, textDecoration: 'none' }}>Esqueci a senha</a>
            </div>
            <input className="input" value={pwd} onChange={e => setPwd(e.target.value)} type="password" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 13, color: 'var(--g-700)', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--red)', width: 16, height: 16 }} />
            Lembrar de mim neste dispositivo
          </label>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 24, padding: '12px 20px', fontSize: 15, opacity: loading ? 0.8 : 1 }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                </svg>
                Entrando…
              </span>
            ) : <><span>Entrar</span> <Icon name="arrowright" size={16} /></>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--g-200)' }} />
            <span style={{ fontSize: 11, color: 'var(--g-400)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>ou</span>
            <div style={{ flex: 1, height: 1, background: 'var(--g-200)' }} />
          </div>

          <button type="button" className="btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '12px 20px' }}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Entrar com Google
          </button>

          <div style={{ marginTop: 40, padding: 16, background: 'var(--g-50)', borderRadius: 8, textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--g-700)' }}>Ainda não tem conta? </span>
            <a href="#" style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700, textDecoration: 'none' }}>Falar com consultor →</a>
          </div>
        </form>
      </div>
    </div>
  );
}
