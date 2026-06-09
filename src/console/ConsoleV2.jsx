import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { CvSprite, Ico } from './CvIcons.jsx';
// telas cv2 (visual claro)
import AtivarLoja from './AtivarLoja.jsx';
import Clientes from './Clientes.jsx';
import Estudio from './Estudio.jsx';
import CustosIA from './CustosIA.jsx';
import PainelAgentes from './PainelAgentes.jsx';
import Execucoes from './Execucoes.jsx';
import AprovacoesUnificadas from './AprovacoesUnificadas.jsx';
import ImportarRelatorios from './ImportarRelatorios.jsx';
import RadarReal from './RadarReal.jsx';
import AnaliseLoja from './AnaliseLoja.jsx';
import AgenteConfig from './AgenteConfig.jsx';
import AuditLog from './AuditLog.jsx';
import AcessoUsuarios from './AcessoUsuarios.jsx';
import Habilidades from './Habilidades.jsx';
import Templates from './Templates.jsx';
import AgenteAnalise from './AgenteAnalise.jsx';
import Marca from './Marca.jsx';
import ChatV2 from './ChatV2.jsx';
import { Gatilhos, Topicos, TarefasAgendadas, Links, Provedores, Integracoes, Sistemas, Arquivos } from './CvNovas.jsx';
// telas reusadas do console clássico (funcionais — visual convertido nas ondas 2-3)
import ChatScreen from '../screens/ChatScreen.jsx';
import DeliScreen from '../screens/DeliScreen.jsx';
import CrmScreen from '../screens/CRMScreen.jsx';
import MiaAuditScreen from '../screens/MiaAuditScreen.jsx';
import InadimplentesScreen from '../screens/InadimplentesScreen.jsx';
import AutomacoesScreen from '../screens/AutomacoesScreen.jsx';
import HeartbeatsScreen from '../screens/HeartbeatsScreen.jsx';
import GoalsScreen from '../screens/GoalsScreen.jsx';
import MemoriesScreen from '../screens/MemoriesScreen.jsx';
import KnowledgeBaseScreen from '../screens/KnowledgeBaseScreen.jsx';
import SettingsScreen from '../screens/SettingsScreen.jsx';
import LojasScreen from '../screens/lojas/LojasScreen.jsx';
import './console.css';

// ============================================================
// Console v2 — estrutura IDÊNTICA ao protótipo (docs/prototipo/console-v2.html)
// 5 grupos · ícones do protótipo · topbar fiel (créditos/tenant/sino/avatar).
// Chat ao Vivo = ChatV2 (visual claro) com fallback para o chat clássico completo.
// ============================================================

