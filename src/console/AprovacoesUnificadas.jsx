import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { aprovarSugestao, rejeitarSugestao } from '../lib/miaApi.js';

// Bridge: envio real de drafts (ex.: WhatsApp do Breno ao aprovar).
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ============================================================
// T4 · Aprovacoes Unificadas (GAP-3, fecho conceitual: sugestões MIA)
// Fila unificada de aprovacoes pendentes neste workspace:
//   - agent_drafts: mensagens preparadas por agentes aguardando OK
//   - defesa_casos: status aguardando_ok (reaproveitado da Defesa)
//   - sugestoes_ia: sugestões (fact/tarefa) do Monitor IA (MIA) pendentes
// Schema REAL agent_drafts (conferido no banco 2026-06-08):
//   id, tenant_id, agent_name, channel, target_id, subject, content, status,
//   autonomy_level, reviewer_id, reviewed_at, metadata, created_at, ...
// (correção E4b: a versão anterior usava agent_id/recipient/aprovado_* que
//  NÃO existem — toda a fila de drafts degradava p/ vazia, incl. Defesa.)
// sugestoes_ia já existe desde MIA-01 (20260603_008) com RLS hierárquica
// (20260702_003); aprovar/rejeitar via bridge (miaApi) reaproveita a lógica
// já pronta de conversão fact→client_facts / tarefa→tarefas_loja.
// ============================================================

const CANAL_LABELS = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  telegram: 'Telegram',
  telegram_interno: 'Telegram interno',
  painel: 'Painel',
  sms: 'SMS',
  portal_ifood: 'Resposta iFood',
};

