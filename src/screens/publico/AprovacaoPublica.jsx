import { useState, useEffect } from 'react';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const BLOCO_LABEL = {
  identidade: 'Identidade',
  cardapio:   'Cardápio',
  operacao:   'Operação',
  avaliacoes: 'Avaliações',
  marketing:  'Marketing',
  suporte:    'Suporte',
};

const STATUS_LABEL = {
  aprovada:             'Aprovada',
  rejeitada:            'Recusada',
  aguardando_aprovacao: 'Aguardando aprovação',
  rascunho:             'Rascunho',
  concluida:            'Concluída',
};

export default function AprovacaoPublica() {
  const token = window.location.pathname.replace(/^\/aprovacao\//, '').split('/')[0];

  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);

  // Modal state
  const [modal, setModal]       = useState(null); // { tarefaId, acao: 'aceitar'|'recusar'|'duvida' }
  const [texto, setTexto]       = useState('');
  const [submitting, setSubmit] = useState(false);
  const [done, setDone]         = useState({}); // tarefaId → 'aprovada'|'rejeitada'|'duvida'

  useEffect(() => {
    if (!token) { setError('Token não encontrado na URL.'); setLoading(false); return; }

    fetch(`${BRIDGE_URL}/api/publico/aprovacao/${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Erro desconhecido')))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [token]);

  function openModal(tarefaId, acao) {
    setTexto('');
    setModal({ tarefaId, acao });
  }

  async function submitModal() {
    if (!modal) return;
    const { tarefaId, acao } = modal;

    if ((acao === 'recusar' || acao === 'duvida') && !texto.trim()) return;

    setSubmit(true);
    try {
      const body = acao === 'aceitar'
        ? { observacao: texto.trim() || undefined }
        : acao === 'recusar'
          ? { motivo: texto.trim() }
          : { pergunta: texto.trim() };

      const r = await fetch(
        `${BRIDGE_URL}/api/publico/aprovacao/${encodeURIComponent(token)}/tarefa/${encodeURIComponent(tarefaId)}/${acao}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || 'Erro ao enviar');
      }

      setDone(prev => ({ ...prev, [tarefaId]: acao }));
      setModal(null);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setSubmit(false);
    }
  }

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={styles.loadingText}>Carregando análise…</p>
    </div>
  );

  if (error) return (
    <div style={styles.center}>
      <p style={styles.errorText}>Link inválido ou expirado.</p>
      <p style={styles.errorSub}>{error}</p>
    </div>
  );

  const { loja_nome, loom_url, resumo_executivo, tarefas = [] } = data;

  const byBloco = tarefas.reduce((acc, t) => {
    const b = t.bloco || 'geral';
    if (!acc[b]) acc[b] = [];
    acc[b].push(t);
    return acc;
  }, {});

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logoMark}>CD</span>
          <span style={styles.headerTitle}>Análise — {loja_nome}</span>
        </div>
      </header>

      <main style={styles.main}>
        {loom_url && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Vídeo da análise</h2>
            <div style={styles.loomWrap}>
              <iframe
                src={loomEmbedUrl(loom_url)}
                style={styles.loomFrame}
                frameBorder="0"
                allowFullScreen
                title="Análise em vídeo"
              />
            </div>
          </section>
        )}

        {resumo_executivo && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Resumo executivo</h2>
            <p style={styles.resumo}>{resumo_executivo}</p>
          </section>
        )}

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Tarefas para aprovação</h2>
          <p style={styles.instrucao}>
            Revise cada item e clique para Aceitar, Recusar ou enviar uma Dúvida.
          </p>

          {Object.entries(byBloco).map(([bloco, list]) => (
            <div key={bloco} style={styles.blocoWrap}>
              <h3 style={styles.blocoTitle}>{BLOCO_LABEL[bloco] || bloco.toUpperCase()}</h3>
              {list.map(tarefa => {
                const resultado = done[tarefa.id];
                const jaDecidida = resultado || !['aguardando_aprovacao', 'rascunho'].includes(tarefa.status);

                return (
                  <div key={tarefa.id} style={{
                    ...styles.tarefaCard,
                    ...(resultado === 'aceitar' ? styles.cardAceita : {}),
                    ...(resultado === 'recusar' ? styles.cardRecusada : {}),
                    ...(resultado === 'duvida'  ? styles.cardDuvida : {}),
                  }}>
                    <div style={styles.tarefaHeader}>
                      <span style={styles.tarefaTitulo}>{tarefa.titulo}</span>
                      {(resultado || tarefa.status !== 'aguardando_aprovacao') && (
                        <span style={styles.statusBadge}>
                          {resultado
                            ? (resultado === 'aceitar' ? '✅ Aceita' : resultado === 'recusar' ? '❌ Recusada' : '❓ Dúvida enviada')
                            : (STATUS_LABEL[tarefa.status] || tarefa.status)}
                        </span>
                      )}
                    </div>
                    {tarefa.descricao && (
                      <p style={styles.tarefaDesc}>{tarefa.descricao}</p>
                    )}

                    {!jaDecidida && (
                      <div style={styles.botoesWrap}>
                        <button style={styles.btnAceitar} onClick={() => openModal(tarefa.id, 'aceitar')}>
                          ✅ Aceitar
                        </button>
                        <button style={styles.btnRecusar} onClick={() => openModal(tarefa.id, 'recusar')}>
                          ❌ Recusar
                        </button>
                        <button style={styles.btnDuvida} onClick={() => openModal(tarefa.id, 'duvida')}>
                          ❓ Dúvida
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      </main>

      {modal && (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {modal.acao === 'aceitar' ? '✅ Aceitar tarefa'
                : modal.acao === 'recusar' ? '❌ Recusar tarefa'
                : '❓ Enviar dúvida'}
            </h3>
            <textarea
              style={styles.modalTextarea}
              placeholder={
                modal.acao === 'aceitar' ? 'Observação (opcional)…'
                  : modal.acao === 'recusar' ? 'Motivo (obrigatório)…'
                  : 'Sua dúvida (obrigatório)…'
              }
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              autoFocus
            />
            <div style={styles.modalBotoes}>
              <button style={styles.btnCancelar} onClick={() => setModal(null)} disabled={submitting}>
                Cancelar
              </button>
              <button
                style={{
                  ...styles.btnConfirmar,
                  ...(modal.acao === 'recusar' ? styles.btnConfirmarRed : {}),
                  ...(modal.acao === 'duvida'  ? styles.btnConfirmarYellow : {}),
                }}
                onClick={submitModal}
                disabled={submitting || ((modal.acao === 'recusar' || modal.acao === 'duvida') && !texto.trim())}
              >
                {submitting ? 'Enviando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function loomEmbedUrl(url) {
  if (!url) return '';
  // https://www.loom.com/share/ID → https://www.loom.com/embed/ID
  return url.replace('loom.com/share/', 'loom.com/embed/');
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
    justifyContent: 'center', height: '100vh', gap: 12,
    fontFamily: "'Montserrat', system-ui, sans-serif",
  },
  spinner: {
    width: 40, height: 40,
    border: '3px solid #E5E5E5',
    borderTop: '3px solid #B70C00',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#666', fontSize: 14, margin: 0 },
  errorText:   { color: '#B70C00', fontSize: 18, fontWeight: 700, margin: 0 },
  errorSub:    { color: '#666', fontSize: 13, margin: 0 },
  header: {
    background: '#B70C00',
    padding: '14px 20px',
    position: 'sticky', top: 0,
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  headerInner: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 720, margin: '0 auto' },
  logoMark: {
    background: '#fff', color: '#B70C00', fontWeight: 800,
    borderRadius: 6, padding: '2px 8px', fontSize: 13, letterSpacing: 1,
  },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  main: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#1A1A1A' },
  loomWrap: {
    position: 'relative', paddingTop: '56.25%', /* 16:9 */
    background: '#000', borderRadius: 10, overflow: 'hidden',
  },
  loomFrame: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    border: 'none',
  },
  resumo: { fontSize: 15, lineHeight: 1.7, color: '#333', margin: 0 },
  instrucao: { fontSize: 13, color: '#666', marginBottom: 16 },
  blocoWrap: { marginBottom: 28 },
  blocoTitle: {
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#888', marginBottom: 12, margin: '0 0 12px 0',
  },
  tarefaCard: {
    background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12,
    border: '1.5px solid #E8E8E8',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardAceita:  { borderColor: '#22C55E', background: '#F0FDF4' },
  cardRecusada:{ borderColor: '#EF4444', background: '#FEF2F2' },
  cardDuvida:  { borderColor: '#F59E0B', background: '#FFFBEB' },
  tarefaHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  tarefaTitulo:{ fontSize: 15, fontWeight: 600, flex: 1 },
  statusBadge: { fontSize: 11, color: '#666', whiteSpace: 'nowrap' },
  tarefaDesc:  { fontSize: 13, color: '#555', margin: '4px 0 12px', lineHeight: 1.5 },
  botoesWrap:  { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  btnAceitar: {
    flex: 1, minWidth: 90, padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #22C55E', background: '#F0FDF4',
    color: '#16A34A', fontWeight: 700, cursor: 'pointer', fontSize: 14,
    fontFamily: 'inherit',
  },
  btnRecusar: {
    flex: 1, minWidth: 90, padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #EF4444', background: '#FEF2F2',
    color: '#DC2626', fontWeight: 700, cursor: 'pointer', fontSize: 14,
    fontFamily: 'inherit',
  },
  btnDuvida: {
    flex: 1, minWidth: 90, padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #F59E0B', background: '#FFFBEB',
    color: '#D97706', fontWeight: 700, cursor: 'pointer', fontSize: 14,
    fontFamily: 'inherit',
  },
  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100, padding: '0 0 0 0',
  },
  modalBox: {
    background: '#fff', borderRadius: '16px 16px 0 0',
    padding: '24px 20px 32px', width: '100%', maxWidth: 720,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
  },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16, margin: '0 0 16px' },
  modalTextarea: {
    width: '100%', borderRadius: 8, border: '1.5px solid #E0E0E0',
    padding: '10px 12px', fontSize: 15, fontFamily: 'inherit',
    resize: 'vertical', boxSizing: 'border-box', minHeight: 100,
    outline: 'none',
  },
  modalBotoes: { display: 'flex', gap: 10, marginTop: 16 },
  btnCancelar: {
    flex: 1, padding: '12px', borderRadius: 8,
    border: '1.5px solid #E0E0E0', background: '#F5F5F5',
    color: '#444', fontWeight: 600, cursor: 'pointer', fontSize: 15,
    fontFamily: 'inherit',
  },
  btnConfirmar: {
    flex: 2, padding: '12px', borderRadius: 8,
    border: 'none', background: '#22C55E',
    color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15,
    fontFamily: 'inherit',
  },
  btnConfirmarRed:    { background: '#EF4444' },
  btnConfirmarYellow: { background: '#F59E0B', color: '#1A1A1A' },
};
