import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import RequireRole from '../components/auth/RequireRole.jsx';

// ============================================================
// NpsResultados — NPS de Marca (escala 0-10, cooldown 30 dias)
// KPIs: NPS score, promotores, passivos, detratores
// Distribuição 0-10 | Detratores com tratativa | Resumo IA
// ============================================================

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const LIMIT  = 200;
const LIMIT_COMENTARIOS = 20;

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTelefoneBR(raw) {
  const d = String(raw).replace(/\D/g, '');
  const semDDI = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (semDDI.length === 11) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
  if (semDDI.length === 10) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 6)}-${semDDI.slice(6)}`;
  return raw;
}

// contact_identifier pode ser um ID interno do CRM (Datacrazy) — não usar como telefone.
function BadgeTelefone({ item }) {
  if (!item.contact_phone) return null;
  const digitos = String(item.contact_phone).replace(/\D/g, '');
  return (
    <a
      href={`https://wa.me/${digitos}`}
      target="_blank"
      rel="noopener noreferrer"
      className="cv2-bdg mut"
      style={{ fontSize: 11, textDecoration: 'none' }}
      title="Abrir conversa no WhatsApp"
    >
      📞 {formatTelefoneBR(item.contact_phone)}
    </a>
  );
}

function calcNPS(rows) {
  const respondidas = rows.filter(r => r.nota != null);
  if (!respondidas.length) return { nps: null, promotores: 0, passivos: 0, detratores: 0, totalRespondidas: 0, pctPromotor: null, pctDetrator: null };
  const tot = respondidas.length;
  const promotores  = respondidas.filter(r => r.nota >= 9).length;
  const passivos    = respondidas.filter(r => r.nota >= 7 && r.nota <= 8).length;
  const detratores  = respondidas.filter(r => r.nota <= 6).length;
  const pctPromotor = (promotores  / tot) * 100;
  const pctDetrator = (detratores  / tot) * 100;
  const nps = Math.round(pctPromotor - pctDetrator);
  return { nps, promotores, passivos, detratores, totalRespondidas: tot, pctPromotor: Math.round(pctPromotor), pctDetrator: Math.round(pctDetrator) };
}

