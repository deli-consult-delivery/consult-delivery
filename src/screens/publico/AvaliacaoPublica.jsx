import { useState, useEffect } from 'react';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const ESTRELAS = [1, 2, 3, 4, 5];

// Estados possíveis da tela
const TELA = {
  LOADING:       'loading',
  ERRO:          'erro',
  JA_RESPONDIDA: 'ja_respondida',
  FORMULARIO:    'formulario',
  SUCESSO:       'sucesso',
};

export default function AvaliacaoPublica() {
  const token = window.location.pathname.replace(/^\/avaliacao\//, '').split('/')[0];

  const [tela, setTela]           = useState(TELA.LOADING);
  const [dados, setDados]         = useState(null);   // { atendente_nome?, loja_nome? }
  const [erroMsg, setErroMsg]     = useState('');
  const [nota, setNota]           = useState(0);
  const [hover, setHover]         = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando]   = useState(false);

  useEffect(() => {
    if (!token) {
      setErroMsg('Token não encontrado na URL.');
      setTela(TELA.ERRO);
      return;
    }

    fetch(`${BRIDGE_URL}/api/publico/avaliacao/${encodeURIComponent(token)}`)
      .then(r => {
        if (r.status === 409) return Promise.reject('ja_respondida');
        if (!r.ok) return r.json().then(e => Promise.reject(e.error || 'Erro desconhecido'));
        return r.json();
      })
      .then(d => {
        setDados(d);
        setTela(TELA.FORMULARIO);
      })
      .catch(e => {
        if (e === 'ja_respondida') {
          setTela(TELA.JA_RESPONDIDA);
        } else {
          setErroMsg(String(e));
          setTela(TELA.ERRO);
        }
      });
  }, [token]);

  async function enviar() {
    if (!nota || enviando) return;
    setEnviando(true);

    try {
      const r = await fetch(
        `${BRIDGE_URL}/api/publico/avaliacao/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nota, comentario: comentario.trim() || undefined }),
        }
      );

      if (r.status === 409) { setTela(TELA.JA_RESPONDIDA); return; }

      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || 'Erro ao enviar avaliação');
      }

      setTela(TELA.SUCESSO);
    } catch (err) {
      setErroMsg(err.message);
      setTela(TELA.ERRO);
    } finally {
      setEnviando(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (tela === TELA.LOADING) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={styles.loadingText}>Carregando…</p>
    </div>
  );

  // ── Erro / Expirado ───────────────────────────────────────────────────────
  if (tela === TELA.ERRO) return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Avaliação de atendimento</span>
        </div>
      </header>
      <div style={styles.center}>
        <p style={styles.errorTitle}>Link inválido ou expirado</p>
        <p style={styles.errorSub}>
          {erroMsg || 'Este link não é mais válido. Entre em contato com sua consultoria.'}
        </p>
      </div>
    </div>
  );

  // ── Já respondida ─────────────────────────────────────────────────────────
  if (tela === TELA.JA_RESPONDIDA) return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Avaliação de atendimento</span>
        </div>
      </header>
      <div style={styles.bodyWrap}>
        <div style={styles.card}>
          <p style={styles.emojiGrande} role="img" aria-label="Já respondida">✅</p>
          <h2 style={styles.cardTitulo}>Você já avaliou este atendimento</h2>
          <p style={styles.cardSub}>
            Sua resposta já foi registrada. Obrigado pelo feedback!
          </p>
        </div>
      </div>
    </div>
  );

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (tela === TELA.SUCESSO) return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Avaliação de atendimento</span>
        </div>
      </header>
      <div style={styles.bodyWrap}>
        <div style={styles.card}>
          <p style={styles.emojiGrande} role="img" aria-label="Obrigado">🙏</p>
          <h2 style={styles.cardTitulo}>Obrigado pela avaliação!</h2>
          <p style={styles.cardSub}>
            Seu feedback é muito importante para continuarmos melhorando o atendimento.
          </p>
          <div style={styles.estrelasSucesso}>
            {ESTRELAS.map(n => (
              <span
                key={n}
                style={{ ...styles.estrelaSucesso, color: n <= nota ? '#F59E0B' : '#D1D5DB' }}
                aria-hidden="true"
              >
                ★
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Formulário ────────────────────────────────────────────────────────────
  const notaAtiva = hover || nota;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Avaliação de atendimento</span>
        </div>
      </header>

      <div style={styles.bodyWrap}>
        <div style={styles.card}>
          <h1 style={styles.pergunta}>Como foi seu atendimento?</h1>

          {dados?.atendente_nome && (
            <p style={styles.atendente}>
              Atendimento de <strong>{dados.atendente_nome}</strong>
            </p>
          )}

          {/* Estrelas */}
          <div
            style={styles.estrelasWrap}
            role="group"
            aria-label="Nota de 1 a 5 estrelas"
            onMouseLeave={() => setHover(0)}
          >
            {ESTRELAS.map(n => (
              <button
                key={n}
                type="button"
                style={{
                  ...styles.estrelaBtn,
                  color: n <= notaAtiva ? '#F59E0B' : '#D1D5DB',
                  transform: n <= notaAtiva ? 'scale(1.15)' : 'scale(1)',
                }}
                aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                aria-pressed={nota === n}
                onMouseEnter={() => setHover(n)}
                onClick={() => setNota(n)}
              >
                ★
              </button>
            ))}
          </div>

          {nota > 0 && (
            <p style={styles.notaLabel} aria-live="polite">
              {LABELS_NOTA[nota]}
            </p>
          )}

          {/* Comentário */}
          <label htmlFor="comentario" style={styles.labelComentario}>
            Comentário
          </label>
          <textarea
            id="comentario"
            style={styles.textarea}
            placeholder="Conte rapidinho o que motivou sua nota (opcional)"
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={4}
          />

          {/* Botão enviar */}
          <button
            type="button"
            style={{
              ...styles.btnEnviar,
              ...(nota === 0 || enviando ? styles.btnEnviarDisabled : {}),
            }}
            onClick={enviar}
            disabled={nota === 0 || enviando}
            aria-disabled={nota === 0 || enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar avaliação'}
          </button>

          {/* LGPD */}
          <p style={styles.lgpd}>
            Seus dados são usados apenas para avaliar este atendimento.
          </p>
        </div>
      </div>
    </div>
  );
}

const LABELS_NOTA = {
  1: 'Muito insatisfeito',
  2: 'Insatisfeito',
  3: 'Neutro',
  4: 'Satisfeito',
  5: 'Muito satisfeito',
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F8F8F8',
    fontFamily: "'Montserrat', system-ui, sans-serif",
    color: '#1A1A1A',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '80vh', gap: 12,
    padding: '24px 20px',
    fontFamily: "'Montserrat', system-ui, sans-serif",
    textAlign: 'center',
  },
  spinner: {
    width: 40, height: 40,
    border: '3px solid #E5E5E5',
    borderTop: '3px solid #B70C00',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#666', fontSize: 14, margin: 0 },
  errorTitle:  { color: '#B70C00', fontSize: 18, fontWeight: 700, margin: 0 },
  errorSub:    { color: '#666', fontSize: 14, margin: 0, maxWidth: 320 },
  header: {
    background: '#B70C00',
    padding: '14px 20px',
    position: 'sticky', top: 0,
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  headerInner: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480, margin: '0 auto' },
  logoMark: {
    background: '#fff', color: '#B70C00', fontWeight: 800,
    borderRadius: 6, padding: '2px 8px', fontSize: 13, letterSpacing: 1,
  },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  bodyWrap: {
    display: 'flex', justifyContent: 'center',
    padding: '32px 16px 60px',
  },
  card: {
    background: '#fff', borderRadius: 16,
    padding: '32px 24px',
    maxWidth: 480, width: '100%',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    border: '1px solid #EBEBEB',
    textAlign: 'center',
  },
  emojiGrande: { fontSize: 52, margin: '0 0 16px', lineHeight: 1 },
  cardTitulo: { fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: '#1A1A1A' },
  cardSub:    { fontSize: 14, color: '#666', margin: 0, lineHeight: 1.6 },
  pergunta: {
    fontSize: 22, fontWeight: 800, margin: '0 0 8px',
    color: '#1A1A1A', lineHeight: 1.3,
  },
  atendente: {
    fontSize: 14, color: '#666', margin: '0 0 24px',
  },
  estrelasWrap: {
    display: 'flex', justifyContent: 'center', gap: 8,
    margin: '20px 0 8px',
  },
  estrelaBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 42,
    /* alvo de toque ≥ 44px */
    minWidth: 48, minHeight: 48,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
    transition: 'color 0.12s, transform 0.12s',
  },
  notaLabel: {
    fontSize: 13, fontWeight: 600, color: '#B70C00',
    margin: '4px 0 16px', minHeight: 18,
  },
  estrelasSucesso: {
    display: 'flex', justifyContent: 'center', gap: 6,
    marginTop: 20,
  },
  estrelaSucesso: { fontSize: 32, lineHeight: 1 },
  labelComentario: {
    display: 'block', textAlign: 'left',
    fontSize: 13, fontWeight: 600, color: '#444',
    margin: '16px 0 6px',
  },
  textarea: {
    width: '100%', borderRadius: 10,
    border: '1.5px solid #E0E0E0',
    padding: '12px 14px', fontSize: 15,
    fontFamily: "'Montserrat', system-ui, sans-serif",
    resize: 'vertical', boxSizing: 'border-box',
    minHeight: 100, outline: 'none',
    color: '#1A1A1A',
  },
  btnEnviar: {
    width: '100%', marginTop: 20,
    padding: '15px 0', borderRadius: 10,
    border: 'none', background: '#B70C00',
    color: '#fff', fontWeight: 800,
    fontSize: 16, cursor: 'pointer',
    fontFamily: "'Montserrat', system-ui, sans-serif",
    transition: 'opacity 0.15s',
  },
  btnEnviarDisabled: {
    background: '#D1D5DB', cursor: 'not-allowed', opacity: 0.7,
  },
  lgpd: {
    fontSize: 11, color: '#AAA',
    margin: '14px 0 0', lineHeight: 1.5,
  },
};