const DRAFT_STATUS_APROVAVEL = ['pending', 'aguardando_ok', 'rascunho'];
// canal interno do copiloto do CEO: nunca entra na fila de aprovação do tenant
const CANAIS_OCULTOS = ['telegram_interno'];
// agentes já representados por outra fonte nesta tela (evita duplicata)
const AGENTES_OCULTOS = ['defesa']; // Defesa aparece via defesa_casos

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ItemDraft({ item, onAprovar, onRejeitar, agindo }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(item.content || '');

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className="cv2-bdg warn" style={{ fontSize: 11 }}>DRAFT</span>
            <span className="cv2-bdg mut" style={{ fontSize: 11 }}>
              {CANAL_LABELS[item.channel] || item.channel || 'canal desconhecido'}
            </span>
            {item.agent_name && <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.agent_name}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtData(item.created_at)}</span>
          </div>
          {item.subject && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{item.subject}</div>}
          {item.target_id && (
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 4 }}>
              Para: <b style={{ color: 'var(--ink)' }}>{item.target_id}</b>
            </div>
          )}
          {!editando ? (
            <div
              style={{
                fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.7,
                maxHeight: aberto ? 'none' : 80, overflow: 'hidden',
                cursor: 'pointer', color: 'var(--ink)',
              }}
              onClick={() => setAberto(v => !v)}
            >
              {texto}
            </div>
          ) : (
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={6}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical' }}
            />
          )}
          {!editando && texto && texto.length > 200 && (
            <button
              onClick={() => setAberto(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--tx2)', padding: '2px 0', fontFamily: 'inherit' }}
            >
              {aberto ? 'Recolher' : 'Ver mensagem completa'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            className="cv2-btn sec"
            style={{ fontSize: 12 }}
            disabled={agindo === item.id}
            onClick={() => setEditando(v => !v)}
          >
            {editando ? 'Cancelar' : 'Editar'}
          </button>
          <button
            className="cv2-btn"
            style={{ fontSize: 12 }}
            disabled={agindo === item.id}
            onClick={() => onAprovar(item, editando ? texto : item.content)}
          >
            {agindo === item.id ? '...' : 'Aprovar'}
          </button>
          <button
            className="cv2-btn danger"
            style={{ fontSize: 12 }}
            disabled={agindo === item.id}
            onClick={() => onRejeitar(item.id)}
          >
            Rejeitar
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemDefesa({ caso, onAprovar, onDescartar, agindo }) {
  const an = caso.analise || {};
  const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className={`cv2-bdg ${caso.tipo === 'cancelamento' ? 'err' : 'warn'}`} style={{ fontSize: 11 }}>DEFESA</span>
            <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{caso.tipo}</span>
            {caso.tipo === 'cancelamento' && caso.valor_centavos && (
              <span className="cv2-bdg err" style={{ fontSize: 11 }}>{fmtBRL(caso.valor_centavos)}</span>
            )}
            {an.chance_vitoria && (
              <span className={`cv2-bdg ${an.chance_vitoria === 'alta' ? 'ok' : an.chance_vitoria === 'media' ? 'warn' : 'mut'}`} style={{ fontSize: 11 }}>
                chance {an.chance_vitoria}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtData(caso.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>
            <b>{an.loja_nome || caso.pedido_ref || caso.canal}</b>
            {caso.motivo && <span style={{ color: 'var(--tx2)', marginLeft: 6 }}>— {caso.motivo}</span>}
          </div>
          {Array.isArray(an.fundamentos) && an.fundamentos.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--tx2)' }}>Fundamentos: {an.fundamentos.join(' · ')}</div>
          )}
          {caso.draft_resposta && (
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--tx2)', marginTop: 8, maxHeight: 100, overflow: 'hidden' }}>
              {caso.draft_resposta}
            </pre>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            className="cv2-btn"
            style={{ fontSize: 12 }}
            disabled={agindo === caso.id}
            onClick={() => onAprovar(caso.id)}
          >
            {agindo === caso.id ? '...' : 'Aprovar'}
          </button>
          <button
            className="cv2-btn danger"
            style={{ fontSize: 12 }}
            disabled={agindo === caso.id}
            onClick={() => onDescartar(caso.id)}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemMia({ item, onAprovar, onRejeitar, agindo }) {
  const confiancaBdg = item.confianca === 'alta' ? 'ok' : item.confianca === 'media' ? 'warn' : 'mut';

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className="cv2-bdg mut" style={{ fontSize: 11 }}>MIA</span>
            <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.tipo === 'fact' ? 'Fato' : 'Tarefa'}</span>
            <span className={`cv2-bdg ${confiancaBdg}`} style={{ fontSize: 11 }}>confiança {item.confianca}</span>
            {item.loja?.nome && <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{item.loja.nome}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtData(item.criada_em)}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{item.conteudo}</div>
          {item.evidencia?.trecho && (
            <div style={{ fontSize: 11.5, color: 'var(--tx2)', fontStyle: 'italic', borderLeft: '2px solid var(--line)', paddingLeft: 6 }}>
              "{item.evidencia.trecho}"
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            className="cv2-btn"
            style={{ fontSize: 12 }}
            disabled={agindo === item.id}
            onClick={() => onAprovar(item.id)}
          >
            {agindo === item.id ? '...' : 'Aprovar'}
          </button>
          <button
            className="cv2-btn danger"
            style={{ fontSize: 12 }}
            disabled={agindo === item.id}
            onClick={() => onRejeitar(item.id)}
          >
            Rejeitar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AprovacoesUnificadas({ tenantDbId, userId }) {
  const [drafts, setDrafts] = useState(null);
  const [casos, setCasos] = useState(null);
  const [sugestoes, setSugestoes] = useState(null);
  const [erro, setErro] = useState(null);
  const [agindo, setAgindo] = useState(null);
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [filtroAgente, setFiltroAgente] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  // Contagens reais (não capadas em 100/50/100) — mesmo padrão de ConsoleV2.jsx:251
  // (count exact, head true). Sem isso, o KPI "Total fila" sub-conta (ex.: 394 no
  // tenant Consult, KPI mostrava no max 250 = 100+50+100 caps das listas). As
  // listas continuam capadas para o feed; os KPIs usam estes counts reais.
  const [cDrafts, setCDrafts] = useState(0);
  const [cCasos, setCCasos] = useState(0);
  const [cSugestoes, setCSugestoes] = useState(0);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    try {
      const [{ data: dr, error: e1 }, { data: ca, error: e2 }, { data: sg, error: e3 },
        { count: nD, error: eD }, { count: nC, error: eC }, { count: nS, error: eS },
      ] = await Promise.all([
        supabase
          .from('agent_drafts')
          .select('id, agent_name, channel, target_id, subject, content, status, metadata, created_at, loja_id, loja:lojas(id, nome)')
          .eq('tenant_id', tenantDbId)
          .in('status', DRAFT_STATUS_APROVAVEL)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('defesa_casos')
          .select('id, tipo, canal, pedido_ref, valor_centavos, motivo, analise, draft_resposta, status, criado_por_agente, created_at, loja_id, loja:lojas(id, nome)')
          .eq('tenant_id', tenantDbId)
          .eq('status', 'aguardando_ok')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('sugestoes_ia')
          .select('id, tipo, conteudo, evidencia, confianca, status, criada_em, loja_id, loja:lojas(id, nome)')
          .eq('tenant_id', tenantDbId)
          .eq('status', 'pendente')
          .order('criada_em', { ascending: false })
          .limit(100),
        // Counts reais (mesmos filtros das listas, sem o cap). PostgREST count é
        // exato. Falha numa deles → mantém o último valor (não zera KPI por erro
        // transitório). O count de drafts aplica os mesmos .not('channel'/'agent_name')
        // que draftsAprovacao faz client-side, pra casar com o que a tela mostra.
        supabase.from('agent_drafts').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).in('status', DRAFT_STATUS_APROVAVEL)
          .not('channel', 'in', CANAIS_OCULTOS).not('agent_name', 'in', AGENTES_OCULTOS),
        supabase.from('defesa_casos').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).eq('status', 'aguardando_ok'),
        supabase.from('sugestoes_ia').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).eq('status', 'pendente'),
      ]);

      // e1 pode ser erro de tabela inexistente (agent_drafts) — degradar graciosamente
      if (e2) throw e2;
      if (e3) throw e3;

      // mostra drafts que precisam de aprovação: oculta canal interno do CEO e
      // agentes já representados por outra fonte (Defesa vem via defesa_casos).
      const draftsAprovacao = (dr ?? []).filter(d => !CANAIS_OCULTOS.includes(d.channel) && !AGENTES_OCULTOS.includes(d.agent_name));

      setDrafts(e1 ? [] : draftsAprovacao);
      setCasos(ca ?? []);
      setSugestoes(sg ?? []);
      if (!eD) setCDrafts(nD ?? 0);
      if (!eC) setCCasos(nC ?? 0);
      if (!eS) setCSugestoes(nS ?? 0);
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function aprovarDraft(item, content) {
    const id = item.id;
    setAgindo(id);

    // Drafts de ESCRITA no iFood (operacao 'ifood.*'): o Bridge é a única porta de
    // escrita e exige o draft AINDA em 'pending' (amarelo) — ele mesmo marca
    // sent/failed. Por isso NÃO marcamos 'approved' aqui: isso quebraria o /aprovar
    // (Draft não está pendente → 409). metadata vem como objeto (jsonb) ou string JSON.
    const meta = typeof item.metadata === 'string'
      ? (() => { try { return JSON.parse(item.metadata); } catch { return null; } })()
      : item.metadata;
    if (meta?.operacao?.startsWith?.('ifood.')) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${BRIDGE}/api/ifood/aprovar/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: tenantDbId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Bridge deixou o draft como failed (ou inalterado); não forçamos 'approved'.
          setErro(`Falha ao executar no iFood: ${err.error || err.details?.message || res.status}`);
        }
      } catch (e) {
        setErro(`Falha ao executar no iFood: ${e.message}`);
      }
      setAgindo(null);
      await carregar(); // some da fila em sucesso (vira 'sent'); permanece se 'failed'/erro
      return;
    }

    // Drafts do GESTOR (whatsapp ou portal_ifood): o Bridge é a única porta de execução
    // e exige o draft AINDA em 'pending' — ele mesmo marca sent/failed. Mesma lógica do
    // caso ifood.* acima: NÃO marcamos 'approved' aqui.
    if (item.agent_name === 'gestor') {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${BRIDGE}/api/gestor/aprovar/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: tenantDbId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setErro(`Falha ao executar draft do Gestor: ${err.error || res.status}`);
        }
      } catch (e) {
        setErro(`Falha ao executar draft do Gestor: ${e.message}`);
      }
      setAgindo(null);
      await carregar();
      return;
    }

    const { error } = await supabase
      .from('agent_drafts')
      .update({ status: 'approved', content, reviewer_id: userId ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { setAgindo(null); setErro(error.message); return; }

    // Drafts de WhatsApp do Breno: além de aprovar, enviar de fato ao cliente
    // via o endpoint genérico do Bridge (resolve a instância Evolution + envia).
    if (item.channel === 'whatsapp' && item.agent_name === 'breno') {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${BRIDGE}/api/breno/aprovar/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: tenantDbId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setErro(`Aprovado, mas falhou ao enviar: ${err.error || res.status}`);
        }
      } catch (e) {
        setErro(`Aprovado, mas falhou ao enviar: ${e.message}`);
      }
    }

    setAgindo(null);
    await carregar();
  }

  async function rejeitarDraft(id) {
    setAgindo(id);
    const { error } = await supabase
      .from('agent_drafts')
      .update({ status: 'rejected', reviewer_id: userId ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    setAgindo(null);
    if (error) { setErro(error.message); return; }
    await carregar();
  }

  async function aprovarCaso(id) {
    setAgindo(id);
    const { error } = await supabase
      .from('defesa_casos')
      .update({ status: 'aprovado', aprovado_por: userId ?? null, aprovado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    setAgindo(null);
    if (error) { setErro(error.message); return; }
    await carregar();
  }

  async function descartarCaso(id) {
    setAgindo(id);
    const { error } = await supabase
      .from('defesa_casos')
      .update({ status: 'descartado', updated_at: new Date().toISOString() })
      .eq('id', id);
    setAgindo(null);
    if (error) { setErro(error.message); return; }
    await carregar();
  }

  // Aprovar/rejeitar reaproveitam a lógica já pronta no bridge (miaApi):
  // aprovar cria client_facts (tipo=fact) ou tarefas_loja (tipo=tarefa);
  // nenhum envio a cliente em nenhum dos dois casos.
  async function aprovarSugestaoMia(id) {
    setAgindo(id);
    try {
      await aprovarSugestao(id);
    } catch (err) {
      setErro(err?.message || 'erro ao aprovar sugestão MIA');
    }
    setAgindo(null);
    await carregar();
  }

  async function rejeitarSugestaoMia(id) {
    setAgindo(id);
    try {
      await rejeitarSugestao(id);
    } catch (err) {
      setErro(err?.message || 'erro ao rejeitar sugestão MIA');
    }
    setAgindo(null);
    await carregar();
  }

  // KPIs usam counts reais (count: 'exact', head: true), não o length do array
  // capado. As listas continuam capadas (100/50/100) para o feed/filtros.
  const totalDrafts = cDrafts;
  const totalCasos = cCasos;
  const totalSugestoes = cSugestoes;
  const total = totalDrafts + totalCasos + totalSugestoes;

  // Opcoes de filtro derivadas dos itens carregados (origem/agente/loja).
  // MIA não entra aqui: já tem opção dedicada no filtro de Origem, evitando duplicidade.
  const agentesDisponiveis = [...new Set([
    ...(drafts ?? []).map(d => d.agent_name).filter(Boolean),
    ...(casos ?? []).map(c => c.criado_por_agente).filter(Boolean),
  ])].sort();
  const lojasDisponiveis = Object.values(
    [...(drafts ?? []), ...(casos ?? []), ...(sugestoes ?? [])].reduce((acc, item) => {
      if (item.loja?.id) acc[item.loja.id] = item.loja;
      return acc;
    }, {})
  ).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  const draftsFiltrados = (drafts ?? []).filter(d => {
    if (filtroOrigem === 'defesa' || filtroOrigem === 'mia') return false;
    if (filtroAgente && d.agent_name !== filtroAgente) return false;
    if (filtroLoja && d.loja_id !== filtroLoja) return false;
    return true;
  });
  const casosFiltrados = (casos ?? []).filter(c => {
    if (filtroOrigem === 'draft' || filtroOrigem === 'mia') return false;
    if (filtroAgente && c.criado_por_agente !== filtroAgente) return false;
    if (filtroLoja && c.loja_id !== filtroLoja) return false;
    return true;
  });
  const sugestoesFiltradas = (sugestoes ?? []).filter(s => {
    if (filtroOrigem === 'draft' || filtroOrigem === 'defesa') return false;
    if (filtroAgente) return false; // MIA não tem agent_name — filtro de agente não se aplica
    if (filtroLoja && s.loja_id !== filtroLoja) return false;
    return true;
  });
  const temFiltroAtivo = filtroOrigem || filtroAgente || filtroLoja;

  return (
    <div>
      <h1>Aprovacoes <span className="cv2-mock" style={{ background: total > 0 ? undefined : 'var(--green-soft)', color: total > 0 ? undefined : 'var(--green)' }}>
        {total > 0 ? `${total} PENDENTE${total > 1 ? 'S' : ''}` : 'TUDO APROVADO'}
      </span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Fila unificada: mensagens de agentes + contestacoes de Defesa + sugestões do MIA aguardando seu OK.{erro ? ` · erro: ${erro}` : ''}</div>

      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Mensagens pendentes</div>
          <div className="v">{drafts ? totalDrafts : '…'}</div>
          <div className={`d${totalDrafts > 0 ? ' neg' : ' mut'}`}>agent_drafts</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Defesa pendente</div>
          <div className="v">{casos ? totalCasos : '…'}</div>
          <div className={`d${totalCasos > 0 ? ' neg' : ' mut'}`}>defesa_casos</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Sugestões MIA</div>
          <div className="v">{sugestoes ? totalSugestoes : '…'}</div>
          <div className={`d${totalSugestoes > 0 ? ' neg' : ' mut'}`}>sugestoes_ia</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Total fila</div>
          <div className="v">{drafts && casos && sugestoes ? total : '…'}</div>
          <div className={`d${total > 0 ? ' neg' : ' mut'}`}>{total > 0 ? 'aguardando OK' : 'fila limpa'}</div>
        </div>
      </div>

      {drafts && casos && sugestoes && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          <select className="cv2-btn sec" style={{ fontSize: 12 }} value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}>
            <option value="">Origem: todas</option>
            <option value="draft">Mensagens de agentes</option>
            <option value="defesa">Defesa Comercial</option>
            <option value="mia">MIA</option>
          </select>
          <select className="cv2-btn sec" style={{ fontSize: 12 }} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
            <option value="">Agente: todos</option>
            {agentesDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="cv2-btn sec" style={{ fontSize: 12 }} value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}>
            <option value="">Loja: todas</option>
            {lojasDisponiveis.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {temFiltroAtivo && (
            <button
              className="cv2-btn sec"
              style={{ fontSize: 12 }}
              onClick={() => { setFiltroOrigem(''); setFiltroAgente(''); setFiltroLoja(''); }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Mensagens de agentes */}
      {drafts && draftsFiltrados.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em', margin: '16px 0 8px', textTransform: 'uppercase' }}>
            Mensagens de agentes ({draftsFiltrados.length})
          </div>
          {draftsFiltrados.map(d => (
            <ItemDraft
              key={d.id}
              item={d}
              agindo={agindo}
              onAprovar={aprovarDraft}
              onRejeitar={rejeitarDraft}
            />
          ))}
        </>
      )}

      {/* Defesa Comercial */}
      {casos && casosFiltrados.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em', margin: '16px 0 8px', textTransform: 'uppercase' }}>
            Defesa Comercial ({casosFiltrados.length})
          </div>
          {casosFiltrados.map(c => (
            <ItemDefesa
              key={c.id}
              caso={c}
              agindo={agindo}
              onAprovar={aprovarCaso}
              onDescartar={descartarCaso}
            />
          ))}
        </>
      )}

      {/* Sugestões MIA */}
      {sugestoes && sugestoesFiltradas.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em', margin: '16px 0 8px', textTransform: 'uppercase' }}>
            Sugestões MIA ({sugestoesFiltradas.length})
          </div>
          {sugestoesFiltradas.map(s => (
            <ItemMia
              key={s.id}
              item={s}
              agindo={agindo}
              onAprovar={aprovarSugestaoMia}
              onRejeitar={rejeitarSugestaoMia}
            />
          ))}
        </>
      )}

      {drafts && casos && sugestoes && total === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Fila limpa — nenhuma aprovacao pendente neste workspace.
        </div>
      )}

      {drafts && casos && sugestoes && total > 0 && draftsFiltrados.length === 0 && casosFiltrados.length === 0 && sugestoesFiltradas.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhum item pendente com esses filtros.
        </div>
      )}

      {(!drafts || !casos || !sugestoes) && (
        <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando...</div>
      )}
    </div>
  );
}
