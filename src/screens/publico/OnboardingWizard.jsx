import { useState } from 'react';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const CALENDLY_URL = 'https://calendly.com/wandson-consultdelivery';
const WHATSAPP_URL = 'https://wa.me/5511940000000';

const PACOTES = {
  light: {
    label: 'Light',
    emoji: '🌱',
    preco: 'R$500/mês',
    descricao: 'Gestão iFood completa, relatórios semanais e suporte prioritário. Ideal para quem está começando.',
    cor: '#22C55E',
    corBg: '#F0FDF4',
  },
  performance: {
    label: 'Performance',
    emoji: '🚀',
    preco: 'R$500 base + 12% do crescimento',
    descricao: 'Você paga mais só quando cresce mais. Modelo de parceria alinhado ao seu sucesso.',
    cor: '#2563EB',
    corBg: '#EFF6FF',
  },
  ia_growth: {
    label: 'IA Growth',
    emoji: '🤖',
    preco: 'R$2.500 setup + R$1.500/mês',
    descricao: 'Automação completa com IA no iFood. Para quem quer maximizar resultados com tecnologia.',
    cor: '#7C3AED',
    corBg: '#F5F3FF',
  },
};

const FATURAMENTOS = [
  { value: 'ate_10k',     label: 'Até R$10 mil' },
  { value: '10k_30k',     label: 'R$10k – R$30k' },
  { value: '30k_60k',     label: 'R$30k – R$60k' },
  { value: '60k_100k',    label: 'R$60k – R$100k' },
  { value: 'acima_100k',  label: 'Acima de R$100k' },
];

function calcularPacote(diag) {
  if (!diag.tem_ifood) return 'light';
  if (!diag.tem_metricas) return 'performance';
  if (diag.tem_equipe) return 'ia_growth';
  return 'performance';
}

