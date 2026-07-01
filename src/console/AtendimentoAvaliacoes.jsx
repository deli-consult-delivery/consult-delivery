import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase.js';
import RequireRole from '../components/auth/RequireRole.jsx';

// ============================================================
// AtendimentoAvaliacoes — CSAT de atendimento (NPS 1-5 via link)
// KPIs: CSAT%, média, respondidas, taxa de resposta
// Distribuição 1-5 | % por status | ranking atendente | comentários
// Detratores (nota ≤2 + tratativa pendente/em_andamento)
// Link copiável + QR por registro | Resumo IA via Bridge
// ============================================================

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || 'https://app.consultdelivery.com.br';
const LIMIT_AVALIACOES = 200;
const LIMIT_COMENTARIOS = 20;

// ── helpers ──────────────────────────────────────────────────────────────────

function calcCSAT(totais) {
  const respondidas = totais?.respondidas ?? [];
  if (!respondidas.length) return { csat: null, media: null, totalRespondidas: 0, taxaResposta: null };
  const satisfeitos = respondidas.filter(r => r.nota >= 4).length;
  const totalDenominador = respondidas.length + (totais.pendentes ?? 0) + (totais.expiradas ?? 0);
  return {
    csat: Math.round((satisfeitos / respondidas.length) * 100),
    media: (respondidas.reduce((acc, r) => acc + r.nota, 0) / respondidas.length).toFixed(1),
    totalRespondidas: respondidas.length,
    taxaResposta: totalDenominador ? Math.round((respondidas.length / totalDenominador) * 100) : null,
  };
}