const GRUPOS = [
  { label: 'Início', items: [
    { id: 'visao', ic: 'i-grid', label: 'Visão Geral' },
    { id: 'deli', ic: 'i-bot', label: 'DELI' },
  ]},
  { label: 'Operação', items: [
    { id: 'crm', ic: 'i-users', label: 'Clientes' },
    { id: 'lojas', ic: 'i-store', label: 'Lojas' },
    { id: 'chat', ic: 'i-chat', label: 'Chat ao Vivo' },
    { id: 'mia', ic: 'i-eye', label: 'Conversas · MIA' },
    { id: 'aprovacoes', ic: 'i-check', label: 'Aprovações' },
    { id: 'cobranca', ic: 'i-cash', label: 'Cobrança' },
    { id: 'defesa', ic: 'i-shield', label: 'Defesa Comercial' },
    { id: 'radar', ic: 'i-radio', label: 'Radar (grátis)' },
    { id: 'ativar', ic: 'i-plug', label: 'Ativar loja' },
  ]},
  { label: 'Agentes IA', items: [
    { id: 'catalogo', ic: 'i-box', label: 'Catálogo' },
    { id: 'estudio', ic: 'i-palette', label: 'Estúdio de Conteúdo' },
    { id: 'habilidades', ic: 'i-zap', label: 'Habilidades' },
    { id: 'analise', ic: 'i-chart', label: 'Análise de Loja' },
    { id: 'cardapio', ic: 'i-menu', label: 'Cardápio' },
    { id: 'multicanal', ic: 'i-layers', label: 'Multicanal' },
    { id: 'rotinas', ic: 'i-clock', label: 'Rotinas' },
    { id: 'tarefas', ic: 'i-list', label: 'Tarefas agendadas' },
    { id: 'gatilhos', ic: 'i-zap', label: 'Gatilhos' },
    { id: 'heartbeats', ic: 'i-radio', label: 'Heartbeats' },
    { id: 'atividade', ic: 'i-list', label: 'Atividade' },
    { id: 'metas', ic: 'i-target', label: 'Metas' },
    { id: 'topicos', ic: 'i-flag', label: 'Tópicos' },
    { id: 'modelos', ic: 'i-doc', label: 'Modelos' },
    { id: 'config', ic: 'i-gear', label: 'Config de Agentes' },
  ]},
  { label: 'Dados', items: [
    { id: 'arquivos', ic: 'i-folder', label: 'Arquivos' },
    { id: 'links', ic: 'i-link', label: 'Links compartilhados' },
    { id: 'memoria', ic: 'i-brain', label: 'Memória dos agentes' },
    { id: 'conhecimento', ic: 'i-book', label: 'Conhecimento (RAG)' },
    { id: 'custos', ic: 'i-dollar', label: 'Custos de IA' },
    { id: 'importar', ic: 'i-save', label: 'Importar relatórios' },
  ]},
  { label: 'Sistema', items: [
    { id: 'configsys', ic: 'i-gear', label: 'Configurações' },
    { id: 'clientesplat', ic: 'i-users', label: 'Clientes (plataforma)' },
    { id: 'marca', ic: 'i-droplet', label: 'Marca' },
    { id: 'provedores', ic: 'i-cpu', label: 'Provedores de IA' },
    { id: 'integracoes', ic: 'i-plug', label: 'Integrações' },
    { id: 'sistemas', ic: 'i-box', label: 'Sistemas externos' },
    { id: 'acesso', ic: 'i-key', label: 'Acesso por usuário' },
    { id: 'auditoria', ic: 'i-scroll', label: 'Auditoria' },
  ]},
];

const LABELS = {};
GRUPOS.forEach(g => g.items.forEach(it => { LABELS[it.id] = it.label; }));

// telas reusadas do clássico (dark) — renderizadas em área cheia até converter
const LEGADO = new Set(['deli', 'crm', 'lojas', 'mia', 'cobranca', 'rotinas', 'heartbeats', 'metas', 'memoria', 'conhecimento', 'configsys']);

const OK_STATUSES = ['ok', 'completed', 'success'];
const CREDITOS_MES = 10000; // freemium: 10k créditos/mês, 1 por execução de IA
const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtK = n => (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n));

// lista de tenants do usuário + seleção (seletor de tenant da topbar)
function useTenants(userId, fallback) {
  const [list, setList] = useState(fallback?.dbId ? [fallback] : []);
  const [sel, setSel] = useState(fallback?.dbId ? fallback : null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('tenant_members').select('tenants(id, name, slug)').eq('user_id', userId);
      if (!alive || !Array.isArray(data)) return;
      const mapped = data.filter(d => d.tenants).map(d => ({ dbId: d.tenants.id, slug: d.tenants.slug, nome: d.tenants.name }));
      const uniq = [...new Map(mapped.map(m => [m.dbId, m])).values()];
      if (uniq.length) {
        setList(uniq);
        setSel(prev => (prev && uniq.find(u => u.dbId === prev.dbId)) || uniq[0]);
      }
    })();
    return () => { alive = false; };
  }, [userId]);
  return [list, sel, setSel];
}

