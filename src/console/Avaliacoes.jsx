import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  listLojasConsultoria,
  listLojasConfigAvaliacoes,
  getAvaliacoesConfig,
  saveAvaliacoesConfig,
  setLojaLogistica,
  setLojaConsultoriaAtiva,
  listAvaliacoes,
  updateAvaliacaoStatus,
} from '../lib/api.js';
import {
  gerarRespostasAvaliacoes,
  enviarAvaliacoesGrupo,
  sugerirTomLoja,
} from '../lib/miaApi.js';
import AvaliacoesReviewApi from './AvaliacoesReviewApi.jsx';

// ============================================================
// Aba "Avaliações" — agente IA p/ responder avaliações do iFood.
// Multi-loja, sem API do iFood (extração/colagem manual). Fluxo:
//   selecionar loja → salvar config (logística + tom) → colar avaliações →
//   gerar respostas → editar (≤300) → enviar ao grupo → aprovar/postar.
// Geração de IA roda no Bridge (claude-runner). Mensagens ao cliente só via
// draft + ação explícita aqui (nunca auto-envio).
// ============================================================

const LIMITE = 300;

const ROW_VAZIA = { nota: 5, tipo: 'loja', nome_cliente: '', comentario: '', prazo_label: '' };

const STATUS_META = {
  gerada:           { label: 'Gerada',          cls: 'warn' },
  nao_responder:    { label: 'Não responder',   cls: 'mut'  },
  enviada_grupo:    { label: 'Enviada ao grupo', cls: 'ok'  },
  aprovada_cliente: { label: 'Aprovada',        cls: 'ok'   },
  ajuste_pedido:    { label: 'Ajuste pedido',   cls: 'err'  },
  postada:          { label: 'Postada',         cls: 'ok'   },
  descartada:       { label: 'Descartada',      cls: 'mut'  },
};

const inp = {
  width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '7px 9px',
  border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink)',
};

function notaCls(nota) {
  if (nota == null) return 'mut';
  if (nota >= 5) return 'ok';
  if (nota <= 2) return 'err';
  return 'warn';
}

function copiar(texto) {
  try { navigator.clipboard?.writeText(texto || ''); } catch { /* ignora */ }
}

// ── Linha de entrada (avaliação colada do portal) ───────────────────────────
function EntradaRow({ row, idx, onChange, onRemove, podeRemover }) {
  const set = (k, v) => onChange(idx, { ...row, [k]: v });
  return (
    <div className="cv2-card" style={{ marginBottom: 10, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700 }}>
          Nota
          <select value={row.nota} onChange={e => set('nota', Number(e.target.value))} style={{ ...inp, width: 64, marginTop: 3 }}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700 }}>
          Tipo
          <select value={row.tipo} onChange={e => set('tipo', e.target.value)} style={{ ...inp, width: 120, marginTop: 3 }}>
            <option value="loja">Loja / produto</option>
            <option value="entrega">Entrega</option>
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, flex: 1, minWidth: 140 }}>
          Cliente (opcional)
          <input value={row.nome_cliente} onChange={e => set('nome_cliente', e.target.value)} placeholder="nome" style={{ ...inp, marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, width: 120 }}>
          Prazo
          <input value={row.prazo_label} onChange={e => set('prazo_label', e.target.value)} placeholder="1 dia, 23h…" style={{ ...inp, marginTop: 3 }} />
        </label>
      </div>
      <textarea
        value={row.comentario}
        onChange={e => set('comentario', e.target.value)}
        placeholder="Cole aqui o comentário do cliente (obrigatório)…"
        rows={2}
        style={{ ...inp, resize: 'vertical' }}
      />
      {podeRemover && (
        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => onRemove(idx)}>Remover</button>
        </div>
      )}
    </div>
  );
}