function calcDistribuicao(totais) {
  const respondidas = totais?.respondidas ?? [];
  const total = respondidas.length;
  return [1, 2, 3, 4, 5].map(nota => {
    const count = respondidas.filter(r => r.nota === nota).length;
    return { nota, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
}

function calcStatusPct(totais) {
  const counts = { pendente: totais?.pendentes ?? 0, respondida: (totais?.respondidas ?? []).length, expirada: totais?.expiradas ?? 0 };
  const total = counts.pendente + counts.respondida + counts.expirada;
  return ['pendente', 'respondida', 'expirada'].map(status => ({
    status,
    count: counts[status],
    pct: total ? Math.round((counts[status] / total) * 100) : 0,
  }));
}

function calcAtendentes(rows) {
  const respondidas = rows.filter(r => r.nota != null && r.atendente_nome);
  const mapa = {};
  respondidas.forEach(r => {
    const nome = r.atendente_nome;
    if (!mapa[nome]) mapa[nome] = { nome, notas: [] };
    mapa[nome].notas.push(r.nota);
  });
  return Object.values(mapa)
    .map(a => ({
      nome: a.nome,
      respostas: a.notas.length,
      media: (a.notas.reduce((s, n) => s + n, 0) / a.notas.length).toFixed(1),
      csat: Math.round((a.notas.filter(n => n >= 4).length / a.notas.length) * 100),
    }))
    .sort((a, b) => b.csat - a.csat);
}

function urlAvaliacao(token) {
  return `${PUBLIC_URL}/avaliacao/${token}`;
}

// Nome a exibir: nome_cliente quando houver, senão o identificador vindo do CRM
function nomeExibicao(item) {
  return item.nome_cliente || item.contact_identifier || null;
}

// Badge de origem (crm_externo = avaliação criada via webhook do CRM do cliente)
function BadgeOrigem({ origem }) {
  if (origem !== 'crm_externo') return null;
  return (
    <span className="cv2-bdg" style={{ fontSize: 10, padding: '2px 7px', background: 'var(--blue-soft, #eff6ff)', color: 'var(--blue, #2563eb)' }}>
      CRM
    </span>
  );
}

function copiarParaClipboard(texto) {
  try { navigator.clipboard?.writeText(texto); } catch { /* ignora */ }
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
  const corBarra = nota >= 4 ? 'var(--green)' : nota <= 2 ? 'var(--red)' : 'var(--warn, #f59e0b)';
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs font-bold w-4 text-right" style={{ color: 'var(--tx2)' }}>{nota}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-3 rounded-full transition-all"
          style={{ width: `${pct}%`, background: corBarra, minWidth: pct > 0 ? 4 : 0 }}
        />
      </div>
      <span className="text-xs w-10 text-right" style={{ color: 'var(--tx2)' }}>{count} <span className="font-normal">({pct}%)</span></span>
    </div>
  );
}

function ChipStatus({ status, count, pct }) {
  const COR = { pendente: 'warn', respondida: 'ok', expirada: 'mut' };
  const LABEL = { pendente: 'Pendente', respondida: 'Respondida', expirada: 'Expirada' };
  return (
    <span className={`cv2-bdg ${COR[status] || 'mut'}`} style={{ fontSize: 12, padding: '4px 10px' }}>
      {LABEL[status] || status}: <b>{count}</b> <span style={{ opacity: .7 }}>({pct}%)</span>
    </span>
  );
}

function ModalQR({ url, onClose }) {
  const svgRef = useRef(null);

  function baixarSVG() {
    const svgEl = svgRef.current?.querySelector('svg');
    if (!svgEl) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qr-avaliacao.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // fechar com ESC
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cv2-card" style={{ maxWidth: 300, width: '100%', textAlign: 'center', padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>QR da avaliação</h3>
        <div ref={svgRef} className="flex justify-center mb-4">
          <QRCodeSVG value={url} size={200} />
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          <button className="cv2-btn sec" onClick={baixarSVG}>Baixar SVG</button>
          <button className="cv2-btn sec" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ItemComentario({ item }) {
  const [qrUrl, setQrUrl] = useState(null);

  const url = item.public_token ? urlAvaliacao(item.public_token) : null;

  const notaCls = item.nota >= 4 ? 'ok' : item.nota <= 2 ? 'err' : 'warn';

  return (
    <div className="cv2-card" style={{ marginBottom: 8, padding: '10px 14px' }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        {item.nota != null && (
          <span className={`cv2-bdg ${notaCls}`} style={{ fontSize: 11 }}>★ {item.nota}</span>
        )}
        <BadgeOrigem origem={item.origem} />
        {nomeExibicao(item) && (
          <span style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>{nomeExibicao(item)}</span>
        )}
        {item.atendente_nome && (
          <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.atendente_nome}</span>
        )}
        {item.responded_at && (
          <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
            {new Date(item.responded_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {url && (
          <div className="flex gap-1 ml-auto">
            <button
              className="cv2-btn sec"
              style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => copiarParaClipboard(url)}
              aria-label="Copiar link da avaliação"
            >
              Copiar link
            </button>
            <button
              className="cv2-btn sec"
              style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setQrUrl(url)}
              aria-label="Ver QR da avaliação"
            >
              QR
            </button>
          </div>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>"{item.comentario}"</p>
      {qrUrl && <ModalQR url={qrUrl} onClose={() => setQrUrl(null)} />}
    </div>
  );
}

function CardDetrator({ item, onSalvar, salvando }) {
  const [status, setStatus] = useState(item.tratativa_status || 'pendente');
  const [obs, setObs] = useState(item.tratativa_obs || '');
  const sujo = status !== item.tratativa_status || obs !== (item.tratativa_obs || '');

  return (
    <div className="cv2-card" style={{ marginBottom: 10, borderLeft: '3px solid var(--red)', padding: '10px 14px' }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="cv2-bdg err" style={{ fontSize: 12 }}>★ {item.nota}</span>
        <BadgeOrigem origem={item.origem} />
        {nomeExibicao(item) && (
          <span style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>{nomeExibicao(item)}</span>
        )}
        {item.atendente_nome && <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.atendente_nome}</span>}
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
        <button
          className={`cv2-btn ${status === 'em_andamento' ? '' : 'sec'}`}
          style={{ fontSize: 12 }}
          onClick={() => setStatus('em_andamento')}
          disabled={salvando}
        >
          Em andamento
        </button>
        <button
          className={`cv2-btn ${status === 'resolvido' ? '' : 'sec'}`}
          style={{ fontSize: 12 }}
          onClick={() => setStatus('resolvido')}
          disabled={salvando}
        >
          Resolvido
        </button>
        {sujo && (
          <button
            className="cv2-btn"
            style={{ fontSize: 12, marginLeft: 'auto' }}
            disabled={salvando}
            onClick={() => onSalvar(item.id, status, obs)}
          >
            {salvando ? 'Salvando…' : 'Salvar tratativa'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── componente principal (conteúdo) ──────────────────────────────────────────

function AtendimentoAvaliacoesContent({ tenantDbId, userId }) {
  const [rows, setRows] = useState(null);
  const [totais, setTotais] = useState(null); // KPIs sobre a base inteira (rows é capado em LIMIT_AVALIACOES p/ a lista)
  const [erro, setErro] = useState(null);
  const [salvandoId, setSalvandoId] = useState(null);

  // resumo IA
  const [resumo, setResumo] = useState(null);
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [erroResumo, setErroResumo] = useState(null);

  // ── fetch inicial ─────────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    if (!tenantDbId) return;
    setErro(null);
    const { data, error: err } = await supabase
      .from('atendimento_avaliacoes')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_AVALIACOES);
    if (err) { setErro(err.message); return; }
    setRows(data ?? []);
  }, [tenantDbId]);

  // ponytail: KPIs (respondidas/CSAT%/taxa de resposta) precisam da base inteira,
  // não só das LIMIT_AVALIACOES linhas mais recentes — senão o total fica subcontado
  // quando o tenant já passou de 200 avaliações.
  const fetchTotais = useCallback(async () => {
    if (!tenantDbId) return;
    const [pend, resp, exp] = await Promise.all([
      supabase.from('atendimento_avaliacoes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).eq('status', 'pendente'),
      supabase.from('atendimento_avaliacoes').select('nota').eq('tenant_id', tenantDbId).eq('status', 'respondida'),
      supabase.from('atendimento_avaliacoes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).eq('status', 'expirada'),
    ]);
    const respRows = (resp.data ?? []).filter(r => r.nota != null);
    setTotais({ pendentes: pend.count ?? 0, expiradas: exp.count ?? 0, respondidas: respRows });
  }, [tenantDbId]);

  useEffect(() => {
    fetchRows();
    fetchTotais();
  }, [fetchRows, fetchTotais]);

  // ── tratativa de detrator ─────────────────────────────────────────────────
  async function salvarTratativa(id, novoStatus, novaObs) {
    setSalvandoId(id);
    setErro(null);
    const { data: { session } } = await supabase.auth.getSession();
    const userId_ = session?.user?.id ?? userId;
    const { error: err } = await supabase
      .from('atendimento_avaliacoes')
      .update({
        tratativa_status: novoStatus,
        tratativa_obs: novaObs,
        tratativa_by: userId_,
        tratativa_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (err) setErro(err.message);
    else await fetchRows();
    setSalvandoId(null);
  }

  // ── resumo IA via Bridge ──────────────────────────────────────────────────
  async function atualizarResumo() {
    setCarregandoResumo(true);
    setErroResumo(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${BRIDGE}/api/avaliacao/resumo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tenant_id: tenantDbId }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Erro ${res.status}: ${body}`);
      }
      const json = await res.json();
      setResumo(json);
    } catch (e) {
      setErroResumo(e.message);
    }
    setCarregandoResumo(false);
  }

  // ── derivados ─────────────────────────────────────────────────────────────
  const lista = rows ?? [];
  const kpis = calcCSAT(totais);
  const distribuicao = calcDistribuicao(totais);
  const statusPcts = calcStatusPct(totais);
  const totalEnviadas = totais ? totais.pendentes + totais.respondidas.length + totais.expiradas : lista.length;
  const atendentes = calcAtendentes(lista);
  const comentarios = lista.filter(r => r.comentario).slice(0, LIMIT_COMENTARIOS);
  const detratores = lista.filter(r => r.nota != null && r.nota <= 2 && ['pendente', 'em_andamento'].includes(r.tratativa_status));

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1>Satisfação do Atendimento (CSAT) <span className="cv2-mock">Avaliações · IA</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Satisfação dos clientes por atendimento. CSAT = notas 4-5 ÷ respondidas.
        {erro && <span style={{ color: 'var(--red)' }}> · Erro: {erro}</span>}
      </div>

      {/* ── loading / empty ──────────────────────────────────────────────── */}
      {rows === null && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Carregando avaliações…
        </div>
      )}

      {rows !== null && lista.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhuma avaliação encontrada para este tenant.
        </div>
      )}

      {rows !== null && lista.length > 0 && (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="cv2-kpis">
            <KpiCard
              label="CSAT"
              valor={kpis.csat != null ? `${kpis.csat}%` : '—'}
              detalhe="notas 4-5 / respondidas"
              destaque={kpis.csat != null && kpis.csat < 70}
            />
            <KpiCard
              label="Média"
              valor={kpis.media ?? '—'}
              detalhe="em 5 pontos"
              destaque={kpis.media != null && Number(kpis.media) < 3}
            />
            <KpiCard
              label="Respondidas"
              valor={kpis.totalRespondidas}
              detalhe={`de ${totalEnviadas} enviadas`}
            />
            <KpiCard
              label="Taxa de Resposta"
              valor={kpis.taxaResposta != null ? `${kpis.taxaResposta}%` : '—'}
              detalhe="respondidas / total"
              destaque={kpis.taxaResposta != null && kpis.taxaResposta < 30}
            />
          </div>

          {/* ── Distribuição 1-5 ──────────────────────────────────────────── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 14 }}>Distribuição de notas</h3>
            {distribuicao.map(d => (
              <BarraNota key={d.nota} {...d} />
            ))}
          </div>

          {/* ── Status ────────────────────────────────────────────────────── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Status das avaliações</h3>
            <div className="flex gap-2 flex-wrap">
              {statusPcts.map(s => <ChipStatus key={s.status} {...s} />)}
            </div>
          </div>

          {/* ── Desempenho por atendente ───────────────────────────────────── */}
          {atendentes.length > 0 && (
            <div className="cv2-card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Desempenho por atendente</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', color: 'var(--tx2)', fontWeight: 600, whiteSpace: 'nowrap' }}>Atendente</th>
                      <th style={{ padding: '6px 8px', color: 'var(--tx2)', fontWeight: 600, textAlign: 'center' }}>Respostas</th>
                      <th style={{ padding: '6px 8px', color: 'var(--tx2)', fontWeight: 600, textAlign: 'center' }}>Média</th>
                      <th style={{ padding: '6px 8px', color: 'var(--tx2)', fontWeight: 600, textAlign: 'center' }}>CSAT%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atendentes.map(a => (
                      <tr key={a.nome} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--ink)' }}>{a.nome}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--tx2)' }}>{a.respostas}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--tx2)' }}>{a.media}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span className={`cv2-bdg ${a.csat >= 70 ? 'ok' : a.csat >= 50 ? 'warn' : 'err'}`} style={{ fontSize: 11 }}>
                            {a.csat}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Detratores a tratar ────────────────────────────────────────── */}
          <div className="cv2-card">
            <div className="flex items-center gap-2 mb-3">
              <h3 style={{ margin: 0 }}>Detratores a tratar</h3>
              {detratores.length > 0 && (
                <span className="cv2-bdg err" style={{ fontSize: 12 }}>{detratores.length}</span>
              )}
            </div>
            {detratores.length === 0 ? (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Nenhum detrator pendente de tratativa.</div>
            ) : (
              detratores.map(d => (
                <CardDetrator
                  key={d.id}
                  item={d}
                  onSalvar={salvarTratativa}
                  salvando={salvandoId === d.id}
                />
              ))
            )}
          </div>

          {/* ── Comentários recentes ──────────────────────────────────────── */}
          <div className="cv2-card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Comentários recentes
              <span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 400, marginLeft: 8 }}>
                últimos {LIMIT_COMENTARIOS}
              </span>
            </h3>
            {comentarios.length === 0 ? (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Nenhum comentário registrado.</div>
            ) : (
              comentarios.map(c => <ItemComentario key={c.id} item={c} />)
            )}
          </div>

          {/* ── Resumo IA ─────────────────────────────────────────────────── */}
          <div className="cv2-card">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <h3 style={{ margin: 0 }}>Resumo IA</h3>
              <button
                className="cv2-btn sec"
                style={{ fontSize: 12 }}
                onClick={atualizarResumo}
                disabled={carregandoResumo}
                aria-label="Atualizar resumo de avaliações via IA"
              >
                {carregandoResumo ? 'Gerando…' : 'Atualizar resumo'}
              </button>
            </div>

            {erroResumo && (
              <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>
                Não foi possível gerar o resumo: {erroResumo}
              </div>
            )}

            {!resumo && !erroResumo && !carregandoResumo && (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>
                Clique em "Atualizar resumo" para gerar uma análise da IA sobre as avaliações recentes.
              </div>
            )}

            {resumo && (
              <>
                {resumo.resumo && (
                  <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.65, marginTop: 0 }}>
                    {resumo.resumo}
                  </p>
                )}

                {Array.isArray(resumo.temas_positivos) && resumo.temas_positivos.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>
                      Pontos positivos
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {resumo.temas_positivos.map((t, i) => (
                        <span key={i} className="cv2-bdg ok" style={{ fontSize: 12 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(resumo.temas_negativos) && resumo.temas_negativos.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>
                      Pontos negativos
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {resumo.temas_negativos.map((t, i) => (
                        <span key={i} className="cv2-bdg err" style={{ fontSize: 12 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {resumo.acao_sugerida && (
                  <div style={{ background: 'var(--green-soft, #f0fdf4)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
                    <b style={{ color: 'var(--green)' }}>Acao sugerida:</b> {resumo.acao_sugerida}
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

export default function AtendimentoAvaliacoes({ tenantDbId, userId }) {
  return (
    <RequireRole roles={['admin', 'consultor']} userId={userId}>
      <AtendimentoAvaliacoesContent tenantDbId={tenantDbId} userId={userId} />
    </RequireRole>
  );
}
