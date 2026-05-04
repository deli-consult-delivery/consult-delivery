import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import { createAnalise, listClientes, listAnalises, subscribeToAnalise } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import AnaliseResultado from '../components/AnaliseResultado.jsx';

function isValidDriveLink(url) {
  return /drive\.google\.com\/drive\/folders\//.test(url);
}

function tempoRelativo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  if (h < 24)   return `há ${h}h`;
  return `há ${d}d`;
}

function StatusDot({ status }) {
  const map = {
    pending:    { color: 'var(--g-300)', title: 'Aguardando' },
    processing: { color: '#F59E0B',      title: 'Gerando...' },
    done:       { color: '#10B981',      title: 'Concluída'  },
    error:      { color: '#EF4444',      title: 'Erro'       },
  };
  const s = map[status] || map.pending;
  return (
    <span title={s.title} style={{
      width: 8, height: 8, borderRadius: '50%',
      background: s.color, flexShrink: 0, display: 'inline-block',
      ...(status === 'processing' || status === 'pending'
        ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
    }} />
  );
}

// ── Formulário de disparo ─────────────────────────────────────────────────────

function AnaliseForm({ tenantDbId, clientes, loadingClientes, onAnaliseIniciada }) {
  const [clienteId, setClienteId]     = useState('');
  const [driveLink, setDriveLink]     = useState('');
  const [periodo, setPeriodo]         = useState('semanal');
  const [submitting, setSubmitting]   = useState(false);
  const [driveLinkError, setDriveLinkError] = useState('');
  const [error, setError]             = useState(null);

  const isFormValid = clienteId && driveLink && isValidDriveLink(driveLink);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clienteId) { setError({ title: 'Cliente obrigatório', message: 'Selecione um cliente.' }); return; }
    if (!driveLink || !isValidDriveLink(driveLink)) {
      setDriveLinkError('Cole um link válido do Google Drive (drive.google.com/drive/folders/...)');
      return;
    }
    setDriveLinkError('');
    setError(null);
    setSubmitting(true);

    let analise;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      analise = await createAnalise({ tenant_id: tenantDbId, cliente_id: clienteId, drive_link: driveLink, periodo, criado_por: user.id });
    } catch {
      setError({ title: 'Erro ao salvar', message: 'Não foi possível registrar a análise. Tente novamente.' });
      setSubmitting(false);
      return;
    }

    const WEBHOOK_URL   = import.meta.env.VITE_ANALISTA_WEBHOOK_URL;
    const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET;
    const clienteSelecionado = clientes.find(c => c.id === clienteId);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET || '' },
        body: JSON.stringify({
          job_id: analise.job_id, tenant_id: tenantDbId, cliente_id: clienteId,
          cliente_nome: clienteSelecionado?.name || '', drive_link: driveLink, periodo,
        }),
      });
      if (res.status !== 200 && res.status !== 202) throw new Error(`Webhook ${res.status}`);
      onAnaliseIniciada(analise.job_id, clienteSelecionado?.name || '');
      // Limpa o form para permitir nova análise imediatamente
      setClienteId('');
      setDriveLink('');
      setPeriodo('semanal');
    } catch {
      setError({ title: 'Erro ao disparar', message: 'Análise registrada mas não pôde ser iniciada. Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting}>
      <div className="card" style={{ padding: 28 }}>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="cliente-select" className="label" style={{ display: 'block', marginBottom: 6 }}>Cliente</label>
          <select id="cliente-select" className="input" value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            disabled={loadingClientes || submitting}
            style={{ width: '100%', cursor: loadingClientes || submitting ? 'not-allowed' : 'pointer' }}
          >
            {loadingClientes
              ? <option value="" disabled>Carregando clientes...</option>
              : <option value="" disabled>Selecione o cliente...</option>
            }
            {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!loadingClientes && clientes.length === 0 && (
            <p style={{ color: 'var(--g-400)', fontSize: 12, marginTop: 4 }}>
              Nenhum cliente encontrado. Cadastre clientes no CRM antes de iniciar uma análise.
            </p>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="drive-link" className="label" style={{ display: 'block', marginBottom: 6 }}>
            Link da Pasta no Google Drive
          </label>
          <input id="drive-link" type="url" className="input" value={driveLink}
            onChange={e => { setDriveLink(e.target.value); if (driveLinkError) setDriveLinkError(''); }}
            onBlur={() => {
              if (driveLink && !isValidDriveLink(driveLink))
                setDriveLinkError('Cole um link válido do Google Drive (drive.google.com/drive/folders/...)');
            }}
            placeholder="https://drive.google.com/drive/folders/..."
            disabled={submitting} style={{ width: '100%' }}
          />
          {driveLinkError && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{driveLinkError}</p>}
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 28px 0' }}>
          <legend className="label" style={{ display: 'block', marginBottom: 8 }}>Período</legend>
          <div style={{ display: 'flex', gap: 8 }}>
            {['diaria', 'semanal', 'mensal'].map(p => (
              <button key={p} type="button" onClick={() => setPeriodo(p)} disabled={submitting} style={{
                flex: 1, padding: '10px 0', borderRadius: 'var(--r-sm)',
                border: `1px solid ${periodo === p ? 'var(--red)' : 'var(--g-300)'}`,
                background: periodo === p ? 'var(--red)' : 'var(--white)',
                color: periodo === p ? 'white' : 'var(--g-700)',
                fontWeight: 600, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1, transition: 'all 150ms var(--ease-out)',
              }}>
                {{ diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[p]}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn-primary"
          disabled={submitting || !isFormValid}
          style={{
            width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8,
            opacity: (submitting || !isFormValid) ? 0.5 : 1,
            cursor: (submitting || !isFormValid) ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? (
            <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} /> Iniciando...</>
          ) : (
            <><Icon name="chart" size={15} /> Iniciar Análise</>
          )}
        </button>

        {error && (
          <div className="card fade-in" role="alert" style={{ padding: 16, marginTop: 12, background: 'var(--red-soft)', border: '1px solid var(--red-soft)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 2 }}>{error.title}</p>
            <p style={{ fontSize: 12, color: 'var(--red)', opacity: 0.8 }}>{error.message}</p>
          </div>
        )}
      </div>
    </form>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

export default function AnaliseiFoodScreen({ tenant, tenantDbId }) {
  const [clientes, setClientes]               = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);

  const [analises, setAnalises]   = useState([]);       // histórico (lista completa)
  const [activeId, setActiveId]   = useState(null);     // job_id selecionado na sidebar
  const [showForm, setShowForm]   = useState(true);     // painel direito: form ou resultado

  // Map de jobs ativos: jobId → { clienteNome }
  const processingJobs = useRef(new Map());
  // Map de unsubscribes: jobId → fn
  const subscriptions  = useRef(new Map());

  // Carrega clientes
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingClientes(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClientes(r); setLoadingClientes(false); } })
      .catch(() => { if (alive) setLoadingClientes(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  // Carrega histórico de análises
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    listAnalises(tenantDbId).then(r => { if (alive) setAnalises(r); }).catch(() => {});
    return () => { alive = false; };
  }, [tenantDbId]);

  // Limpa todas as subscriptions ao desmontar
  useEffect(() => {
    return () => { subscriptions.current.forEach(fn => fn()); };
  }, []);

  // Inicia subscription para um job
  function startSubscription(jobId) {
    if (subscriptions.current.has(jobId)) return;
    const unsub = subscribeToAnalise(jobId, row => {
      if (row.status === 'done' || row.status === 'error') {
        processingJobs.current.delete(jobId);
        // Para o unsubscribe depois de um tick para evitar loop
        setTimeout(() => {
          subscriptions.current.get(jobId)?.();
          subscriptions.current.delete(jobId);
        }, 100);
        // Atualiza a lista: substitui o item com o row novo
        setAnalises(prev => prev.map(a => a.job_id === jobId
          ? { ...a, status: row.status, resultado_json: row.resultado_json, mensagem_whatsapp: row.mensagem_whatsapp }
          : a
        ));
        // Seleciona automaticamente se não há seleção ativa
        setActiveId(prev => prev === jobId || prev === null ? jobId : prev);
        setShowForm(false);
      }
    });
    subscriptions.current.set(jobId, unsub);
  }

  // Chamado pelo AnaliseForm quando análise é disparada com sucesso
  function handleAnaliseIniciada(jobId, clienteNome) {
    processingJobs.current.set(jobId, { clienteNome });
    // Adiciona na lista local imediatamente como pending
    setAnalises(prev => [{
      job_id: jobId,
      status: 'pending',
      created_at: new Date().toISOString(),
      periodo: null,
      cliente: { name: clienteNome },
    }, ...prev]);
    setActiveId(jobId);
    setShowForm(false);
    startSubscription(jobId);
  }

  // Restabelece subscriptions para jobs que ainda estão processando ao montar
  useEffect(() => {
    analises.forEach(a => {
      if (a.status === 'pending' || a.status === 'processing') {
        startSubscription(a.job_id);
      }
    });
  }, [analises.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const analiseAtiva = analises.find(a => a.job_id === activeId);
  const isProcessing = analiseAtiva && (analiseAtiva.status === 'pending' || analiseAtiva.status === 'processing');

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--r-md)',
          background: 'linear-gradient(135deg, #EA1D2C, #C4111F)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 22, flexShrink: 0,
        }}>🍔</div>
        <div>
          <h1 className="page-h1">Análise iFood</h1>
          <p className="page-sub">Co-piloto Delivery — análise de desempenho de lojas</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Sidebar histórico ──────────────────────────────── */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

          <button type="button" className="btn-primary"
            onClick={() => setShowForm(true)}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nova Análise
          </button>

          {analises.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--g-400)', textAlign: 'center', padding: '16px 8px' }}>
              Nenhuma análise ainda.<br />Clique em Nova Análise para começar.
            </p>
          ) : (
            analises.map(a => {
              const isActive  = a.job_id === activeId && !showForm;
              const clienteNome = a.cliente?.name || 'Cliente';
              const periodoLabel = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[a.periodo] || '';
              return (
                <button key={a.job_id} type="button"
                  onClick={() => { setActiveId(a.job_id); setShowForm(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${isActive ? 'var(--red)' : 'var(--g-200)'}`,
                    background: isActive ? '#FEF2F2' : 'var(--white)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot status={a.status} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {clienteNome}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14 }}>
                    {periodoLabel && <span style={{ fontSize: 11, color: 'var(--g-400)' }}>{periodoLabel}</span>}
                    <span style={{ fontSize: 11, color: 'var(--g-400)' }}>{tempoRelativo(a.created_at)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ── Painel principal ───────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {showForm && (
            <AnaliseForm
              tenantDbId={tenantDbId}
              clientes={clientes}
              loadingClientes={loadingClientes}
              onAnaliseIniciada={handleAnaliseIniciada}
            />
          )}

          {!showForm && isProcessing && (
            <div className="card fade-in" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, border: '4px solid var(--g-200)',
                borderTopColor: 'var(--red)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 20px',
              }} />
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)', marginBottom: 8 }}>
                Análise em andamento
              </h2>
              <p style={{ fontSize: 14, color: 'var(--g-500)', maxWidth: 360, margin: '0 auto 24px' }}>
                Isso pode levar até 2 minutos. Você pode iniciar outra análise enquanto espera.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', maxWidth: 320, margin: '0 auto' }}>
                {['Lendo pasta do Drive', 'Analisando com IA', 'Salvando resultados'].map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: 'var(--g-600)' }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--g-400)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showForm && analiseAtiva?.status === 'error' && (
            <div className="card fade-in" role="alert" style={{ padding: 24, border: '1px solid var(--red-soft)', background: 'var(--red-soft)' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Erro na análise</p>
              <p style={{ fontSize: 13, color: 'var(--red)', opacity: 0.8 }}>
                {analiseAtiva.error_message || 'A análise encontrou um erro. Tente novamente.'}
              </p>
            </div>
          )}

          {!showForm && analiseAtiva?.status === 'done' && (
            <AnaliseResultado
              resultado_json={analiseAtiva.resultado_json}
              mensagem_whatsapp={analiseAtiva.mensagem_whatsapp}
              tenantDbId={tenantDbId}
            />
          )}

          {!showForm && !analiseAtiva && analises.length > 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--g-400)', fontSize: 14 }}>Selecione uma análise no histórico ao lado.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