// créditos (execuções do mês) + notificações não-lidas
function useTopbar(tenantDbId, userId) {
  const [s, setS] = useState({ runs: null, notif: 0 });
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      try {
        const ini = new Date(); ini.setUTCDate(1); ini.setUTCHours(0, 0, 0, 0);
        const [{ count: runs }, notifRes] = await Promise.all([
          supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).gte('created_at', ini.toISOString()),
          userId
            ? supabase.from('internal_notifications').select('*', { count: 'exact', head: true }).eq('recipient_user_id', userId).is('read_at', null)
            : Promise.resolve({ count: 0 }),
        ]);
        if (alive) setS({ runs: runs ?? 0, notif: notifRes?.count ?? 0 });
      } catch { if (alive) setS({ runs: 0, notif: 0 }); }
    })();
    return () => { alive = false; };
  }, [tenantDbId, userId]);
  return s;
}

function useBranding(tenantDbId) {
  const [b, setB] = useState(null);
  const load = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase.from('tenants').select('name, theme_color, color, logo_url').eq('id', tenantDbId).maybeSingle();
    if (data) setB({ nome: data.name, cor: data.theme_color || data.color || null, logo: data.logo_url || null });
  }, [tenantDbId]);
  useEffect(() => { load(); }, [load]);
  return [b, load];
}

function useKpisReais(tenantDbId) {
  const [kpis, setKpis] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      try {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const base = () => supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).gte('created_at', desde);
        const mesAtual = new Date(); mesAtual.setUTCDate(1); mesAtual.setUTCHours(0, 0, 0, 0);
        const [
          { count: total, error: e1 },
          { count: ok, error: e2 },
          { data: comCusto, error: e3 },
          { count: agentes, error: e4 },
          { data: metricas, error: e5 },
        ] = await Promise.all([
          base(),
          base().in('status', OK_STATUSES),
          supabase.from('agent_runs').select('cost_usd').eq('tenant_id', tenantDbId).gte('created_at', desde).gt('cost_usd', 0),
          supabase.from('tenant_agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId),
          supabase.from('defesa_metricas_mensal').select('*').eq('tenant_id', tenantDbId).gte('mes', mesAtual.toISOString()),
        ]);
        if (e1 || e2 || e3 || e4 || e5) throw (e1 || e2 || e3 || e4 || e5);
        const t = total ?? 0;
        const o = ok ?? 0;
        const custo = (comCusto ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
        const m = (metricas ?? [])[0] || {};
        if (alive) setKpis({
          total: t, ok: o, falhas: t - o,
          taxa: t ? Math.round((o / t) * 100) : null,
          custo, agentes: agentes ?? 0,
          defendidoCentavos: Number(m.defendido_centavos) || 0,
          ganhos: Number(m.ganhos) || 0,
          aguardandoOk: Number(m.aguardando_ok) || 0,
        });
      } catch (err) {
        if (alive) setErro(err?.message || 'erro ao carregar');
      }
    })();
    return () => { alive = false; };
  }, [tenantDbId]);
  return { kpis, erro };
}

