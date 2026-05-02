import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import { createAnalise, listClientes, subscribeToAnalise } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

// ── Validação ────────────────────────────────────────────
function isValidDriveLink(url) {
  return /drive\.google\.com\/drive\/folders\//.test(url);
}

// TRIGGER-01 — Tela Análise iFood
export default function AnaliseiFoodScreen({ tenant, tenantDbId }) {
  // ── Form inputs ────────────────────────────────────────
  const [clienteId, setClienteId]   = useState('');
  const [driveLink, setDriveLink]   = useState('');
  const [periodo, setPeriodo]       = useState('semanal');

  // ── Data ──────────────────────────────────────────────
  const [clientes, setClientes]               = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);

  // ── Async flow ────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase]           = useState('idle'); // 'idle' | 'processing'
  const [jobId, setJobId]           = useState(null);
  const [error, setError]           = useState(null); // { title, message } | null

  // ── Validation ────────────────────────────────────────
  const [driveLinkError, setDriveLinkError] = useState('');

  // ── Carregamento de clientes ──────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingClientes(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClientes(r); setLoadingClientes(false); } })
      .catch(() => { if (alive) setLoadingClientes(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  // ── Realtime subscription ─────────────────────────────
  // Activo apenas quando jobId existe (fase processing).
  // Phase 3 usará o row.status para avançar os step indicators.
  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = subscribeToAnalise(jobId, row => {
      // Phase 3 will handle done/error transitions here.
      // For Phase 1, we only need the subscription wired.
      if (row.status === 'error') {
        setPhase('idle');
        setError({
          title: 'Erro na análise',
          message: row.error_message || 'A análise encontrou um erro. Tente novamente.',
        });
        setSubmitting(false);
      }
    });
    return unsubscribe;
  }, [jobId]);

  // ── Submit handler ────────────────────────────────────
  // TRIGGER-03: setSubmitting(true) fires BEFORE any await.
  // TRIGGER-04: INSERT analises row, then fire n8n webhook.
  async function handleSubmit(e) {
    e.preventDefault();

    // Client-side validation
    if (!clienteId) {
      setError({ title: 'Cliente obrigatório', message: 'Selecione um cliente para continuar.' });
      return;
    }
    if (!driveLink || !isValidDriveLink(driveLink)) {
      setDriveLinkError('Cole um link válido do Google Drive (drive.google.com/drive/folders/...)');
      return;
    }

    setDriveLinkError('');
    setError(null);
    setSubmitting(true); // TRIGGER-03: button disables HERE, before first await

    // Step 1: INSERT analises row (status: pending)
    let analise;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      analise = await createAnalise({
        tenant_id:  tenantDbId,
        cliente_id: clienteId,
        drive_link: driveLink,
        periodo,
        criado_por: user.id,
      });
      setJobId(analise.job_id);
    } catch (err) {
      setError({
        title: 'Erro ao iniciar análise',
        message: 'Não foi possível salvar a análise. Tente novamente.',
      });
      setSubmitting(false); // re-enable button on INSERT failure
      return;
    }

    // Step 2: Fire analista-ifood webhook (fire-and-forget — only confirm 200 OK)
    const WEBHOOK_URL = import.meta.env.VITE_ANALISTA_WEBHOOK_URL;
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:     analise.job_id,
          tenant_id:  tenantDbId,
          cliente_id: clienteId,
          drive_link: driveLink,
          periodo,
        }),
      });
      if (!res.ok) throw new Error(`Webhook respondeu ${res.status}`);
      setPhase('processing'); // show processing card, hide form
    } catch (err) {
      // Row already in DB with status=pending — webhook failed
      setError({
        title: 'Erro ao iniciar análise',
        message: 'A análise foi registrada mas não pôde ser disparada. Tente novamente.',
      });
      setSubmitting(false); // re-enable button for retry
    }
  }

  // ── Retry ──────────────────────────────────────────────
  function handleRetry() {
    setError(null);
    setSubmitting(false);
    setJobId(null);
    setPhase('idle');
    // Field values are preserved — user corrects and resubmits
  }

  // ── Form validity ─────────────────────────────────────
  const isFormValid = clienteId && driveLink && isValidDriveLink(driveLink);

  // ── Render ────────────────────────────────────────────
  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>

      {/* Screen Header */}
      <div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--r-md)',
            background: 'linear-gradient(135deg, #EA1D2C, #C4111F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 22, flexShrink: 0,
          }}>🍔</div>
          <div>
            <h1 className="page-h1">Análise iFood</h1>
            <p className="page-sub">Selecione um cliente e inicie a análise de desempenho</p>
          </div>
        </div>
      </div>

      {/* Processing Card — replaces form when phase === 'processing' */}
      {phase === 'processing' && (
        <div className="card fade-in" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48,
            border: '4px solid var(--g-200)',
            borderTopColor: 'var(--red)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 20px',
          }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)', marginBottom: 8 }}>
            Análise em andamento
          </h2>
          <p style={{ fontSize: 14, color: 'var(--g-500)', maxWidth: 360, margin: '0 auto' }}>
            Isso pode levar até 2 minutos. Não feche essa aba.
          </p>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', maxWidth: 320, margin: '24px auto 0' }}>
            {[
              { label: 'Lendo pasta do Drive' },
              { label: 'Analisando com IA' },
              { label: 'Salvando resultados' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  background: 'var(--g-200)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 10, color: 'var(--g-600)',
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: 'var(--g-400)' }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trigger Form — visible when phase === 'idle' */}
      {phase === 'idle' && (
        <form onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="card" style={{ padding: 28 }}>

            {/* Field 1: Client selector — TRIGGER-02 */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="cliente-select" className="label" style={{ display: 'block', marginBottom: 6 }}>
                Cliente
              </label>
              <select
                id="cliente-select"
                className="input"
                value={clienteId}
                onChange={e => setClienteId(e.target.value)}
                disabled={loadingClientes || submitting}
                style={{ width: '100%', cursor: loadingClientes || submitting ? 'not-allowed' : 'pointer' }}
              >
                {loadingClientes
                  ? <option value="" disabled>Carregando clientes...</option>
                  : <option value="" disabled>Selecione o cliente...</option>
                }
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!loadingClientes && clientes.length === 0 && (
                <p style={{ color: 'var(--g-400)', fontSize: 12, marginTop: 4 }}>
                  Nenhum cliente encontrado. Cadastre clientes no CRM antes de iniciar uma análise.
                </p>
              )}
            </div>

            {/* Field 2: Drive link — TRIGGER-02 */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="drive-link" className="label" style={{ display: 'block', marginBottom: 6 }}>
                Link da Pasta no Google Drive
              </label>
              <input
                id="drive-link"
                type="url"
                className="input"
                value={driveLink}
                onChange={e => { setDriveLink(e.target.value); if (driveLinkError) setDriveLinkError(''); }}
                onBlur={() => {
                  if (driveLink && !isValidDriveLink(driveLink)) {
                    setDriveLinkError('Cole um link válido do Google Drive (drive.google.com/drive/folders/...)');
                  }
                }}
                placeholder="https://drive.google.com/drive/folders/..."
                disabled={submitting}
                style={{ width: '100%' }}
              />
              {driveLinkError && (
                <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{driveLinkError}</p>
              )}
            </div>

            {/* Field 3: Period selector — TRIGGER-02 */}
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 28px 0' }}>
              <legend className="label" style={{ display: 'block', marginBottom: 8 }}>Período</legend>
              <div style={{ display: 'flex', gap: 8 }}>
                {['diaria', 'semanal', 'mensal'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    disabled={submitting}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 'var(--r-sm)',
                      border: `1px solid ${periodo === p ? 'var(--red)' : 'var(--g-300)'}`,
                      background: periodo === p ? 'var(--red)' : 'var(--white)',
                      color: periodo === p ? 'white' : 'var(--g-700)',
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'all 150ms var(--ease-out)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {{ diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[p]}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Submit button — TRIGGER-03: disabled on first click */}
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !isFormValid}
              style={{
                width: '100%',
                justifyContent: 'center',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: (submitting || !isFormValid) ? 0.5 : 1,
                cursor: (submitting || !isFormValid) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? (
                <>
                  <span style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                  Iniciando...
                </>
              ) : (
                <><Icon name="chart" size={15} /> Iniciar Análise</>
              )}
            </button>
          </div>

          {/* Error Card — shown below form when error !== null */}
          {error && (
            <div
              className="card fade-in"
              role="alert"
              aria-live="polite"
              style={{
                padding: 20, marginTop: 16,
                border: '1px solid var(--red-soft)',
                background: 'var(--red-soft)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Icon name="warning" size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>
                    {error.title}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--red)', opacity: 0.8 }}>
                    {error.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRetry}
                  style={{ flexShrink: 0, fontSize: 13 }}
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
        </form>
      )}

    </div>
  );
}