function calcDistribuicao(rows) {
  const respondidas = rows.filter(r => r.nota != null);
  const total = respondidas.length;
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(nota => {
    const count = respondidas.filter(r => r.nota === nota).length;
    return { nota, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
}

function corNota(nota) {
  if (nota >= 9) return 'var(--green)';
  if (nota >= 7) return 'var(--warn, #f59e0b)';
  return 'var(--red)';
}

function npsCorLabel(nps) {
  if (nps === null) return 'var(--tx2)';
  if (nps >= 50) return 'var(--green)';
  if (nps >= 0)  return 'var(--warn, #f59e0b)';
  return 'var(--red)';
}

// ── subcomponentes ────────────────────────────────────────────────────────────

function KpiCard({ label, valor, detalhe, destaque }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{label}</div>
      <div className={`v${destaque ? ' neg' : ''}`}>{valor ?? '—'}</div>
      {detalhe && <div className="d mut">{detalhe}</div>}
    </div>
  );
}

function BarraNota({ nota, count, pct }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs font-bold w-5 text-right" style={{ color: corNota(nota) }}>{nota}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-3 rounded-full transition-all"
          style={{ width: `${pct}%`, background: corNota(nota), minWidth: pct > 0 ? 4 : 0 }}
        />
      </div>
      <span className="text-xs w-12 text-right" style={{ color: 'var(--tx2)' }}>{count} <span className="font-normal">({pct}%)</span></span>
    </div>
  );
}

function CardDetrator({ item, onSalvar, salvando }) {
  const [status, setStatus] = useState(item.tratativa_status || 'pendente');
  const [obs, setObs]       = useState(item.tratativa_obs || '');
  const sujo = status !== item.tratativa_status || obs !== (item.tratativa_obs || '');

  return (
    <div className="cv2-card" style={{ marginBottom: 10, borderLeft: '3px solid var(--red)', padding: '10px 14px' }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="cv2-bdg err" style={{ fontSize: 12 }}>★ {item.nota}/10</span>
        {item.contact_nome && <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.contact_nome}</span>}
        <BadgeTelefone item={item} />
        <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
          {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
        <span className={`cv2-bdg ${status === 'resolvido' ? 'ok' : status === 'em_andamento' ? 'warn' : 'err'}`} style={{ fontSize: 11, marginLeft: 'auto' }}>
          {status === 'resolvido' ? 'Resolvido' : status === 'em_andamento' ? 'Em andamento' : 'Pendente'}
        </span>
      </div>

      {item.comentario && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>"{item.comentario}"</p>
      )}

      <textarea
        value={obs}
        onChange={e => setObs(e.target.value)}
        placeholder="Observação sobre a tratativa…"
        rows={2}
        aria-label="Observação da tratativa"
        style={{ width: '100%', fontSize: 12.5, fontFamily: 'inherit', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical', background: '#fff', color: 'var(--ink)', boxSizing: 'border-box', marginBottom: 8 }}
      />

      <div className="flex gap-2 flex-wrap">
        <button className={`cv2-btn ${status === 'em_andamento' ? '' : 'sec'}`} style={{ fontSize: 12 }} onClick={() => setStatus('em_andamento')} disabled={salvando}>Em andamento</button>
        <button className={`cv2-btn ${status === 'resolvido' ? '' : 'sec'}`}   style={{ fontSize: 12 }} onClick={() => setStatus('resolvido')}   disabled={salvando}>Resolvido</button>
        {sujo && (
          <button className="cv2-btn" style={{ fontSize: 12, marginLeft: 'auto' }} disabled={salvando} onClick={() => onSalvar(item.id, status, obs)}>
            {salvando ? 'Salvando…' : 'Salvar tratativa'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

function NpsResultadosContent({ tenantDbId, userId }) {
  const [rows,       setRows]       = useState(null);
  const [erro,       setErro]       = useState(null);
  const [salvandoId, setSalvandoId] = useState(null);

  // resumo IA
  const [resumo,           setResumo]           = useState(null);
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [erroResumo,       setErroResumo]       = useState(null);

  const fetchRows = useCallback(async () => {
    if (!tenantDbId) return;
    setErro(null);
    const { data, error: err } = await supabase
      .from('nps_avaliacoes')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (err) { setErro(err.message); return; }
    setRows(data ?? []);
  }, [tenantDbId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function salvarTratativa(id, novoStatus, novaObs) {
    setSalvandoId(id);
    setErro(null);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? userId;
    const { error: err } = await supabase
      .from('nps_avaliacoes')
      .update({ tratativa_status: novoStatus, tratativa_obs: novaObs, tratativa_by: uid, tratativa_at: new Date().toISOString() })
      .eq('id', id);
    if (err) setErro(err.message);
    else await fetchRows();
    setSalvandoId(null);
  }

  async function atualizarResumo() {
    setCarregandoResumo(true);
    setErroResumo(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${BRIDGE}/api/avaliacao/resumo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ tenant_id: tenantDbId, fonte: 'nps' }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
      setResumo(await res.json());
    } catch (e) {
      setErroResumo(e.message);
    }
    setCarregandoResumo(false);
  }

  const lista       = rows ?? [];
  const kpis        = calcNPS(lista);
  const distribuicao = calcDistribuicao(lista);
  const statusPcts  = ['pendente', 'respondida', 'expirada'].map(s => ({
    status: s,
    count:  lista.filter(r => r.status === s).length,
    pct:    lista.length ? Math.round((lista.filter(r => r.status === s).length / lista.length) * 100) : 0,
  }));
  const comentarios = lista.filter(r => r.comentario).slice(0, LIMIT_COMENTARIOS);
  const detratores  = lista.filter(r => r.nota != null && r.nota <= 6 && ['pendente', 'em_andamento'].includes(r.tratativa_status));

  return (
    <div>
      <h1>Lealdade da Marca (NPS) <span className="cv2-mock">Probabilidade de indicação · IA</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Lealdade à marca. NPS = % Promotores (9-10) − % Detratores (0-6). Escala: −100 a 100.
        {erro && <span style={{ color: 'var(--red)' }}> · Erro: {erro}</span>}
      </div>

      {rows === null && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando avaliações NPS…</div>
      )}

      {rows !== null && lista.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhuma avaliação NPS encontrada. O link é enviado automaticamente ao encerrar conversas no WhatsApp.
        </div>
      )}

      {rows !== null && lista.length > 0 && (
        <>
          {/* ── KPIs ── */}
          <div className="cv2-kpis">
            <div className="cv2-kpi">
              <div className="l">NPS</div>
              <div className="v" style={{ color: npsCorLabel(kpis.nps) }}>
                {kpis.nps !== null ? (kpis.nps > 0 ? `+${kpis.nps}` : `${kpis.nps}`) : '—'}
              </div>
              <div className="d mut">% promotores − % detratores</div>
            </div>
            <KpiCard label="Promotores" valor={kpis.promotores} detalhe={`${kpis.pctPromotor ?? '—'}% · notas 9-10`} />
            <KpiCard label="Passivos"   valor={kpis.passivos}   detalhe="notas 7-8" />
            <KpiCard label="Detratores" valor={kpis.detratores} detalhe={`${kpis.pctDetrator ?? '—'}% · notas 0-6`} destaque={kpis.pctDetrator != null && kpis.pctDetrator > 30} />
            <KpiCard label="Respondidas" valor={kpis.totalRespondidas} detalhe={`de ${lista.length} enviadas`} />
          </div>

          {/* ── Distribuição 0-10 ── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 14 }}>Distribuição de notas (0-10)</h3>
            <div className="flex gap-3 mb-3" style={{ fontSize: 12 }}>
              <span className="cv2-bdg err">Detratores 0-6</span>
              <span className="cv2-bdg warn">Passivos 7-8</span>
              <span className="cv2-bdg ok">Promotores 9-10</span>
            </div>
            {distribuicao.map(d => <BarraNota key={d.nota} {...d} />)}
          </div>

          {/* ── Status ── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Status das pesquisas</h3>
            <div className="flex gap-2 flex-wrap">
              {statusPcts.map(s => (
                <span
                  key={s.status}
                  className={`cv2-bdg ${s.status === 'respondida' ? 'ok' : s.status === 'pendente' ? 'warn' : 'mut'}`}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  {s.status === 'respondida' ? 'Respondida' : s.status === 'pendente' ? 'Pendente' : 'Expirada'}: <b>{s.count}</b>{' '}
                  <span style={{ opacity: .7 }}>({s.pct}%)</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Detratores a tratar ── */}
          <div className="cv2-card">
            <div className="flex items-center gap-2 mb-3">
              <h3 style={{ margin: 0 }}>Detratores a tratar</h3>
              {detratores.length > 0 && <span className="cv2-bdg err" style={{ fontSize: 12 }}>{detratores.length}</span>}
            </div>
            {detratores.length === 0 ? (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Nenhum detrator pendente de tratativa.</div>
            ) : (
              detratores.map(d => (
                <CardDetrator key={d.id} item={d} onSalvar={salvarTratativa} salvando={salvandoId === d.id} />
              ))
            )}
          </div>

          {/* ── Comentários recentes ── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Comentários recentes <span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 400, marginLeft: 8 }}>últimos {LIMIT_COMENTARIOS}</span>
            </h3>
            {comentarios.length === 0 ? (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Nenhum comentário registrado.</div>
            ) : (
              comentarios.map(c => (
                <div key={c.id} className="cv2-card" style={{ marginBottom: 8, padding: '10px 14px' }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`cv2-bdg ${c.nota >= 9 ? 'ok' : c.nota >= 7 ? 'warn' : 'err'}`} style={{ fontSize: 11 }}>★ {c.nota}/10</span>
                    {c.contact_nome && <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{c.contact_nome}</span>}
                    <BadgeTelefone item={c} />
                    {c.responded_at && (
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                        {new Date(c.responded_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>"{c.comentario}"</p>
                </div>
              ))
            )}
          </div>

          {/* ── Resumo IA ── */}
          <div className="cv2-card">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <h3 style={{ margin: 0 }}>Resumo IA</h3>
              <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={atualizarResumo} disabled={carregandoResumo} aria-label="Atualizar resumo NPS via IA">
                {carregandoResumo ? 'Gerando…' : 'Atualizar resumo'}
              </button>
            </div>

            {erroResumo && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>Não foi possível gerar o resumo: {erroResumo}</div>}

            {!resumo && !erroResumo && !carregandoResumo && (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Clique em "Atualizar resumo" para gerar uma análise IA sobre as respostas NPS recentes.</div>
            )}

            {resumo && (
              <>
                {resumo.resumo && (
                  <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.65, marginTop: 0 }}>{resumo.resumo}</p>
                )}
                {Array.isArray(resumo.temas_positivos) && resumo.temas_positivos.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>Pontos positivos</div>
                    <div className="flex gap-2 flex-wrap">
                      {resumo.temas_positivos.map((t, i) => <span key={i} className="cv2-bdg ok" style={{ fontSize: 12 }}>{t}</span>)}
                    </div>
                  </div>
                )}
                {Array.isArray(resumo.temas_negativos) && resumo.temas_negativos.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>Pontos a melhorar</div>
                    <div className="flex gap-2 flex-wrap">
                      {resumo.temas_negativos.map((t, i) => <span key={i} className="cv2-bdg err" style={{ fontSize: 12 }}>{t}</span>)}
                    </div>
                  </div>
                )}
                {resumo.acao_sugerida && (
                  <div style={{ background: 'var(--green-soft, #f0fdf4)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
                    <b style={{ color: 'var(--green)' }}>Ação sugerida:</b> {resumo.acao_sugerida}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── export com RBAC ───────────────────────────────────────────────────────────

export default function NpsResultados({ tenantDbId, userId }) {
  return (
    <RequireRole roles={['admin', 'gestor']} userId={userId}>
      <NpsResultadosContent tenantDbId={tenantDbId} userId={userId} />
    </RequireRole>
  );
}
