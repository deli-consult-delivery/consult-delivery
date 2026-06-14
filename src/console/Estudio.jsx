import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 · E3 — ESTÚDIO DE CONTEÚDO (design aprovado em
// 2026-06-08 no Claude Design: 3 colunas BRIEF·RESULTADO·BIBLIOTECA,
// estados vazio/gerando/resultado/erro, Brand Guard, zero emoji).
// Fluxo: GERAR grava status='fila' → task cron estudio-gerar (E2)
// processa → tela faz poll e mostra 'pronto'. Nada é publicado.
// E4: Enviar como rascunho de campanha → agent_drafts (canal
// painel, fila oficial de aprovações — schema real usa agent_name).
// fix: custo médio fallback 0,04 → 0,24 (custo real medido no e2e).
// ============================================================

const TIPOS = [
  { id: 'post_instagram', label: 'Post Instagram', tag: '1:1', formato: '1:1' },
  { id: 'story_vaga', label: 'Story / Vaga', tag: '9:16', formato: '9:16' },
  { id: 'capa_youtube', label: 'Capa YouTube', tag: '16:9', formato: '16:9' },
  { id: 'oferta_whatsapp', label: 'Oferta WhatsApp', tag: '1:1', formato: '1:1' },
  { id: 'cardapio_copy', label: 'Cardápio', tag: 'copy', formato: 'texto' },
  { id: 'calendario_mes', label: 'Calendário do mês', tag: 'plano', formato: 'texto' },
];
const TONS = ['Direto', 'Apetite', 'Urgência', 'Institucional'];
const RATIO = { '1:1': '1 / 1', '9:16': '9 / 16', '16:9': '16 / 9' };
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.id, t.label]));