// ── Card de resultado (uma avaliação gerada) ────────────────────────────────
function CardAvaliacao({ item, agindo, onSalvar, onEnviar, onStatus, onAjuste }) {
  const [texto, setTexto] = useState(item.resposta_final ?? item.resposta_sugerida ?? '');
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteTexto, setAjusteTexto] = useState(item.ajuste_pedido ?? '');

  const meta = STATUS_META[item.status] || { label: item.status, cls: 'mut' };
  const ocupado = agindo === item.id;
  const naoResponder = item.status === 'nao_responder';
  const excede = texto.length > LIMITE;
  const final = item.status === 'postada' || item.status === 'descartada';
  const sujo = texto !== (item.resposta_final ?? item.resposta_sugerida ?? '');
  const falhou = !naoResponder && !item.resposta_sugerida && !item.resposta_final;

  return (
    <div className="cv2-card" style={{ marginBottom: 12, opacity: naoResponder || final ? 0.78 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className={`cv2-bdg ${notaCls(item.nota)}`} style={{ fontSize: 11 }}>⭐ {item.nota ?? '—'}</span>
        <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.tipo === 'loja' ? 'Loja' : 'Entrega'}</span>
        <span className={`cv2-bdg ${meta.cls}`} style={{ fontSize: 11 }}>{meta.label}</span>
        {item.prazo_label && <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ {item.prazo_label}</span>}
        {item.nome_cliente && <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{item.nome_cliente}</span>}
      </div>

      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 10 }}>
        <span style={{ color: 'var(--tx2)' }}>Comentário: </span>“{item.comentario}”
      </div>

      {naoResponder ? (
        <div style={{ fontSize: 12.5, color: 'var(--tx2)', background: '#f0eeec', borderRadius: 4, padding: '8px 10px' }}>
          {item.insights_consultoria || 'Avaliação não respondível pela regra de logística.'}
        </div>
      ) : (
        <>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            disabled={final}
            style={{ ...inp, resize: 'vertical', borderColor: excede ? 'var(--red)' : 'var(--line)' }}
          />
          <div style={{ fontSize: 11.5, fontWeight: 700, color: excede ? 'var(--red)' : 'var(--tx2)', textAlign: 'right', margin: '3px 0 8px' }}>
            {texto.length}/{LIMITE}{excede ? ' — excede o limite' : ''}
          </div>

          {item.insights_consultoria && (
            falhou ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink)', background: '#fdecea', borderRadius: 4, padding: '8px 10px', marginBottom: 10, lineHeight: 1.55 }}>
                <b style={{ color: 'var(--red)' }}>⚠ Falha na geração:</b> {item.insights_consultoria} — edite a resposta manualmente ou gere de novo.
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--green-soft)', borderRadius: 4, padding: '8px 10px', marginBottom: 10, lineHeight: 1.55 }}>
                <b style={{ color: 'var(--green)' }}>💡 Consultoria:</b> {item.insights_consultoria}
              </div>
            )
          )}

          {ajusteOpen && (
            <div style={{ marginBottom: 10 }}>
              <textarea
                value={ajusteTexto}
                onChange={e => setAjusteTexto(e.target.value)}
                rows={2}
                placeholder="O que o cliente pediu pra ajustar?"
                style={{ ...inp, resize: 'vertical' }}
              />
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <button
                  className="cv2-btn sec"
                  style={{ fontSize: 11.5 }}
                  disabled={ocupado || !ajusteTexto.trim()}
                  onClick={() => { onAjuste(item.id, ajusteTexto.trim(), sujo ? texto : undefined); setAjusteOpen(false); }}
                >
                  Registrar ajuste do cliente
                </button>
              </div>
            </div>
          )}

          {!final && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={ocupado || excede || !texto.trim()} onClick={() => onSalvar(item.id, texto)}>
                Salvar resposta
              </button>
              <button className="cv2-btn" style={{ fontSize: 11.5 }} disabled={ocupado || excede || !texto.trim()} onClick={() => onEnviar(item, texto)}>
                {ocupado ? '…' : 'Enviar ao grupo'}
              </button>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={ocupado || excede} onClick={() => onStatus(item.id, 'aprovada_cliente', sujo ? texto : undefined)}>
                Marcar aprovada
              </button>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={ocupado} onClick={() => setAjusteOpen(v => !v)}>
                {ajusteOpen ? 'Cancelar ajuste' : 'Colar ajuste do cliente'}
              </button>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={ocupado || excede} onClick={() => onStatus(item.id, 'postada', sujo ? texto : undefined)}>
                Marcar postada
              </button>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => copiar(texto)}>
                Copiar
              </button>
              <button className="cv2-btn danger" style={{ fontSize: 11.5 }} disabled={ocupado} onClick={() => onStatus(item.id, 'descartada')}>
                Descartar
              </button>
            </div>
          )}
          {final && (
            <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => copiar(texto)}>Copiar</button>
          )}
        </>
      )}
    </div>
  );
}

