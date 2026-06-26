import { useState, useEffect } from 'react';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// Cores padrão (fallback quando o tenant não tem branding configurado)
const DEFAULT_BRAND = '#B70C00';

export default function AvaliacaoPublica() {
  const token = window.location.pathname.replace(/^\/avaliacao\//, '').split('/')[0];

  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);
  const [error, setError]         = useState(null);
  const [expirado, setExpirado]   = useState(false);
  const [respondida, setResp]     = useState(null); // nota já respondida

  const [nota, setNota]           = useState(0);
  const [hover, setHover]         = useState(0);
  const [comentario, setComent]   = useState('');
  const [submitting, setSubmit]   = useState(false);
  const [enviado, setEnviado]     = useState(false);

  useEffect(() => {
    if (!token) { setError('Token não encontrado na URL.'); setLoading(false); return; }

    fetch(`${BRIDGE_URL}/api/publico/avaliacao/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 410) { setExpirado(true); return null; }
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          return Promise.reject(e.error || e.erro || 'Erro desconhecido');
        }
        return r.json();
      })
      .then((d) => {
        if (d) {
          setData(d); // mantém a marca do tenant inclusive no estado "já respondida"
          if (d.ja_respondida) setResp(d.nota ?? null);
        }
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [token]);

  async function enviar() {
    if (nota < 1 || submitting) return;
    setSubmit(true);
    try {
      const r = await fetch(
        `${BRIDGE_URL}/api/publico/avaliacao/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nota, comentario: comentario.trim() || undefined }),
        }
      );
      if (r.status === 410) { setExpirado(true); return; }
      if (r.status === 409) { setResp(nota); return; }
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || e.erro || 'Erro ao enviar');
      }
      setEnviado(true);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setSubmit(false);
    }
  }

  // ── Cor da marca e configuração de mensagens ─────────────────────────────────
  const brand      = data?.brand || null;
  const brandColor = brand?.theme_color || brand?.color || DEFAULT_BRAND;
  const brandName  = brand?.name || 'Consult Delivery';
  const logoUrl    = brand?.logo_url || null;
  const config     = data?.config || null;
  const tituloPage = config?.csat_titulo        || 'Como foi seu atendimento?';
  const subtitulo  = config?.csat_subtitulo     || null;
  const msgAgradec = config?.csat_agradecimento || 'Obrigado por avaliar seu atendimento.';

  if (loading) return (
    <div style={styles.center}>
      <div style={{ ...styles.spinner, borderTopColor: DEFAULT_BRAND }} />
      <p style={styles.loadingText}>Carregando…</p>
    </div>
  );

  if (error) return (
    <div style={styles.center}>
      <p style={styles.errorText}>Link inválido.</p>
      <p style={styles.errorSub}>{error}</p>
    </div>
  );

  if (expirado) return (
    <div style={styles.center}>
      <p style={styles.errorText}>Link expirado.</p>
      <p style={styles.errorSub}>O prazo de 7 dias para avaliar este atendimento já passou.</p>
    </div>
  );

  // ── Header reutilizável (cores da marca) ─────────────────────────────────────
  const Header = (
    <header style={{ ...styles.header, background: brandColor }}>
      <div style={styles.headerInner}>
        {logoUrl
          ? <img src={logoUrl} alt={brandName} style={styles.logoImg} />
          : <span style={{ ...styles.logoMark, color: brandColor }}>{initials(brandName)}</span>}
        <span style={styles.headerTitle}>{brandName}</span>
      </div>
    </header>
  );

  if (respondida !== null) return (
    <div style={styles.page}>
      {Header}
      <main style={styles.main}>
        <div style={styles.doneBox}>
          <span style={styles.doneIcon}>✓</span>
          <h2 style={styles.doneTitle}>Você já avaliou este atendimento</h2>
          {respondida ? <p style={styles.doneSub}>Sua nota: {'★'.repeat(respondida)}{'☆'.repeat(5 - respondida)}</p> : null}
          <p style={styles.doneSub}>Obrigado pelo seu feedback!</p>
        </div>
      </main>
    </div>
  );

  if (enviado) return (
    <div style={styles.page}>
      {Header}
      <main style={styles.main}>
        <div style={styles.doneBox}>
          <span style={{ ...styles.doneIcon, color: brandColor }}>✓</span>
          <h2 style={styles.doneTitle}>Avaliação enviada!</h2>
          <p style={styles.doneSub}>{'★'.repeat(nota)}{'☆'.repeat(5 - nota)}</p>
          <p style={styles.doneSub}>{msgAgradec}</p>
        </div>
      </main>
    </div>
  );

  // ── Tela de avaliação (pendente) ─────────────────────────────────────────────
  const atendente = data?.atendente_nome;
  const cliente   = data?.nome_cliente;

  return (
    <div style={styles.page}>
      {Header}
      <main style={styles.main}>
        <section style={styles.card}>
          <h1 style={styles.titulo}>{tituloPage}</h1>
          {subtitulo && <p style={styles.subtitulo}>{subtitulo}</p>}
          {cliente && <p style={styles.saudacao}>Olá, {cliente}!</p>}
          {atendente && (
            <p style={styles.atendente}>
              Você foi atendido por <strong>{atendente}</strong>.
            </p>
          )}

          <div style={styles.starsWrap} role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
            {[1, 2, 3, 4, 5].map((n) => {
              const ativo = (hover || nota) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  aria-checked={nota === n}
                  role="radio"
                  onClick={() => setNota(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  style={{
                    ...styles.star,
                    color: ativo ? '#F5B301' : '#D8D8D8',
                  }}
                >
                  ★
                </button>
              );
            })}
          </div>
          {nota > 0 && <p style={styles.notaLabel}>{NOTA_LABEL[nota]}</p>}

          <textarea
            style={styles.textarea}
            placeholder="Conte o que achou (opcional)…"
            value={comentario}
            onChange={(e) => setComent(e.target.value)}
            rows={4}
            maxLength={2000}
          />

          <button
            style={{
              ...styles.btnEnviar,
              background: nota >= 1 ? brandColor : '#CCC',
              cursor: nota >= 1 ? 'pointer' : 'not-allowed',
            }}
            onClick={enviar}
            disabled={nota < 1 || submitting}
          >
            {submitting ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </section>
      </main>
    </div>
  );
}

const NOTA_LABEL = {
  1: 'Muito insatisfeito',
  2: 'Insatisfeito',
  3: 'Neutro',
  4: 'Satisfeito',
  5: 'Muito satisfeito',
};

function initials(name) {
  if (!name) return 'CD';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'CD';
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F8F8F8',
    fontFamily: "'Montserrat', system-ui, sans-serif",
    color: '#1A1A1A',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100vh', gap: 12, padding: 24,
    textAlign: 'center', fontFamily: "'Montserrat', system-ui, sans-serif",
  },
  spinner: {
    width: 40, height: 40,
    border: '3px solid #E5E5E5',
    borderTop: '3px solid #B70C00',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#666', fontSize: 14, margin: 0 },
  errorText:   { color: '#374151', fontSize: 18, fontWeight: 700, margin: 0 },
  errorSub:    { color: '#666', fontSize: 13, margin: 0, maxWidth: 320 },
  header: {
    padding: '14px 20px',
    position: 'sticky', top: 0, zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  headerInner: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 560, margin: '0 auto' },
  logoMark: {
    background: '#fff', fontWeight: 800,
    borderRadius: 6, padding: '2px 8px', fontSize: 13, letterSpacing: 1,
  },
  logoImg: { height: 28, width: 'auto', borderRadius: 4, background: '#fff', padding: 2 },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  main: { maxWidth: 560, margin: '0 auto', padding: '24px 16px 60px' },
  card: {
    background: '#fff', borderRadius: 14, padding: '28px 22px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  titulo:    { fontSize: 22, fontWeight: 800, margin: '0 0 8px' },
  subtitulo: { fontSize: 14, color: '#555', margin: '0 0 8px' },
  saudacao: { fontSize: 15, color: '#444', margin: '0 0 4px' },
  atendente: { fontSize: 14, color: '#666', margin: '0 0 20px' },
  starsWrap: { display: 'flex', justifyContent: 'center', gap: 6, margin: '8px 0' },
  star: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 44, lineHeight: 1, padding: 0,
    transition: 'color 0.12s, transform 0.12s',
    fontFamily: 'inherit',
  },
  notaLabel: { fontSize: 14, fontWeight: 600, color: '#555', margin: '4px 0 16px', minHeight: 18 },
  textarea: {
    width: '100%', borderRadius: 10, border: '1.5px solid #E0E0E0',
    padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
    resize: 'vertical', boxSizing: 'border-box', minHeight: 96,
    outline: 'none', marginTop: 8,
  },
  btnEnviar: {
    width: '100%', marginTop: 18, padding: '14px',
    borderRadius: 10, border: 'none', color: '#fff',
    fontWeight: 700, fontSize: 16, fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  doneBox: {
    background: '#fff', borderRadius: 14, padding: '40px 24px',
    textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  doneIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 56, height: 56, borderRadius: '50%',
    background: '#F0FDF4', color: '#16A34A',
    fontSize: 32, fontWeight: 800, marginBottom: 12,
  },
  doneTitle: { fontSize: 19, fontWeight: 700, margin: '0 0 8px' },
  doneSub:   { fontSize: 14, color: '#666', margin: '2px 0' },
};