export default function OnboardingWizard() {
  const [passo, setPasso] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [finalizado, setFinalizado] = useState(false);

  // Campos
  const [nomeContato, setNomeContato] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [faturamento, setFaturamento] = useState('');
  const [diag, setDiag] = useState({ tem_ifood: null, tem_metricas: null, tem_equipe: null });
  const [pacote, setPacote] = useState(null);

  async function apiPost(path, body) {
    const r = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(e.error || 'Erro desconhecido');
    }
    return r.json();
  }

  async function apiPatch(id, body) {
    const r = await fetch(`${BRIDGE_URL}/api/wizard/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(e.error || 'Erro desconhecido');
    }
    return r.json();
  }

  async function irPasso2() {
    if (!nomeContato.trim() || !email.trim()) {
      setErro('Preencha seu nome e e-mail para continuar.');
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const data = await apiPost('/api/wizard', {
        email: email.trim(),
        nome_contato: nomeContato.trim(),
        whatsapp: whatsapp.trim() || undefined,
      });
      setSessionId(data.id);
      setPasso(2);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function irPasso3() {
    setErro(null);
    setLoading(true);
    try {
      await apiPatch(sessionId, {
        passo: 2,
        nome_negocio:             nomeNegocio.trim() || undefined,
        cnpj:                     cnpj.trim()        || undefined,
        faturamento_mensal_range: faturamento        || undefined,
      });
      setPasso(3);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function irPasso4() {
    if (diag.tem_ifood === null || diag.tem_metricas === null || diag.tem_equipe === null) {
      setErro('Responda as 3 perguntas para continuar.');
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const pacoteCalc = calcularPacote(diag);
      setPacote(pacoteCalc);
      await apiPatch(sessionId, {
        passo: 3,
        diagnostico:       diag,
        pacote_recomendado: pacoteCalc,
      });
      setPasso(4);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function irPasso5() {
    setErro(null);
    setLoading(true);
    try {
      await apiPatch(sessionId, { passo: 4 });
      setPasso(5);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function finalizar() {
    setErro(null);
    setLoading(true);
    try {
      await apiPost(`/api/wizard/${sessionId}/finalizar`, {});
      setFinalizado(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (finalizado) {
    return (
      <div style={s.page}>
        <Header />
        <div style={s.center}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h2 style={s.titulo}>Pronto! Wandson vai entrar em contato.</h2>
          <p style={s.sub}>Você receberá um contato em breve pelo WhatsApp ou e-mail cadastrado.</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={s.btnPrimario}>
            Falar no WhatsApp agora
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <Header />
      <div style={s.progresso}>
        {[1,2,3,4,5].map(n => (
          <div key={n} style={{ ...s.progressoDot, ...(n <= passo ? s.progressoDotAtivo : {}) }} />
        ))}
      </div>

      <main style={s.main}>
        {erro && <div style={s.erroBox}>{erro}</div>}

        {passo === 1 && (
          <section style={s.card}>
            <h2 style={s.stepTitle}>Vamos começar 👋</h2>
            <p style={s.stepSub}>Cadastre-se em menos de 2 minutos e descubra qual pacote é ideal para você.</p>
            <label style={s.label}>Seu nome *</label>
            <input
              style={s.input} type="text" placeholder="Ex: João Silva"
              value={nomeContato} onChange={e => setNomeContato(e.target.value)}
              autoFocus
            />
            <label style={s.label}>E-mail *</label>
            <input
              style={s.input} type="email" placeholder="voce@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
            <label style={s.label}>WhatsApp</label>
            <input
              style={s.input} type="tel" placeholder="(11) 99999-9999"
              value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
            />
            <button style={s.btnPrimario} onClick={irPasso2} disabled={loading}>
              {loading ? 'Aguarde…' : 'Começar →'}
            </button>
          </section>
        )}

        {passo === 2 && (
          <section style={s.card}>
            <h2 style={s.stepTitle}>Sobre o seu negócio</h2>
            <p style={s.stepSub}>Essas informações nos ajudam a preparar uma proposta personalizada.</p>
            <label style={s.label}>Nome do restaurante / negócio</label>
            <input
              style={s.input} type="text" placeholder="Ex: Pizzaria do João"
              value={nomeNegocio} onChange={e => setNomeNegocio(e.target.value)}
              autoFocus
            />
            <label style={s.label}>CNPJ (opcional)</label>
            <input
              style={s.input} type="text" placeholder="00.000.000/0001-00"
              value={cnpj} onChange={e => setCnpj(e.target.value)}
            />
            <label style={s.label}>Faturamento mensal estimado</label>
            <div style={s.optGrid}>
              {FATURAMENTOS.map(f => (
                <button
                  key={f.value}
                  style={{ ...s.optBtn, ...(faturamento === f.value ? s.optBtnAtivo : {}) }}
                  onClick={() => setFaturamento(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={s.botoesRow}>
              <button style={s.btnSecundario} onClick={() => setPasso(1)}>← Voltar</button>
              <button style={s.btnPrimario} onClick={irPasso3} disabled={loading}>
                {loading ? 'Aguarde…' : 'Continuar →'}
              </button>
            </div>
          </section>
        )}

        {passo === 3 && (
          <section style={s.card}>
            <h2 style={s.stepTitle}>Diagnóstico rápido</h2>
            <p style={s.stepSub}>3 perguntas para entender seu momento atual.</p>
            <PerguntaSN
              pergunta="Seu negócio já está no iFood?"
              valor={diag.tem_ifood}
              onChange={v => setDiag(d => ({ ...d, tem_ifood: v }))}
            />
            <PerguntaSN
              pergunta="Você acompanha métricas do iFood regularmente?"
              valor={diag.tem_metricas}
              onChange={v => setDiag(d => ({ ...d, tem_metricas: v }))}
            />
            <PerguntaSN
              pergunta="Tem equipe dedicada à operação do iFood?"
              valor={diag.tem_equipe}
              onChange={v => setDiag(d => ({ ...d, tem_equipe: v }))}
            />
            <div style={s.botoesRow}>
              <button style={s.btnSecundario} onClick={() => setPasso(2)}>← Voltar</button>
              <button style={s.btnPrimario} onClick={irPasso4} disabled={loading}>
                {loading ? 'Aguarde…' : 'Ver resultado →'}
              </button>
            </div>
          </section>
        )}

        {passo === 4 && pacote && (
          <section style={s.card}>
            <h2 style={s.stepTitle}>Seu pacote ideal ✨</h2>
            <p style={s.stepSub}>Com base no seu perfil, recomendamos:</p>
            <div style={{
              ...s.pacoteCard,
              borderColor: PACOTES[pacote].cor,
              background:  PACOTES[pacote].corBg,
            }}>
              <div style={s.pacoteEmoji}>{PACOTES[pacote].emoji}</div>
              <div style={s.pacoteLabel}>{PACOTES[pacote].label}</div>
              <div style={{ ...s.pacotePreco, color: PACOTES[pacote].cor }}>
                {PACOTES[pacote].preco}
              </div>
              <div style={s.pacoteDesc}>{PACOTES[pacote].descricao}</div>
            </div>
            <p style={{ ...s.stepSub, marginTop: 16 }}>
              Quer conhecer todos os planos e tirar dúvidas com Wandson?
            </p>
            <div style={s.botoesRow}>
              <button style={s.btnSecundario} onClick={() => setPasso(3)}>← Voltar</button>
              <button style={s.btnPrimario} onClick={irPasso5} disabled={loading}>
                {loading ? 'Aguarde…' : 'Próximo →'}
              </button>
            </div>
          </section>
        )}

        {passo === 5 && (
          <section style={s.card}>
            <h2 style={s.stepTitle}>Agende uma conversa 📅</h2>
            <p style={s.stepSub}>
              Fale com Wandson e descubra como a Consult Delivery pode transformar os resultados do seu negócio.
            </p>
            <a href={CALENDLY_URL} target="_blank" rel="noreferrer" style={s.btnPrimario}>
              📅 Agendar reunião (Calendly)
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
              style={{ ...s.btnPrimario, background: '#22C55E', marginTop: 12 }}
            >
              💬 Chamar no WhatsApp
            </a>
            <button
              style={{ ...s.btnSecundario, marginTop: 12 }}
              onClick={finalizar}
              disabled={loading}
            >
              {loading ? 'Enviando…' : 'Já entrei em contato / Concluir'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header style={s.header}>
      <div style={s.headerInner}>
        <span style={s.logoMark}>CD</span>
        <span style={s.headerTitle}>Consult Delivery</span>
      </div>
    </header>
  );
}

function PerguntaSN({ pergunta, valor, onChange }) {
  return (
    <div style={s.snWrap}>
      <p style={s.snPergunta}>{pergunta}</p>
      <div style={s.snOpts}>
        <button
          style={{ ...s.snBtn, ...(valor === true  ? s.snBtnSim : {}) }}
          onClick={() => onChange(true)}
        >
          Sim
        </button>
        <button
          style={{ ...s.snBtn, ...(valor === false ? s.snBtnNao : {}) }}
          onClick={() => onChange(false)}
        >
          Não
        </button>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#F8F8F8',
    fontFamily: "'Montserrat', system-ui, sans-serif",
    color: '#1A1A1A',
  },
  header: {
    background: '#B70C00',
    padding: '14px 20px',
    position: 'sticky', top: 0, zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  headerInner: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480, margin: '0 auto' },
  logoMark: {
    background: '#fff', color: '#B70C00', fontWeight: 800,
    borderRadius: 6, padding: '2px 8px', fontSize: 13, letterSpacing: 1,
  },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  progresso: {
    display: 'flex', justifyContent: 'center', gap: 8, padding: '18px 0 0',
  },
  progressoDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#E5E5E5', transition: 'background 0.2s',
  },
  progressoDotAtivo: { background: '#B70C00' },
  main: { maxWidth: 480, margin: '0 auto', padding: '20px 16px 60px' },
  card: {
    background: '#fff', borderRadius: 14, padding: '24px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
  },
  stepTitle: { fontSize: 20, fontWeight: 700, margin: '0 0 6px' },
  stepSub: { fontSize: 14, color: '#555', margin: '0 0 20px', lineHeight: 1.6 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' },
  input: {
    display: 'block', width: '100%', padding: '11px 13px',
    borderRadius: 8, border: '1.5px solid #E0E0E0',
    fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box',
    marginBottom: 16, outline: 'none',
  },
  optGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20,
  },
  optBtn: {
    padding: '9px 14px', borderRadius: 8,
    border: '1.5px solid #E0E0E0', background: '#F5F5F5',
    color: '#333', fontWeight: 600, cursor: 'pointer', fontSize: 13,
    fontFamily: 'inherit', transition: 'all 0.15s',
  },
  optBtnAtivo: {
    border: '1.5px solid #B70C00', background: '#FFF0EF', color: '#B70C00',
  },
  btnPrimario: {
    display: 'block', width: '100%', padding: '14px',
    borderRadius: 10, border: 'none', background: '#B70C00',
    color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16,
    fontFamily: 'inherit', textAlign: 'center', textDecoration: 'none',
    marginTop: 8,
  },
  btnSecundario: {
    flex: 1, padding: '12px',
    borderRadius: 10, border: '1.5px solid #E0E0E0', background: '#F5F5F5',
    color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
    fontFamily: 'inherit',
  },
  botoesRow: { display: 'flex', gap: 10, marginTop: 8 },
  erroBox: {
    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 14,
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, padding: '60px 20px', textAlign: 'center', maxWidth: 480, margin: '0 auto',
  },
  titulo: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { fontSize: 15, color: '#555', margin: 0, lineHeight: 1.6 },
  pacoteCard: {
    borderRadius: 12, border: '2px solid', padding: '20px',
    textAlign: 'center', marginBottom: 8,
  },
  pacoteEmoji: { fontSize: 36, marginBottom: 8 },
  pacoteLabel: { fontSize: 22, fontWeight: 800, marginBottom: 4 },
  pacotePreco: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  pacoteDesc: { fontSize: 14, color: '#555', lineHeight: 1.6 },
  snWrap: { marginBottom: 18 },
  snPergunta: { fontSize: 14, fontWeight: 600, margin: '0 0 10px', color: '#222' },
  snOpts: { display: 'flex', gap: 10 },
  snBtn: {
    flex: 1, padding: '11px', borderRadius: 8,
    border: '1.5px solid #E0E0E0', background: '#F5F5F5',
    color: '#333', fontWeight: 600, cursor: 'pointer', fontSize: 14,
    fontFamily: 'inherit', transition: 'all 0.15s',
  },
  snBtnSim: { border: '1.5px solid #22C55E', background: '#F0FDF4', color: '#16A34A' },
  snBtnNao: { border: '1.5px solid #EF4444', background: '#FEF2F2', color: '#DC2626' },
};