// ── Linha do painel de gestão (logística em massa + consultoria ativa) ──────
function LinhaGestao({ loja, busy, duplicada, onLogistica, onToggleAtiva }) {
  const inativa = loja.is_consultoria_ativa === false;
  const tipo = loja.logistica_tipo;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 4px', borderBottom: '1px solid var(--line)',
      opacity: inativa ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 160, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ textDecoration: inativa ? 'line-through' : 'none' }}>{loja.nome}</span>
        {duplicada && <span className="cv2-bdg warn" style={{ fontSize: 10 }}>duplicada</span>}
        {loja.super_restaurante && <span className="cv2-bdg ok" style={{ fontSize: 10 }}>Super</span>}
        {!tipo && !inativa && <span className="cv2-bdg mut" style={{ fontSize: 10 }}>sem logística</span>}
        {busy && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>salvando…</span>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className={`cv2-btn ${tipo === 'entrega_propria' ? '' : 'sec'}`}
          style={{ fontSize: 11, padding: '4px 9px' }}
          disabled={busy || inativa}
          title="Responde avaliações de loja e de entrega (motoboy próprio)"
          onClick={() => onLogistica(loja.id, 'entrega_propria')}
        >Entrega própria</button>
        <button
          className={`cv2-btn ${tipo === 'ifood_logistica' ? '' : 'sec'}`}
          style={{ fontSize: 11, padding: '4px 9px' }}
          disabled={busy || inativa}
          title="Não responde avaliações de entrega (logística do iFood)"
          onClick={() => onLogistica(loja.id, 'ifood_logistica')}
        >Logística iFood</button>
      </div>
      <button
        className={`cv2-btn ${inativa ? 'sec' : 'danger'}`}
        style={{ fontSize: 11, padding: '4px 9px', minWidth: 96 }}
        disabled={busy}
        onClick={() => onToggleAtiva(loja)}
      >{inativa ? 'Reativar' : 'Sem consultoria'}</button>
    </div>
  );
}