function useAlertas(tenantDbId) {
  const [al, setAl] = useState([]);
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      const [{ count: casos }, { count: atrasadas }, { count: fontesPend }] = await Promise.all([
        supabase.from('defesa_casos').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).eq('status', 'aguardando_ok'),
        supabase.from('defesa_assinaturas').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).eq('status', 'atrasada'),
        supabase.from('radar_fontes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).eq('status', 'pendente'),
      ]);
      if (!alive) return;
      const lista = [];
      if ((casos ?? 0) > 0) lista.push({ cls: 'err', txt: `${casos} caso(s) de Defesa aguardando seu OK`, ir: 'defesa' });
      if ((atrasadas ?? 0) > 0) lista.push({ cls: 'err', txt: `${atrasadas} assinatura(s) atrasada(s)`, ir: 'cobranca' });
      if ((fontesPend ?? 0) > 0) lista.push({ cls: 'warn', txt: `${fontesPend} relatório(s) em processamento`, ir: 'importar' });
      setAl(lista);
    })();
    return () => { alive = false; };
  }, [tenantDbId]);
  return al;
}

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function VisaoGeral({ tenantNome, tenantDbId, onNav }) {
  const { kpis, erro } = useKpisReais(tenantDbId);
  const alertas = useAlertas(tenantDbId);
  const fmt = n => (n ?? 0).toLocaleString('pt-BR');
  return (
    <div>
      <h1>Visão Geral <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS · ÚLTIMOS 30 DIAS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{tenantNome}{erro ? ` · erro ao carregar: ${erro}` : ''}</div>

      {alertas.length > 0 && (
        <div className="cv2-card" style={{ borderLeft: '3px solid var(--red)' }}>
          <h3>Atenção — precisa de você</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {alertas.map((a, i) => (
              <div key={i} className="cv2-spread">
                <span><span className={`cv2-bdg ${a.cls}`} style={{ marginRight: 8 }}>!</span>{a.txt}</span>
                <button className="cv2-btn sec" onClick={() => onNav(a.ir)}>Abrir</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cv2-kpis">
        <Kpi l="Execuções de agentes" v={kpis ? fmt(kpis.total) : '…'} d={kpis ? `${fmt(kpis.ok)} ok · ${fmt(kpis.falhas)} falhas` : 'carregando'} neg={kpis ? kpis.falhas > 0 : false} />
        <Kpi l="Taxa de sucesso" v={kpis ? (kpis.taxa != null ? `${kpis.taxa}%` : '—') : '…'} d={kpis && kpis.taxa != null ? (kpis.taxa >= 95 ? 'saudável' : 'investigar falhas') : ''} mut />
        <Kpi l="Custo de IA (30d)" v={kpis ? `US$ ${kpis.custo.toFixed(4)}` : '…'} d="todos os agentes" mut />
        <Kpi l="Agentes habilitados" v={kpis ? fmt(kpis.agentes) : '…'} d="neste workspace" mut />
        <Kpi l="R$ defendido no mês" v={kpis ? fmtBRL(kpis.defendidoCentavos) : '…'} d={kpis ? `${fmt(kpis.ganhos)} casos ganhos` : ''} />
        <Kpi l="Casos aguardando seu OK" v={kpis ? fmt(kpis.aguardandoOk) : '…'} d="abrir Defesa Comercial" neg={kpis ? kpis.aguardandoOk > 0 : false} />
      </div>
      <div className="cv2-card">
        <h3>Como funciona o copiloto</h3>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8 }}>
          1. Os agentes vigiam cancelamentos e avaliações das suas lojas · 2. Preparam a contestação ou a resposta com a melhor chance de vitória · 3. <b style={{ color: 'var(--ink)' }}>Você só dá o OK</b> · 4. O painel mostra o dinheiro defendido, mês a mês.
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="cv2-btn" onClick={() => onNav('defesa')}>Abrir fila de Defesa</button>
        </div>
      </div>
    </div>
  );
}

function PaywallDefesa() {
  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock">NÃO ATIVA NESTE WORKSPACE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-card" style={{ maxWidth: 620 }}>
        <h3>Pare de perder dinheiro com cancelamentos</h3>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
          A Defesa Comercial vigia os cancelamentos e avaliações da sua loja 24h por dia, prepara a contestação com a melhor chance de vitória e espera o seu OK — pelo painel ou respondendo “@defesa ok” no WhatsApp. O painel mostra, mês a mês, quanto dinheiro foi defendido.
        </div>
        <div style={{ margin: '14px 0 6px', fontSize: 22, fontWeight: 800 }}>R$ 147<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx2)' }}> /loja/mês · sem taxa de ativação</span></div>
        <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 14 }}>O Radar gratuito continua disponível no menu ao lado — ele mostra quanto está vazando.</div>
        <button className="cv2-btn" onClick={() => { window.location.href = 'mailto:wandson@consultdelivery.com.br?subject=Quero ativar a Defesa Comercial'; }}>Quero ativar a Defesa</button>
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 10 }}>Assinatura automática em breve — por enquanto a ativação é feita pela equipe Consult Delivery em até 1 dia útil.</div>
      </div>
    </div>
  );
}