const EXEMPLOS = [
  { titulo: 'Combo da semana', tipo: 'post_instagram', brief: 'Post 1:1 anunciando o combo Smash Duplo + fritas + refri por R$ 39,90, válido de quinta a domingo.' },
  { titulo: 'Oferta relâmpago', tipo: 'oferta_whatsapp', brief: 'Arte de oferta para disparo no WhatsApp: 20% off no primeiro pedido pelo nosso delivery, só hoje.' },
  { titulo: 'Vaga de atendente', tipo: 'story_vaga', brief: 'Story 9:16 anunciando vaga de atendente de balcão para a unidade Centro, com link na bio.' },
];

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };
const chipStyle = on => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'var(--red)' : 'var(--line)'}`, background: on ? 'var(--red-soft)' : '#fff', color: on ? 'var(--red)' : '#3c3a37', marginRight: 7, marginBottom: 7 });

function fmtData(s) { try { return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch { return ''; } }

export default function Estudio({ tenantDbId, userId }) {
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [tipo, setTipo] = useState('post_instagram');
  const [brief, setBrief] = useState('');
  const [tom, setTom] = useState('Apetite');
  const [usarIdentidade, setUsarIdentidade] = useState(true);
  const [criacoes, setCriacoes] = useState(null);
  const [selId, setSelId] = useState(null);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [enviados, setEnviados] = useState({}); // criacao_id -> true (rascunho de campanha já criado)
  const [enviando, setEnviando] = useState(null);
  const pollRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: ls, error: e1 }, { data: cs, error: e2 }, { data: ds }] = await Promise.all([
      supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).eq('is_active', true).order('nome').limit(50),
      supabase.from('estudio_criacoes').select('id, loja_id, tipo, formato, brief, tom, status, texto_gerado, imagem_url, custo_usd, erro_msg, created_at').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(24),
      supabase.from('agent_drafts').select('metadata').eq('tenant_id', tenantDbId).eq('agent_name', 'estudio').limit(100),
    ]);
    if (e1 || e2) { setErro((e1 || e2).message); return; }
    setLojas(ls ?? []);
    setCriacoes(cs ?? []);
    const env = {};
    (ds ?? []).forEach(d => { if (d.metadata?.criacao_id) env[d.metadata.criacao_id] = true; });
    setEnviados(env);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  // poll enquanto houver criação na fila/gerando
  useEffect(() => {
    const pendente = (criacoes ?? []).some(c => c.status === 'fila' || c.status === 'gerando');
    if (pendente && !pollRef.current) pollRef.current = setInterval(carregar, 5000);
    if (!pendente && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [criacoes, carregar]);

  const sel = (criacoes ?? []).find(c => c.id === selId) || (criacoes ?? [])[0] || null;
  const custoMedioImg = (() => {
    const imgs = (criacoes ?? []).filter(c => c.imagem_url && Number(c.custo_usd) > 0);
    if (!imgs.length) return null;
    return imgs.reduce((s, c) => s + Number(c.custo_usd), 0) / imgs.length;
  })();

  async function gerar(brfTipo = tipo, brf = brief) {
    setErro(null);
    if ((brf || '').trim().length < 10) { setErro('Descreva o que você quer comunicar (mínimo 10 caracteres).'); return; }
    setSalvando(true);
    try {
      const def = TIPOS.find(t => t.id === brfTipo);
      const { data, error } = await supabase.from('estudio_criacoes').insert({
        tenant_id: tenantDbId,
        loja_id: lojaId || null,
        tipo: brfTipo,
        formato: def?.formato || '1:1',
        brief: brf.trim(),
        tom,
        usar_identidade: usarIdentidade,
        status: 'fila',
        criado_por: userId || null,
      }).select('id').single();
      if (error) throw error;
      setSelId(data.id);
      setBrief('');
      await carregar();
    } catch (err) { setErro(err?.message || 'falha ao enviar para a fila'); }
    finally { setSalvando(false); }
  }

  async function aprovar(c) {
    const { error } = await supabase.from('estudio_criacoes').update({ status: 'aprovado' }).eq('id', c.id).eq('status', 'pronto');
    if (error) setErro(error.message); else await carregar();
  }

  // E4 — vira rascunho de campanha no fluxo oficial de aprovação (agent_drafts,
  // canal painel — mesma fila da Defesa; nada é publicado direto).
  async function enviarRascunho(c) {
    setErro(null); setEnviando(c.id);
    try {
      const { error } = await supabase.from('agent_drafts').insert({
        tenant_id: tenantDbId,
        agent_name: 'estudio',
        channel: 'painel',
        loja_id: c.loja_id || null,
        subject: `Estúdio — ${TIPO_LABEL[c.tipo] || c.tipo}: ${(c.brief || '').slice(0, 60)}`,
        content: `${c.texto_gerado || ''}${c.imagem_url ? `\n\nArte: ${c.imagem_url}` : ''}`,
        status: 'pending',
        autonomy_level: 'amarelo',
        reasoning: 'Criação do Estúdio enviada pelo usuário como rascunho de campanha — aguardando aprovação no painel.',
        metadata: { criacao_id: c.id, tipo: c.tipo, formato: c.formato, imagem_url: c.imagem_url, brief: c.brief },
      });
      if (error) throw error;
      if (c.status === 'pronto') await supabase.from('estudio_criacoes').update({ status: 'aprovado' }).eq('id', c.id).eq('status', 'pronto');
      await carregar();
    } catch (err) { setErro(err?.message || 'falha ao enviar rascunho'); }
    finally { setEnviando(null); }
  }

  const biblio = (criacoes ?? []).filter(c => !busca || (c.brief || '').toLowerCase().includes(busca.toLowerCase()) || (TIPO_LABEL[c.tipo] || '').toLowerCase().includes(busca.toLowerCase()));
  const saldoErro = sel?.status === 'erro' && /402|saldo|credit|insufficient/i.test(sel?.erro_msg || '');

  return (
    <div>
      <div className="cv2-spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1>Estúdio de Conteúdo <span className="cv2-mock" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>AGENTE ESTÚDIO</span></h1>
          <div className="cv2-rule" />
          <div className="cv2-sub">Gera artes e copy na identidade visual da loja. Nada é publicado — você revisa e aprova.</div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <span className="cv2-pill">custo médio <b>{custoMedioImg ? `US$ ${custoMedioImg.toFixed(2)}` : 'US$ 0,24'}</b> / imagem</span>
          <span className="cv2-pill" title="Modelo travado — definido pela plataforma">modelo <b>GPT Image 2</b> via OpenRouter</span>
        </div>
      </div>

      <div className="cv2-grid-estudio">

        {/* ============ COLUNA 1 · BRIEF ============ */}
        <div className="cv2-card">
          <h3>Brief <span style={{ fontWeight: 500, color: 'var(--tx2)' }}>— defina o pedido e gere a peça</span></h3>
          <label style={labelStyle}>Loja</label>
          <select style={inputStyle} value={lojaId} onChange={e => setLojaId(e.target.value)}>
            <option value="">— sem loja específica —</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <label style={labelStyle}>Tipo de conteúdo</label>
          <div>
            {TIPOS.map(t => (
              <span key={t.id} style={chipStyle(tipo === t.id)} onClick={() => setTipo(t.id)}>
                {t.label} <small style={{ fontWeight: 600, opacity: .65 }}>{t.tag}</small>
              </span>
            ))}
          </div>
          <label style={labelStyle}>O que você quer comunicar?</label>
          <textarea style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }} value={brief} onChange={e => setBrief(e.target.value)}
            placeholder="Ex.: combo Smash Duplo + fritas + refri por R$ 39,90, válido de quinta a domingo." />
          <label style={labelStyle}>Tom</label>
          <div>
            {TONS.map(t => <span key={t} style={chipStyle(tom === t)} onClick={() => setTom(t)}>{t}</span>)}
          </div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 12.5 }}>
            <input type="checkbox" checked={usarIdentidade} onChange={e => setUsarIdentidade(e.target.checked)} />
            Usar identidade da loja (logo + cores)
          </label>
          <div style={{ marginTop: 14 }}>
            <button className="cv2-btn" style={{ width: '100%', justifyContent: 'center' }} disabled={salvando} onClick={() => gerar()}>
              {salvando ? 'Enviando…' : 'Gerar'}
            </button>
          </div>
          {erro && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
        </div>

        {/* ============ COLUNA 2 · RESULTADO ============ */}
        <div>
          {!sel && criacoes && (
            <div className="cv2-card" style={{ textAlign: 'center', padding: '34px 22px' }}>
              <h1 style={{ fontSize: 19 }}>Comece um pedido</h1>
              <div className="cv2-sub" style={{ maxWidth: 420, margin: '8px auto 18px' }}>
                Descreva o que quer comunicar no brief ao lado, ou parta de um destes exemplos. A arte sai na identidade da loja.
              </div>
              <div style={{ textAlign: 'left', maxWidth: 480, margin: '0 auto' }}>
                {EXEMPLOS.map((ex, i) => (
                  <div key={i} className="cv2-caso" style={{ cursor: 'pointer' }} onClick={() => { setTipo(ex.tipo); setBrief(ex.brief); }}>
                    <b style={{ fontSize: 13 }}>{ex.titulo}</b>
                    <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 3 }}>{ex.brief}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sel && (sel.status === 'fila' || sel.status === 'gerando') && (
            <div className="cv2-card" style={{ textAlign: 'center', padding: '34px 22px' }}>
              <span className="cv2-bdg warn">{sel.status === 'fila' ? 'NA FILA' : 'GERANDO'}</span>
              <h1 style={{ fontSize: 19, marginTop: 12 }}>Criando sua peça</h1>
              <div className="cv2-sub">{TIPO_LABEL[sel.tipo]} · o agente processa a fila a cada 2 minutos — esta tela atualiza sozinha.</div>
              <div style={{ background: '#f0eeec', borderRadius: 6, height: 10, maxWidth: 320, margin: '14px auto', overflow: 'hidden' }}>
                <div style={{ width: sel.status === 'fila' ? '25%' : '70%', height: '100%', background: 'var(--red)', borderRadius: 6, transition: 'width .8s' }} />
              </div>
            </div>
          )}

          {sel && sel.status === 'erro' && (
            <div className="cv2-card" style={{ borderLeft: '3px solid var(--red)' }}>
              <span className="cv2-bdg err">{saldoErro ? 'SALDO INSUFICIENTE' : 'ERRO NA GERAÇÃO'}</span>
              <div style={{ fontSize: 13, marginTop: 10 }}>{saldoErro ? 'O saldo do OpenRouter acabou. Recarregue e gere novamente — o brief fica salvo na biblioteca.' : (sel.erro_msg || 'Falha desconhecida.')}</div>
              <div style={{ marginTop: 12 }}>
                <button className="cv2-btn sec" onClick={() => gerar(sel.tipo, sel.brief)}>Tentar novamente</button>
              </div>
            </div>
          )}

          {sel && (sel.status === 'pronto' || sel.status === 'aprovado') && (
            <div>
              {sel.imagem_url && (
                <div className="cv2-card" style={{ padding: 10 }}>
                  <img src={sel.imagem_url} alt="" style={{ width: '100%', aspectRatio: RATIO[sel.formato] || 'auto', objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                </div>
              )}
              <div className="cv2-card">
                <div className="cv2-spread">
                  <h3 style={{ margin: 0 }}>{TIPO_LABEL[sel.tipo]} {sel.status === 'aprovado' ? <span className="cv2-bdg ok">APROVADO</span> : <span className="cv2-bdg warn">AGUARDANDO REVISÃO</span>}</h3>
                  <span className="cv2-pill">custo <b>US$ {Number(sel.custo_usd).toFixed(3)}</b></span>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4, padding: '10px 12px', marginTop: 10 }}>{sel.texto_gerado}</pre>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {sel.status === 'pronto' && <button className="cv2-btn" onClick={() => aprovar(sel)}>Aprovar</button>}
                  <button className="cv2-btn sec" onClick={() => gerar(sel.tipo, sel.brief)}>Gerar variação</button>
                  {sel.imagem_url && <a className="cv2-btn sec" style={{ textDecoration: 'none' }} href={sel.imagem_url} target="_blank" rel="noreferrer" download>Baixar PNG</a>}
                  {enviados[sel.id]
                    ? <span className="cv2-bdg ok" style={{ alignSelf: 'center' }}>NA FILA DE APROVAÇÕES</span>
                    : <button className="cv2-btn sec" disabled={enviando === sel.id} title="Vira rascunho de campanha na fila de aprovações — nada é publicado direto" onClick={() => enviarRascunho(sel)}>{enviando === sel.id ? 'Enviando…' : 'Enviar como rascunho de campanha'}</button>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============ COLUNA 3 · BIBLIOTECA ============ */}
        <div className="cv2-card">
          <h3>Biblioteca <span style={{ fontWeight: 500, color: 'var(--tx2)' }}>{criacoes ? `${criacoes.length} criações` : ''}</span></h3>
          <input style={inputStyle} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar criações..." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
            {biblio.map(c => (
              <div key={c.id} onClick={() => setSelId(c.id)} style={{ cursor: 'pointer', border: `1px solid ${sel && sel.id === c.id ? 'var(--red)' : 'var(--line)'}`, borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
                {c.imagem_url
                  ? <img src={c.imagem_url} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#0D0D0D', color: '#E9E6E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: 6, textAlign: 'center' }}>{TIPO_LABEL[c.tipo] || c.tipo}</div>}
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(c.brief || '').slice(0, 40)}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx2)' }}>{TIPO_LABEL[c.tipo] || c.tipo} · {fmtData(c.created_at)}{c.status === 'erro' ? ' · erro' : c.status === 'fila' || c.status === 'gerando' ? ' · gerando' : ''}</div>
                </div>
              </div>
            ))}
          </div>
          {criacoes && !criacoes.length && <div style={{ marginTop: 12, color: 'var(--tx2)', fontSize: 12.5, textAlign: 'center' }}>Suas criações aparecem aqui.</div>}
        </div>
      </div>
    </div>
  );
}