export default function Avaliacoes({ tenantDbId, userId }) {
  void userId; // ações usam RLS pelo usuário logado (Supabase auth)

  const [lojas, setLojas] = useState(null);
  const [lojaId, setLojaId] = useState('');
  // Espelho da loja selecionada p/ ler "seleção atual" dentro de callbacks
  // assíncronos (sem closure velha) — usado por setLogisticaLoja ao resolver.
  const lojaIdRef = useRef(lojaId);
  useEffect(() => { lojaIdRef.current = lojaId; }, [lojaId]);
  const [config, setConfig] = useState(null);          // linha do banco (ou null)
  const [cfgForm, setCfgForm] = useState({ logistica_tipo: '', tom: '' });
  const [avals, setAvals] = useState(null);
  const [carregandoLoja, setCarregandoLoja] = useState(false); // troca de loja em voo
  const [entradas, setEntradas] = useState([{ ...ROW_VAZIA }]);

  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [sugerindoTom, setSugerindoTom] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [agindo, setAgindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  // Painel de gestão em massa (logística por loja + consultoria ativa)
  const [gerir, setGerir] = useState(false);
  const [gestao, setGestao] = useState(null);
  const [gBusy, setGBusy] = useState({});

  const loja = (lojas ?? []).find(l => l.id === lojaId) || null;

  // Nomes que aparecem em mais de uma loja (pares duplicados a sinalizar).
  const dupNomes = useMemo(() => {
    const cont = {};
    (gestao ?? []).forEach(l => {
      const k = (l.nome || '').trim().toLowerCase();
      cont[k] = (cont[k] || 0) + 1;
    });
    return new Set(Object.keys(cont).filter(k => cont[k] > 1));
  }, [gestao]);

  // Lista de lojas em consultoria (alimenta o seletor).
  useEffect(() => {
    if (!tenantDbId) return;
    listLojasConsultoria(tenantDbId).then(setLojas).catch(e => setErro(e.message));
  }, [tenantDbId]);

  // Carrega config + avaliações da loja selecionada. Trocar de loja zera as
  // avaliações coladas (não vazam p/ outra loja) e descarta — via ignore-flag —
  // qualquer carga em voo da loja anterior: sem isso, uma loja lenta (A) que
  // resolve depois sobrescreve config/avals da loja recém-selecionada (B).
  // Também limpa config/avals/cfgForm ANTES do await ao entrar numa loja nova:
  // o header (loja, ~l.283) e o seletor trocam de forma síncrona p/ B, mas o
  // fetch leva algumas centenas de ms — sem essa limpeza, KPIs, cards e o painel
  // de Configuração (radios/tom) seguem mostrando os dados de A sob o header de
  // B (flash cosmético). carregandoLoja segura o aviso "Salve a logística" e
  // pinta um estado de carregamento no lugar dos dados obsoletos.
  useEffect(() => {
    let ignore = false;
    setEntradas([{ ...ROW_VAZIA }]);
    if (!lojaId) { setConfig(null); setAvals(null); setCarregandoLoja(false); return; }
    setConfig(null);
    setAvals(null);
    setCfgForm({ logistica_tipo: '', tom: '' });
    setCarregandoLoja(true);
    setErro(null);
    (async () => {
      try {
        const [cfg, lista] = await Promise.all([
          getAvaliacoesConfig(lojaId),
          listAvaliacoes(tenantDbId, lojaId),
        ]);
        if (ignore) return;                       // loja mudou enquanto carregava → descarta
        setConfig(cfg);
        setCfgForm({ logistica_tipo: cfg?.logistica_tipo || '', tom: cfg?.tom || '' });
        setAvals(lista);
      } catch (e) {
        if (!ignore) setErro(e.message);
      } finally {
        if (!ignore) setCarregandoLoja(false);
      }
    })();
    return () => { ignore = true; };
  }, [lojaId, tenantDbId]);

  async function recarregarAvals() {
    try { setAvals(await listAvaliacoes(tenantDbId, lojaId)); } catch (e) { setErro(e.message); }
  }

  // ── Painel de gestão: carrega só quando aberto (lazy) ─────────────────────
  const carregarGestao = useCallback(async () => {
    if (!tenantDbId) return;
    try { setGestao(await listLojasConfigAvaliacoes(tenantDbId)); }
    catch (e) { setErro(e.message); }
  }, [tenantDbId]);

  useEffect(() => { if (gerir && gestao == null) carregarGestao(); }, [gerir, gestao, carregarGestao]);

  async function setLogisticaLoja(id, tipo) {
    setGBusy(b => ({ ...b, [id]: true })); setErro(null); setAviso(null);
    try {
      const saved = await setLojaLogistica({ tenantId: tenantDbId, lojaId: id, logistica_tipo: tipo });
      setGestao(gs => (gs ?? []).map(l => (l.id === id ? { ...l, logistica_tipo: tipo } : l)));
      // se for a loja aberta no detalhe AGORA, mantém o card em sincronia. Compara
      // contra a seleção atual (lojaIdRef), não a closure do clique: trocar de loja
      // durante o await não pode injetar a config da loja antiga no card da nova.
      // Quando a loja ainda não tinha config (config=null), adota a linha recém-criada
      // no banco — senão o "Gerar respostas" continua bloqueado mesmo com a logística salva.
      if (id === lojaIdRef.current) {
        setCfgForm(f => ({ ...f, logistica_tipo: tipo }));
        setConfig(c => (c ? { ...c, logistica_tipo: tipo } : saved));
      }
      setAviso('Logística atualizada.');
    } catch (e) { setErro(e.message); }
    setGBusy(b => ({ ...b, [id]: false }));
  }

  async function toggleConsultoria(lojaItem) {
    const nova = !lojaItem.is_consultoria_ativa;
    setGBusy(b => ({ ...b, [lojaItem.id]: true })); setErro(null); setAviso(null);
    try {
      await setLojaConsultoriaAtiva(lojaItem.id, nova);
      setGestao(gs => (gs ?? []).map(l => (l.id === lojaItem.id ? { ...l, is_consultoria_ativa: nova } : l)));
      // reflete a poda no seletor principal
      listLojasConsultoria(tenantDbId).then(setLojas).catch(() => {});
      if (!nova && lojaItem.id === lojaId) { setLojaId(''); setConfig(null); setAvals(null); }
      setAviso(nova ? 'Loja reativada na consultoria.' : 'Loja marcada sem consultoria ativa.');
    } catch (e) { setErro(e.message); }
    setGBusy(b => ({ ...b, [lojaItem.id]: false }));
  }

  async function salvarConfig() {
    if (!cfgForm.logistica_tipo) { setErro('Selecione a logística da loja.'); return; }
    setSalvandoCfg(true); setErro(null);
    try {
      const saved = await saveAvaliacoesConfig({
        tenantId: tenantDbId, lojaId,
        logistica_tipo: cfgForm.logistica_tipo, tom: cfgForm.tom,
      });
      setConfig(saved);
      setGestao(gs => (gs ? gs.map(l => (l.id === lojaId ? { ...l, logistica_tipo: saved.logistica_tipo, tom: saved.tom } : l)) : gs));
      setAviso('Configuração salva.');
    } catch (e) { setErro(e.message); }
    setSalvandoCfg(false);
  }

  async function pedirTom() {
    const reqLojaId = lojaId;
    setSugerindoTom(true); setErro(null);
    try {
      const exemplos = entradas.map(r => r.comentario.trim()).filter(Boolean).slice(0, 20);
      const { tom_sugerido } = await sugerirTomLoja(reqLojaId, exemplos.length ? { exemplos } : {});
      // só injeta o tom se ainda estamos na mesma loja (lojaIdRef): trocar de loja
      // durante o await não pode escrever o tom sugerido da loja antiga no form da nova.
      if (tom_sugerido && reqLojaId === lojaIdRef.current) setCfgForm(f => ({ ...f, tom: tom_sugerido }));
    } catch (e) { setErro(e.message); }
    setSugerindoTom(false);
  }

  function setEntrada(idx, novo) { setEntradas(rows => rows.map((r, i) => (i === idx ? novo : r))); }
  function addEntrada() { setEntradas(rows => [...rows, { ...ROW_VAZIA }]); }
  function removeEntrada(idx) { setEntradas(rows => rows.filter((_, i) => i !== idx)); }

  async function gerar() {
    const payload = entradas
      .filter(r => r.comentario.trim())
      .map(r => ({
        nota: Number(r.nota),
        comentario: r.comentario.trim(),
        nome_cliente: r.nome_cliente.trim() || null,
        tipo: r.tipo,
        prazo_label: r.prazo_label.trim() || null,
      }));
    if (!payload.length) { setErro('Cole ao menos uma avaliação com comentário.'); return; }
    if (!config?.logistica_tipo) { setErro('Salve a logística da loja antes de gerar.'); return; }

    setGerando(true); setErro(null); setAviso(null);
    try {
      const { avaliacoes } = await gerarRespostasAvaliacoes(lojaId, { avaliacoes: payload });
      const n = Array.isArray(avaliacoes) ? avaliacoes.length : 0;
      setEntradas([{ ...ROW_VAZIA }]);
      setAviso(`${n} avaliaç${n === 1 ? 'ão' : 'ões'} processada${n === 1 ? '' : 's'}.`);
      await recarregarAvals();
    } catch (e) { setErro(e.message); }
    setGerando(false);
  }

  async function salvarResposta(id, texto) {
    setAgindo(id); setErro(null); setAviso(null);
    try { await updateAvaliacaoStatus(id, { resposta_final: texto }); setAviso('Resposta salva.'); await recarregarAvals(); }
    catch (e) { setErro(e.message); }
    setAgindo(null);
  }

  async function enviarGrupo(item, texto) {
    setAgindo(item.id); setErro(null); setAviso(null);
    try {
      // persiste a edição antes de enviar (Bridge lê resposta_final || resposta_sugerida)
      if (texto !== (item.resposta_final ?? item.resposta_sugerida ?? '')) {
        await updateAvaliacaoStatus(item.id, { resposta_final: texto });
      }
      const r = await enviarAvaliacoesGrupo(lojaId, { avaliacaoIds: [item.id] });
      const res0 = r?.resultados?.[0];
      const motivoSkip = res0?.skipped === 'nao_responder' ? 'avaliação não respondível (regra de logística)'
        : res0?.skipped === 'sem_resposta' ? 'sem resposta gerada para enviar'
        : null;
      setAviso(res0?.ok
        ? 'Sugestão enviada ao grupo da consultoria.'
        : `Falha no envio: ${motivoSkip || res0?.raw || 'sem detalhe'}`);
      await recarregarAvals();
    } catch (e) { setErro(e.message); }
    setAgindo(null);
  }

  async function mudarStatus(id, status, respostaFinal) {
    setAgindo(id); setErro(null); setAviso(null);
    try {
      const updates = { status };
      if (respostaFinal !== undefined) updates.resposta_final = respostaFinal;
      await updateAvaliacaoStatus(id, updates);
      await recarregarAvals();
    } catch (e) { setErro(e.message); }
    setAgindo(null);
  }

  async function colarAjuste(id, ajuste, respostaFinal) {
    setAgindo(id); setErro(null); setAviso(null);
    try {
      const updates = { ajuste_pedido: ajuste, status: 'ajuste_pedido' };
      if (respostaFinal !== undefined) updates.resposta_final = respostaFinal;
      await updateAvaliacaoStatus(id, updates);
      await recarregarAvals();
    } catch (e) { setErro(e.message); }
    setAgindo(null);
  }

  const lista = avals ?? [];
  const total = lista.length;
  const aguardando = lista.filter(a => ['gerada', 'enviada_grupo', 'ajuste_pedido', 'aprovada_cliente'].includes(a.status)).length;
  const postadas = lista.filter(a => a.status === 'postada').length;

  return (
    <div>
      <h1>Avaliações <span className="cv2-mock">iFood · IA</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Gere respostas humanizadas (≤300 caracteres, no tom da loja) às avaliações do iFood, com insights de consultoria — colagem manual, sem API do iFood.
        {erro ? <span style={{ color: 'var(--red)' }}> · erro: {erro}</span> : ''}
        {aviso ? <span style={{ color: 'var(--green)' }}> · {aviso}</span> : ''}
      </div>

      {/* Gestão das lojas: logística em massa + consultoria ativa */}
      <div className="cv2-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Gerenciar lojas da consultoria</h3>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>
              Marque a logística de cada loja (entrega própria ou logística do iFood) e remova as que não têm mais consultoria ativa.
            </div>
          </div>
          <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={() => setGerir(v => !v)}>
            {gerir ? 'Fechar' : 'Abrir'}
          </button>
        </div>

        {gerir && (
          <div style={{ marginTop: 12 }}>
            {gestao == null && <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Carregando lojas…</div>}
            {gestao && gestao.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhuma loja em consultoria ativa.</div>
            )}
            {gestao && gestao.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--tx2)', marginBottom: 8 }}>
                  <span><b>{gestao.filter(l => l.is_consultoria_ativa !== false).length}</b> ativas</span>
                  <span>· <b>{gestao.filter(l => l.is_consultoria_ativa !== false && !l.logistica_tipo).length}</b> sem logística definida</span>
                  {dupNomes.size > 0 && <span>· <b>{dupNomes.size}</b> nome(s) duplicado(s)</span>}
                </div>
                <div>
                  {gestao.map(l => (
                    <LinhaGestao
                      key={l.id}
                      loja={l}
                      busy={!!gBusy[l.id]}
                      duplicada={dupNomes.has((l.nome || '').trim().toLowerCase())}
                      onLogistica={setLogisticaLoja}
                      onToggleAtiva={toggleConsultoria}
                    />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 8 }}>
                  As mudanças são salvas na hora. Lojas marcadas “sem consultoria” somem da lista ao recarregar a página (reversível enquanto visíveis). Pares <b>duplicados</b> ficam sinalizados — remova um deles se for repetição.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Seletor de loja */}
      <div className="cv2-card">
        <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, display: 'block' }}>Loja em consultoria</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
          <select value={lojaId} onChange={e => { setLojaId(e.target.value); setAviso(null); setErro(null); }} style={{ ...inp, maxWidth: 360 }}>
            <option value="">{lojas == null ? 'Carregando…' : 'Selecione uma loja…'}</option>
            {(lojas ?? []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {loja?.super_restaurante && <span className="cv2-bdg ok" style={{ fontSize: 11 }}>Super Restaurante</span>}
        </div>
      </div>

      {!lojaId && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Selecione uma loja para configurar a logística e gerar respostas.
        </div>
      )}

      {lojaId && loja?.fonte_dados === 'api' && (
        <AvaliacoesReviewApi loja={loja} tenantDbId={tenantDbId} />
      )}

      {lojaId && loja?.fonte_dados !== 'api' && (
        <>
          {/* Config da loja: logística + tom */}
          <div className="cv2-card">
            <h3>Configuração da loja</h3>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 8 }}>Logística (decide o que responder)</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="logistica" checked={cfgForm.logistica_tipo === 'ifood_logistica'} onChange={() => setCfgForm(f => ({ ...f, logistica_tipo: 'ifood_logistica' }))} />
                Logística do iFood <span style={{ color: 'var(--tx2)', fontSize: 11.5 }}>(não responde entrega)</span>
              </label>
              <label style={{ fontSize: 13, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="logistica" checked={cfgForm.logistica_tipo === 'entrega_propria'} onChange={() => setCfgForm(f => ({ ...f, logistica_tipo: 'entrega_propria' }))} />
                Entrega própria <span style={{ color: 'var(--tx2)', fontSize: 11.5 }}>(responde loja e entrega)</span>
              </label>
            </div>

            <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 5 }}>Tom da loja (entra no prompt)</div>
            <textarea value={cfgForm.tom} onChange={e => setCfgForm(f => ({ ...f, tom: e.target.value }))} rows={2} placeholder="Ex.: caloroso e regional, próximo do cliente…" style={{ ...inp, resize: 'vertical' }} />
            {config?.tom_sugerido_ia && config.tom_sugerido_ia !== cfgForm.tom && (
              <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 6 }}>
                Sugestão da IA: <i>{config.tom_sugerido_ia}</i>{' '}
                <button className="cv2-btn sec" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setCfgForm(f => ({ ...f, tom: config.tom_sugerido_ia }))}>usar</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="cv2-btn sec" style={{ fontSize: 12 }} disabled={sugerindoTom} onClick={pedirTom}>
                {sugerindoTom ? 'Sugerindo…' : 'Sugerir tom com IA'}
              </button>
              <button className="cv2-btn" style={{ fontSize: 12 }} disabled={salvandoCfg || !cfgForm.logistica_tipo} onClick={salvarConfig}>
                {salvandoCfg ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
            {carregandoLoja
              ? <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 8 }}>Carregando configuração…</div>
              : (!config && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>Salve a logística antes de gerar respostas.</div>)}
          </div>

          {/* Entrada de avaliações */}
          <div className="cv2-card">
            <h3>Colar avaliações</h3>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
              Cole uma avaliação por bloco (só as com comentário). A regra de logística é aplicada automaticamente na geração.
            </div>
            {entradas.map((row, idx) => (
              <EntradaRow key={idx} row={row} idx={idx} onChange={setEntrada} onRemove={removeEntrada} podeRemover={entradas.length > 1} />
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={addEntrada}>+ adicionar avaliação</button>
              <button className="cv2-btn" style={{ fontSize: 12 }} disabled={gerando || !config?.logistica_tipo} onClick={gerar}>
                {gerando ? 'Gerando…' : 'Gerar respostas'}
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="cv2-kpis">
            <div className="cv2-kpi">
              <div className="l">Avaliações</div>
              <div className="v">{avals ? total : '…'}</div>
              <div className="d mut">nesta loja</div>
            </div>
            <div className="cv2-kpi">
              <div className="l">Aguardando ação</div>
              <div className="v">{avals ? aguardando : '…'}</div>
              <div className={`d${aguardando > 0 ? ' neg' : ' mut'}`}>{aguardando > 0 ? 'em aberto' : 'tudo tratado'}</div>
            </div>
            <div className="cv2-kpi">
              <div className="l">Postadas</div>
              <div className="v">{avals ? postadas : '…'}</div>
              <div className="d mut">concluídas</div>
            </div>
          </div>

          {/* Resultados */}
          {avals == null && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>}
          {avals && total === 0 && (
            <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
              Nenhuma avaliação gerada ainda para esta loja.
            </div>
          )}
          {lista.map(item => (
            <CardAvaliacao
              key={`${item.id}-${item.updated_at}`}
              item={item}
              agindo={agindo}
              onSalvar={salvarResposta}
              onEnviar={enviarGrupo}
              onStatus={mudarStatus}
              onAjuste={colarAjuste}
            />
          ))}
        </>
      )}
    </div>
  );
}