function CasoCard({ c, children }) {
  const an = c.analise || {};
  return (
    <div className="cv2-caso">
      <div className="cv2-spread">
        <div style={{ minWidth: 0 }}>
          <span className={`cv2-bdg ${c.tipo === 'cancelamento' ? 'err' : 'warn'}`}>{c.tipo === 'cancelamento' ? `cancelamento · ${fmtBRL(c.valor_centavos)}` : 'avaliação'}</span>
          {c.status !== 'aguardando_ok' && <span className="cv2-bdg mut" style={{ marginLeft: 6 }}>{c.status}</span>}
          {an.chance_vitoria && <span className={`cv2-bdg ${an.chance_vitoria === 'alta' ? 'ok' : an.chance_vitoria === 'media' ? 'warn' : 'mut'}`} style={{ marginLeft: 6 }}>chance {an.chance_vitoria}</span>}
          <b style={{ marginLeft: 8, fontSize: 13 }}>{an.loja_nome || c.pedido_ref || c.canal}</b>
          <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 3 }}>{c.motivo}</div>
          {Array.isArray(an.fundamentos) && an.fundamentos.length > 0 && c.status === 'aguardando_ok' && (
            <div style={{ color: 'var(--tx2)', fontSize: 11.5, marginTop: 4 }}><b>Fundamentos:</b> {an.fundamentos.join(' · ')}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Defesa({ tenantDbId, userId }) {
  const [fila, setFila] = useState(null);
  const [andamento, setAndamento] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [ganhoDe, setGanhoDe] = useState(null);
  const [valorGanho, setValorGanho] = useState('');
  const [agindo, setAgindo] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const cols = 'id, tipo, canal, pedido_ref, valor_centavos, motivo, analise, draft_resposta, status, created_at';
    const [{ data: f, error: e1 }, { data: a, error: e2 }] = await Promise.all([
      supabase.from('defesa_casos').select(cols).eq('tenant_id', tenantDbId).eq('status', 'aguardando_ok').order('created_at', { ascending: false }).limit(50),
      supabase.from('defesa_casos').select(cols).eq('tenant_id', tenantDbId).in('status', ['aprovado', 'enviado']).order('created_at', { ascending: false }).limit(50),
    ]);
    if (e1 || e2) { setErro((e1 || e2).message); return; }
    setFila(f ?? []);
    setAndamento(a ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function atualizar(caso, patch) {
    setAgindo(caso.id);
    const { error } = await supabase.from('defesa_casos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', caso.id);
    setAgindo(null);
    if (error) { setErro(error.message); return false; }
    await carregar();
    return true;
  }

  const aprovar = c => atualizar(c, { status: 'aprovado', aprovado_por: userId ?? null, aprovado_em: new Date().toISOString() });
  const descartar = c => atualizar(c, { status: 'descartado' });
  const marcarEnviado = c => atualizar(c, { status: 'enviado', enviado_em: new Date().toISOString() });
  const marcarPerdido = c => atualizar(c, { status: 'perdido', resultado_valor_centavos: 0 });

  async function confirmarGanho(c) {
    const normalizado = String(valorGanho).replace(/\./g, '').replace(',', '.');
    const reais = Number(normalizado);
    if (!Number.isFinite(reais) || reais < 0) { setErro('valor inválido'); return; }
    const ok = await atualizar(c, { status: 'ganho', resultado_valor_centavos: Math.round(reais * 100) });
    if (ok) { setGanhoDe(null); setValorGanho(''); }
  }

  async function salvarEdicao(caso) {
    const ok = await atualizar(caso, { draft_resposta: textoEdit });
    if (ok) setEditando(null);
  }

  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>FILA REAL</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Casos preparados pelo agente — revise e dê o OK (aqui ou respondendo “@defesa ok” na conversa do caso).{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Aguardando seu OK" v={fila ? fila.length : '…'} d="revisar agora" neg={fila ? fila.length > 0 : false} />
        <Kpi l="Em andamento" v={andamento ? andamento.length : '…'} d="aprovados/enviados — registre o resultado" mut />
      </div>

      {fila && fila.map(c => {
        const emEdicao = editando === c.id;
        return (
          <div key={c.id}>
            <CasoCard c={c}>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="cv2-btn" disabled={agindo === c.id} onClick={() => aprovar(c)}>Aprovar</button>
                <button className="cv2-btn sec" disabled={agindo === c.id} onClick={() => { setEditando(emEdicao ? null : c.id); setTextoEdit(c.draft_resposta || ''); }}>{emEdicao ? 'Cancelar' : 'Editar'}</button>
                <button className="cv2-btn danger" disabled={agindo === c.id} onClick={() => descartar(c)}>Descartar</button>
              </div>
            </CasoCard>
            {emEdicao ? (
              <div style={{ margin: '-6px 0 10px' }}>
                <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={8}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, padding: 10, border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical' }} />
                <div style={{ marginTop: 6 }}><button className="cv2-btn" disabled={agindo === c.id} onClick={() => salvarEdicao(c)}>Salvar texto</button></div>
              </div>
            ) : (
              <div className="cv2-caso" style={{ marginTop: -6, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 0 }}>
                <div className="draft" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{c.draft_resposta}</div>
              </div>
            )}
          </div>
        );
      })}
      {fila && !fila.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Fila limpa — nenhum caso esperando você.</div>}

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Em andamento — registre o resultado</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Quando o marketplace responder, marque <b>Ganho</b> (informe o valor recuperado — alimenta o painel “R$ defendido”) ou <b>Perdido</b>.</div>
      {andamento && andamento.map(c => (
        <div key={c.id}>
          <CasoCard c={c}>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
              {c.status === 'aprovado' && <button className="cv2-btn sec" disabled={agindo === c.id} onClick={() => marcarEnviado(c)}>Marcar enviado</button>}
              {ganhoDe === c.id ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>R$</span>
                  <input value={valorGanho} onChange={e => setValorGanho(e.target.value)} autoFocus
                    style={{ width: 90, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12.5 }} />
                  <button className="cv2-btn" disabled={agindo === c.id} onClick={() => confirmarGanho(c)}>Confirmar</button>
                  <button className="cv2-btn sec" onClick={() => { setGanhoDe(null); setValorGanho(''); }}>Cancelar</button>
                </>
              ) : (
                <>
                  <button className="cv2-btn" disabled={agindo === c.id} onClick={() => { setGanhoDe(c.id); setValorGanho((c.valor_centavos / 100).toFixed(2).replace('.', ',')); }}>Ganho</button>
                  <button className="cv2-btn danger" disabled={agindo === c.id} onClick={() => marcarPerdido(c)}>Perdido</button>
                </>
              )}
            </div>
          </CasoCard>
        </div>
      ))}
      {andamento && !andamento.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nada em andamento.</div>}
    </div>
  );
}

export default function ConsoleV2({ tenantInfo, tenantDbId: propDbId, userId, onExit }) {
  const [tela, setTela] = useState('visao');
  const [defesaOn, setDefesaOn] = useState(null);
  const [chatFull, setChatFull] = useState(false);
  const [tenantsList, sel, setSel] = useTenants(userId, { dbId: propDbId, slug: tenantInfo?.id, nome: tenantInfo?.name });

  // tenant ativo = selecionado no topo (todas as telas seguem isto)
  const tenantDbId = sel?.dbId || propDbId;
  const tenantSlug = sel?.slug || tenantInfo?.id;
  const [brand, recarregarBrand] = useBranding(tenantDbId);
  const tenantNome = brand?.nome || sel?.nome || tenantInfo?.name || 'Workspace';
  const { runs, notif } = useTopbar(tenantDbId, userId);
  const creditosTxt = runs == null ? '…' : fmtK(Math.max(0, CREDITOS_MES - runs));

  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    supabase.from('tenant_agents').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantDbId).eq('agent_id', 'defesa')
      .then(({ count }) => { if (alive) setDefesaOn((count ?? 0) > 0); });
    return () => { alive = false; };
  }, [tenantDbId]);

  // ao sair do chat, volta o ChatV2 (claro) como padrão
  useEffect(() => { if (tela !== 'chat') setChatFull(false); }, [tela]);

  const temaStyle = brand?.cor ? { '--red': brand.cor, '--red-dark': brand.cor, '--red-soft': brand.cor + '1a' } : undefined;
  const ehChat = tela === 'chat';
  const ehLegado = LEGADO.has(tela);
  const nav = setTela;

  function render() {
    switch (tela) {
      case 'visao': return <VisaoGeral tenantNome={tenantNome} tenantDbId={tenantDbId} onNav={nav} />;
      case 'deli': return <DeliScreen tenantDbId={tenantDbId} userId={userId} />;
      case 'crm': return <CrmScreen tenant={tenantSlug} tenantDbId={tenantDbId} onNavigate={nav} />;
      case 'lojas': return <LojasScreen tenantDbId={tenantDbId} userId={userId} />;
      case 'mia': return <MiaAuditScreen tenantDbId={tenantDbId} />;
      case 'aprovacoes': return <AprovacoesUnificadas tenantDbId={tenantDbId} userId={userId} />;
      case 'cobranca': return <InadimplentesScreen tenantDbId={tenantDbId} userId={userId} />;
      case 'defesa': return defesaOn === false ? <PaywallDefesa /> : <Defesa tenantDbId={tenantDbId} userId={userId} />;
      case 'radar': return <RadarReal tenantNome={tenantNome} tenantDbId={tenantDbId} />;
      case 'ativar': return <AtivarLoja tenantDbId={tenantDbId} />;
      case 'catalogo': return <PainelAgentes tenantDbId={tenantDbId} />;
      case 'estudio': return <Estudio tenantDbId={tenantDbId} userId={userId} />;
      case 'habilidades': return <Habilidades tenantDbId={tenantDbId} userId={userId} />;
      case 'analise': return <AnaliseLoja tenantDbId={tenantDbId} userId={userId} />;
      case 'cardapio': return <AgenteAnalise tenantDbId={tenantDbId} userId={userId} agente="cardapio" titulo="Cardápio" descricao="O agente analisa o funil e os itens do cardápio e sugere otimizações de nomes, descrições e preços." />;
      case 'multicanal': return <AgenteAnalise tenantDbId={tenantDbId} userId={userId} agente="multicanal" titulo="Multicanal" descricao="O agente consolida as métricas dos seus canais de delivery num panorama único e aponta onde focar." />;
      case 'rotinas': return <AutomacoesScreen tenantDbId={tenantDbId} onNavigate={nav} />;
      case 'tarefas': return <TarefasAgendadas tenantDbId={tenantDbId} userId={userId} />;
      case 'gatilhos': return <Gatilhos tenantDbId={tenantDbId} userId={userId} />;
      case 'heartbeats': return <HeartbeatsScreen tenantDbId={tenantDbId} onNavigate={nav} />;
      case 'atividade': return <Execucoes tenantDbId={tenantDbId} />;
      case 'metas': return <GoalsScreen tenantDbId={tenantDbId} onNavigate={nav} />;
      case 'topicos': return <Topicos tenantDbId={tenantDbId} userId={userId} />;
      case 'modelos': return <Templates tenantDbId={tenantDbId} userId={userId} />;
      case 'config': return <AgenteConfig tenantDbId={tenantDbId} />;
      case 'arquivos': return <Arquivos tenantDbId={tenantDbId} userId={userId} />;
      case 'links': return <Links tenantDbId={tenantDbId} userId={userId} />;
      case 'memoria': return <MemoriesScreen tenantDbId={tenantDbId} />;
      case 'conhecimento': return <KnowledgeBaseScreen tenantDbId={tenantDbId} />;
      case 'custos': return <CustosIA tenantDbId={tenantDbId} />;
      case 'importar': return <ImportarRelatorios tenantDbId={tenantDbId} userId={userId} />;
      case 'configsys': return <SettingsScreen tenant={tenantSlug} tenantDbId={tenantDbId} userId={userId} onTenantChange={() => {}} />;
      case 'clientesplat': return <Clientes userId={userId} />;
      case 'marca': return <Marca tenantDbId={tenantDbId} onChanged={recarregarBrand} />;
      case 'provedores': return <Provedores />;
      case 'integracoes': return <Integracoes />;
      case 'sistemas': return <Sistemas />;
      case 'acesso': return <AcessoUsuarios tenantDbId={tenantDbId} />;
      case 'auditoria': return <AuditLog tenantDbId={tenantDbId} />;
      default: return <div className="cv2-card">Tela não encontrada.</div>;
    }
  }

  const inicial = (tenantNome || 'CD').replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase() || 'CD';

  return (
    <div className="cv2" style={temaStyle}>
      <CvSprite />
      <aside className="cv2-sb">
        <div className="cv2-brand">
          <img src={brand?.logo || '/assets/rocket-logo.png'} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <div>
            <span className="anton" style={{ fontSize: 13, lineHeight: 1.05, display: 'block' }}>{tenantNome}</span>
            <small>CONSOLE · BETA</small>
          </div>
        </div>
        {GRUPOS.map((g, i) => (
          <div key={i}>
            <div className="cv2-grp">{g.label}</div>
            {g.items.map(it => (
              <div key={it.id} className={`cv2-item${tela === it.id ? ' on' : ''}`} onClick={() => setTela(it.id)}>
                <Ico name={it.ic} />{it.label}
              </div>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--line)' }}>
          <button className="cv2-btn sec" style={{ width: '100%', justifyContent: 'center' }} onClick={onExit}>Voltar ao console clássico</button>
        </div>
      </aside>
      <div className="cv2-main">
        {ehChat && chatFull ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ChatScreen tenant={tenantSlug} tenantDbId={tenantDbId} onNavigate={setTela} deepLinkConvId={null} />
          </div>
        ) : (
          <>
            <div className="cv2-tb">
              <span className="crumb">Console › <b>{LABELS[tela] || tela}</b></span>
              <input className="search" placeholder="Buscar clientes, lojas, agentes, pedidos…" />
              <span className="cv2-pill" title={`Plano freemium · ${CREDITOS_MES.toLocaleString('pt-BR')} créditos/mês · 1 por execução de IA · ${runs ?? 0} usados`}>
                <Ico name="i-zap" size={13} /> Créditos IA <b>{creditosTxt}</b>
              </span>
              {tenantsList.length > 1 ? (
                <select value={tenantDbId || ''} onChange={e => { const t = tenantsList.find(x => x.dbId === e.target.value); if (t) setSel(t); }}
                  style={{ background: '#fff', color: 'var(--tx)', border: '1px solid var(--line)', borderRadius: 4, padding: '7px 9px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', maxWidth: 180 }}>
                  {tenantsList.map(t => <option key={t.dbId} value={t.dbId}>{t.nome}</option>)}
                </select>
              ) : (
                <span className="cv2-pill">Cliente <b>{tenantNome}</b></span>
              )}
              <span className="cv2-pill" title="Notificações não lidas">
                <Ico name="i-bell" size={13} /><b style={notif > 0 ? { color: 'var(--red)' } : { color: 'var(--tx2)' }}>{notif}</b>
              </span>
              <span className="cv2-avatar">{inicial}</span>
            </div>
            {ehChat ? (
              <ChatV2 tenantDbId={tenantDbId} userId={userId} onFull={() => setChatFull(true)} />
            ) : ehLegado ? (
              <div className="cv2-legado">{render()}</div>
            ) : (
              <div className="cv2-ct">{render()}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
