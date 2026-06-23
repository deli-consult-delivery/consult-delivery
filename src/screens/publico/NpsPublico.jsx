import { useState, useEffect } from 'react';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const NOTAS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const TELA = {
  LOADING:       'loading',
  ERRO:          'erro',
  JA_RESPONDIDA: 'ja_respondida',
  FORMULARIO:    'formulario',
  SUCESSO:       'sucesso',
};

export default function NpsPublico() {
  const token = window.location.pathname.replace(/^\/nps\//, '').split('/')[0];

  const [tela, setTela]               = useState(TELA.LOADING);
  const [dados, setDados]             = useState(null);
  const [erroMsg, setErroMsg]         = useState('');
  const [nota, setNota]               = useState(null);
  const [comentario, setComentario]   = useState('');
  const [enviando, setEnviando]       = useState(false);

  useEffect(() => {
    if (!token) {
      setErroMsg('Token não encontrado na URL.');
      setTela(TELA.ERRO);
      return;
    }

    fetch(`${BRIDGE_URL}/api/publico/nps/${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(e.erro || e.error || 'Erro desconhecido'));
        return r.json();
      })
      .then(d => {
        if (d.ja_respondida) { setTela(TELA.JA_RESPONDIDA); return; }
        setDados(d);
        setTela(TELA.FORMULARIO);
      })
      .catch(e => {
        if (String(e) === 'link_expirado') {
          setErroMsg('Este link expirou.');
          setTela(TELA.ERRO);
        } else {
          setErroMsg(String(e));
          setTela(TELA.ERRO);
        }
      });
  }, [token]);

  async function enviar() {
    if (nota === null || enviando) return;
    setEnviando(true);

    try {
      const r = await fetch(
        `${BRIDGE_URL}/api/publico/nps/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nota, comentario: comentario.trim() || undefined }),
        }
      );

      if (!r.ok) {
        const e = await r.json();
        if (e.erro === 'ja_respondida') { setTela(TELA.JA_RESPONDIDA); return; }
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

  const nomeLoja = dados?.nome_loja ?? 'nossa empresa';

  // ── Loading ───────────────────────────────────────────────────────────────
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
          <span style={styles.headerTitle}>Pesquisa NPS</span>
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
          <span style={styles.headerTitle}>Pesquisa NPS</span>
        </div>
      </header>
      <div style={styles.bodyWrap}>
        <div style={styles.card}>
          <p style={styles.emojiGrande} role="img" aria-label="Já respondida">✅</p>
          <h2 style={styles.cardTitulo}>Você já respondeu esta pesquisa</h2>
          <p style={styles.cardSub}>
            Sua resposta já foi registrada. Obrigado pelo feedback!
          </p>
        </div>
      </div>
    </div>
  );

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (tela === TELA.SUCESSO) {
    const categoria = nota >= 9 ? { label: 'Promotor', emoji: '🥳', cor: '#10B981' }
                    : nota >= 7 ? { label: 'Passivo',   emoji: '😊', cor: '#F59E0B' }
                                : { label: 'Detrator',  emoji: '😔', cor: '#EF4444' };
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <span style={styles.logoMark}>CD</span>
            <span style={styles.headerTitle}>Pesquisa NPS</span>
          </div>
        </header>
        <div style={styles.bodyWrap}>
          <div style={styles.card}>
            <p style={styles.emojiGrande} role="img" aria-label={categoria.label}>{categoria.emoji}</p>
            <h2 style={styles.cardTitulo}>Obrigado pela sua resposta!</h2>
            <p style={styles.cardSub}>
              Sua opinião é muito importante para {nomeLoja} continuar melhorando.
            </p>
            <div style={{ ...styles.notaBadge, borderColor: categoria.cor, color: categoria.cor }}>
              {nota} / 10
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────
  const corNota = nota === null ? '#D1D5DB'
                : nota >= 9    ? '#10B981'
                : nota >= 7    ? '#F59E0B'
                                : '#EF4444';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Pesquisa NPS</span>
        </div>
      </header>

      <div style={styles.bodyWrap}>
        <div style={styles.card}>
          <h1 style={styles.pergunta}>
            De 0 a 10, qual a probabilidade de você indicar{' '}
            <strong>{nomeLoja}</strong> para um amigo ou colega?
          </h1>

          {/* Escala 0-10 */}
          <div style={styles.escalaMobile}>
            <div style={styles.escalaWrap} role="group" aria-label="Nota de 0 a 10">
              {NOTAS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  aria-label={`Nota ${n}`}
                  aria-pressed={nota === n}
                  style={{
                    ...styles.notaBtn,
                    background: nota === n ? corNota : '#F3F4F6',
                    color:      nota === n ? '#fff'  : '#374151',
                    borderColor: nota === n ? corNota : '#E5E7EB',
                    fontWeight: nota === n ? 800     : 500,
                    transform:  nota === n ? 'scale(1.12)' : 'scale(1)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={styles.escalaLabels}>
              <span style={styles.escalaLabelLeft}>Nada provável</span>
              <span style={styles.escalaLabelRight}>Muito provável</span>
            </div>
          </div>

          {nota !== null && (
            <p style={{ ...styles.notaLabel, color: corNota }} aria-live="polite">
              {LABELS_NOTA[nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator']}
            </p>
          )}

          {/* Comentário */}
          <label htmlFor="comentario" style={styles.labelComentario}>
            Comentário (opcional)
          </label>
          <textarea
            id="comentario"
            style={styles.textarea}
            placeholder="O que motivou sua nota?"
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={3}
          />

          {/* Botão enviar */}
          <button
            type="button"
            style={{
              ...styles.btnEnviar,
              ...(nota === null || enviando ? styles.btnEnviarDisabled : {}),
            }}
            onClick={enviar}
            disabled={nota === null || enviando}
            aria-disabled={nota === null || enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar resposta'}
          </button>

          {/* LGPD */}
          <p style={styles.lgpd}>
            Seus dados são utilizados exclusivamente para esta pesquisa de satisfação.
          </p>
        </div>
      </div>
    </div>
  );
}

const LABELS_NOTA = {
  promotor: 'Promotor — você adora a gente! 🥳',
  neutro:   'Passivo — obrigado pelo feedback!',
  detrator: 'Detrator — vamos trabalhar para melhorar 💪',
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
  headerInner: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 560, margin: '0 auto' },
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
    maxWidth: 560, width: '100%',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    border: '1px solid #EBEBEB',
    textAlign: 'center',
  },
  emojiGrande: { fontSize: 52, margin: '0 0 16px', lineHeight: 1 },
  cardTitulo: { fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: '#1A1A1A' },
  cardSub:    { fontSize: 14, color: '#666', margin: 0, lineHeight: 1.6 },
  pergunta: {
    fontSize: 20, fontWeight: 700, margin: '0 0 24px',
    color: '#1A1A1A', lineHeight: 1.4, textAlign: 'left',
  },
  escalaMobile: {
    width: '100%',
    marginBottom: 8,
  },
  escalaWrap: {
    display: 'flex', flexWrap: 'wrap',
    justifyContent: 'center', gap: 6,
    margin: '0 0 8px',
  },
  notaBtn: {
    width: 44, height: 44,
    borderRadius: 10,
    border: '1.5px solid',
    cursor: 'pointer',
    fontSize: 15,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.1s',
    fontFamily: "'Montserrat', system-ui, sans-serif",
  },
  escalaLabels: {
    display: 'flex', justifyContent: 'space-between',
    padding: '0 4px',
  },
  escalaLabelLeft:  { fontSize: 11, color: '#9CA3AF' },
  escalaLabelRight: { fontSize: 11, color: '#9CA3AF' },
  notaLabel: {
    fontSize: 13, fontWeight: 600,
    margin: '8px 0 16px', minHeight: 18,
  },
  notaBadge: {
    display: 'inline-block',
    marginTop: 20,
    padding: '8px 20px',
    borderRadius: 20,
    border: '2px solid',
    fontSize: 22, fontWeight: 800,
  },
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
    minHeight: 80, outline: 'none',
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
