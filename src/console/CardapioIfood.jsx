import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { getCardapioApiLoja } from '../lib/api.js';

// ============================================================
// Console v2 — Cardápio iFood (consulta · read-only + pausar/reabrir gated)
// Consome o Bridge (ponto único de contato com o iFood):
//   GET  /api/ifood/cardapio?tenant_id=…      → { catalogos:[{ categorias:[{ nome, itens:[…] }] }] }
//   GET  /api/ifood-api/catalogo/:lojaId        → { loja_id, merchant_id, cardapio:{ catalogos:[…] } }
//                                                 (App 3 Catálogo, #799 — gated por fonte_dados==='api',
//                                                 mesmo padrão de merchant-status/summary/reviews)
//   POST /api/ifood/acao?tenant_id=…           → cria DRAFT amarelo (NÃO executa)
// A credencial do iFood vive só no Bridge. O tenant_id é obrigatório p/ usuário
// (gate de membership no Bridge, mesmo padrão do VendaERP/lojas).
//
// Fluxo dual (mesmo padrão de Avaliacoes.jsx): tenant SEM nenhuma loja em
// fonte_dados='api' → comportamento IDÊNTICO ao de antes (tenant-wide, rota
// antiga, sem seletor — zero regressão). Tenant COM loja(s) em fonte_dados='api'
// → seletor de loja aparece, cardápio dessa loja vem da rota nova por-loja.
// ============================================================

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

const fmtBRL = (v) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

async function bridgeFetch(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Bridge retornou ${res.status}`);
  }
  return json?.data ?? json;
}

// Achata catalogos[].categorias[] numa lista única de categorias com itens.
function categoriasDe(cardapio) {
  const cats = [];
  for (const cat of (cardapio?.catalogos ?? []).flatMap(c => c?.categorias ?? [])) {
    cats.push({ nome: cat?.nome || 'Sem categoria', itens: cat?.itens ?? [] });
  }
  return cats;
}

function ItemLinha({ item, tenantDbId, onAcaoFeita }) {
  const [agindo, setAgindo] = useState(false);
  const [msg, setMsg] = useState(null);
  const disponivel = item.disponivel === true;

  async function acao(operacao) {
    setAgindo(true); setMsg(null);
    try {
      await bridgeFetch(`/api/ifood/acao?tenant_id=${encodeURIComponent(tenantDbId)}`, {
        method: 'POST',
        body: { operacao, parametros: { item_nome: item.nome } },
      });
      setMsg('Solicitação enviada para aprovação (draft amarelo).');
      onAcaoFeita?.();
    } catch (e) {
      setMsg(`Falhou: ${e.message}`);
    } finally {
      setAgindo(false);
    }
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{item.nome || '—'}</span>
          <span className={`cv2-bdg ${disponivel ? 'ok' : 'err'}`} style={{ fontSize: 11 }}>
            {disponivel ? 'Disponível' : 'Pausado'}
          </span>
        </div>
        {item.descricao && (
          <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 2 }}>{item.descricao}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtBRL(item.preco)}</div>
        {msg && <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 4 }}>{msg}</div>}
      </div>
      <button
        className="cv2-btn sec"
        style={{ fontSize: 12, flexShrink: 0 }}
        disabled={agindo}
        onClick={() => acao(disponivel ? 'ifood.pausar_item' : 'ifood.reabrir_item')}
      >
        {agindo ? '…' : disponivel ? 'Pausar' : 'Reabrir'}
      </button>
    </div>
  );
}

export default function CardapioIfood({ tenantDbId }) {
  const [lojasApi, setLojasApi] = useState([]); // lojas do tenant com fonte_dados='api'
  const [lojaId, setLojaId] = useState('');
  const [cats, setCats] = useState(null);
  const [erro, setErro] = useState(null);
  const [indisponivel, setIndisponivel] = useState(false); // rota nova (worker do bridge) ainda não existe
  const [carregando, setCarregando] = useState(false);
  const reqIdRef = useRef(0); // guarda contra resposta fora de ordem (loja A lenta chegando depois da loja B)

  // Descobre lojas do tenant já migradas pra API oficial — só decide se o
  // seletor aparece. Tenant sem nenhuma → lojasApi=[] pra sempre, lojaId
  // nunca sai de '', fluxo cai 100% no caminho tenant-wide de antes (zero
  // regressão pros demais tenants).
  useEffect(() => {
    // Reseta ANTES do fetch (não só depois) — sem isso, trocar de tenant com
    // uma loja de API já selecionada mantém o lojaId do tenant ANTERIOR até a
    // resposta chegar, e getCardapioApiLoja(lojaId) chamaria uma loja de outro
    // tenant (achado de revisão: usuário multi-tenant, ConsoleV2 não desmonta
    // este componente ao trocar de tenant no seletor de topo).
    setLojasApi([]);
    setLojaId('');
    if (!tenantDbId) return;
    let alive = true;
    supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).eq('fonte_dados', 'api')
      .then(({ data }) => {
        if (!alive) return;
        setLojasApi(data || []);
        setLojaId(data?.[0]?.id || '');
      });
    return () => { alive = false; };
  }, [tenantDbId]);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const meuReqId = ++reqIdRef.current; // captura ANTES do await — resposta obsoleta se isto mudar
    setCarregando(true); setErro(null); setIndisponivel(false);
    try {
      const cardapio = lojaId
        ? await getCardapioApiLoja(lojaId)
        : await bridgeFetch(`/api/ifood/cardapio?tenant_id=${encodeURIComponent(tenantDbId)}`);
      if (meuReqId !== reqIdRef.current) return; // uma troca de loja mais recente já disparou outra chamada
      setCats(categoriasDe(cardapio));
    } catch (e) {
      if (meuReqId !== reqIdRef.current) return;
      if (lojaId && e.rotaAusente) { setIndisponivel(true); setCats(null); }
      else { setErro(e.message); setCats(null); }
    } finally {
      if (meuReqId === reqIdRef.current) setCarregando(false);
    }
  }, [tenantDbId, lojaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalItens = (cats ?? []).reduce((n, c) => n + c.itens.length, 0);
  const vazio = cats && totalItens === 0;

  return (
    <div>
      <h1>iFood: Cardápio</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Itens do cardápio do iFood por categoria, ao vivo via Bridge. Pausar/Reabrir cria um draft que aguarda sua aprovação.
        {erro ? ` · erro: ${erro}` : ''}
      </div>

      <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {lojasApi.length > 0 ? (
          <select
            value={lojaId}
            onChange={e => setLojaId(e.target.value)}
            className="cv2-btn sec"
            style={{ fontSize: 12, cursor: 'pointer' }}
          >
            {lojasApi.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        ) : <span />}
        <button className="cv2-btn sec" style={{ fontSize: 12 }} disabled={carregando} onClick={carregar}>
          {carregando ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {carregando && !cats && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando cardápio…</div>
      )}

      {indisponivel && !carregando && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Cardápio via API oficial ainda não disponível para esta loja — em desenvolvimento.
        </div>
      )}

      {erro && !cats && !indisponivel && !carregando && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--red)' }}>Erro ao carregar: {erro}</div>
      )}

      {vazio && !indisponivel && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum item no cardápio.</div>
      )}

      {cats && totalItens > 0 && cats.map((cat, i) => (
        cat.itens.length > 0 && (
          <div key={i} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em', margin: '12px 0 8px', textTransform: 'uppercase' }}>
              {cat.nome} ({cat.itens.length})
            </div>
            {cat.itens.map((item, j) => (
              <ItemLinha key={item.itemId || j} item={item} tenantDbId={tenantDbId} onAcaoFeita={carregar} />
            ))}
          </div>
        )
      ))}
    </div>
  );
}
