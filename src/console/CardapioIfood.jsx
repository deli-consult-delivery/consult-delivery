import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { getCardapioApiLoja, getUnsellableApiLoja } from '../lib/api.js';

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
  const [editandoPreco, setEditandoPreco] = useState(false);
  const [novoPreco, setNovoPreco] = useState('');
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

  async function salvarPreco() {
    const price = Number(novoPreco.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      setMsg('Preço inválido — informe um número maior que zero.');
      return;
    }
    setAgindo(true); setMsg(null);
    try {
      await bridgeFetch(`/api/ifood/acao?tenant_id=${encodeURIComponent(tenantDbId)}`, {
        method: 'POST',
        body: { operacao: 'ifood.alterar_preco', parametros: { item_nome: item.nome, price } },
      });
      setMsg(`Solicitação de novo preço ${fmtBRL(price)} enviada para aprovação.`);
      setEditandoPreco(false);
      setNovoPreco('');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {editandoPreco ? (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Novo preço (R$):</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={typeof item.preco === 'number' ? item.preco.toFixed(2) : '0,00'}
                value={novoPreco}
                onChange={e => setNovoPreco(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salvarPreco(); if (e.key === 'Escape') { setEditandoPreco(false); setNovoPreco(''); } }}
                disabled={agindo}
                autoFocus
                style={{ width: 90, fontSize: 12.5, padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4 }}
              />
              <button className="cv2-btn" style={{ fontSize: 11 }} disabled={agindo} onClick={salvarPreco}>Salvar</button>
              <button className="cv2-btn sec" style={{ fontSize: 11 }} disabled={agindo} onClick={() => { setEditandoPreco(false); setNovoPreco(''); }}>Cancelar</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtBRL(item.preco)}</span>
              <button
                className="cv2-btn sec"
                style={{ fontSize: 11, padding: '2px 8px' }}
                disabled={agindo}
                onClick={() => { setEditandoPreco(true); setNovoPreco(''); setMsg(null); }}
              >
                Alterar preço
              </button>
            </>
          )}
        </div>
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
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [arquivados, setArquivados] = useState(null); // itens não-vendáveis (unsellableItems, App 3 M2)
  const [carregandoArq, setCarregandoArq] = useState(false);
  const [erroArq, setErroArq] = useState(null);
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
    setMostrarArquivados(false);
    setArquivados(null);
    setErroArq(null);
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

  // Itens não-vendáveis (App 3 M2) — só disponível no fluxo per-loja (rota nova
  // gated). Tenant-wide (rota antiga) não expõe unsellableItems. Carrega on-demand
  // quando o usuário aciona o toggle "Mostrar arquivados". Precisa do groupId do
  // primeiro catálogo da loja (faz 1 fetch extra do cardápio completo só pra
  // extrair groupId/catalogId — o seletor de catálogo não existe na UI hoje; só
  // 1 catálogo por merchant é o caso comum, confirmado pelo smoke live 05/07).
  const carregarArquivados = useCallback(async () => {
    if (!lojaId) return;
    const meuReqId = ++reqIdRef.current;
    setCarregandoArq(true); setErroArq(null);
    try {
      const cardapioCompleto = await getCardapioApiLoja(lojaId);
      const catalogos = cardapioCompleto?.catalogos ?? [];
      const cat0 = catalogos[0];
      if (!cat0) {
        if (meuReqId !== reqIdRef.current) return;
        setArquivados([]);
        return;
      }
      const gid = cat0.groupId ?? cat0.catalogId;
      if (!gid) {
        if (meuReqId !== reqIdRef.current) return;
        setArquivados([]);
        return;
      }
      const itens = await getUnsellableApiLoja(lojaId, String(gid), { catalogId: String(cat0.catalogId ?? gid) });
      if (meuReqId !== reqIdRef.current) return;
      // Normaliza o shape raw do iFood (id/status/price/products...) para o shape
      // que ItemLinha espera (itemId/nome/preco/disponivel/descricao/externalCode)
      // — mesmo formato que montarItem() produz no Bridge para sellableItems.
      const rawArr = Array.isArray(itens) ? itens : [];
      const productById = new Map();
      for (const it of rawArr) {
        if (it?.productId) productById.set(String(it.productId), null);
      }
      // Os produtos vêm juntos em unsellableItems? A doc não garante — muitos
      // endpoints de Catalog devolvem products[] separado. Se vier embutido em
      // cada item, usamos direto; senão, nome fica vazio (não crasha).
      const norm = rawArr.map((it) => {
        const prod = it?.productId ? productById.get(String(it.productId)) : null;
        return {
          itemId: it?.id ? String(it.id) : null,
          nome: prod?.name || it?.name || it?.name || '',
          descricao: prod?.description || it?.description || '',
          preco: it?.price?.value ?? it?.price ?? null,
          externalCode: it?.externalCode != null ? String(it.externalCode) : null,
          disponivel: it?.status === 'AVAILABLE',
          status: it?.status ?? null,
        };
      });
      setArquivados(norm);
    } catch (e) {
      if (meuReqId !== reqIdRef.current) return;
      if (e.rotaAusente) {
        setArquivados([]);
      } else {
        setErroArq(e.message);
      }
    } finally {
      if (meuReqId === reqIdRef.current) setCarregandoArq(false);
    }
  }, [lojaId]);

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

      {/* Itens não-vendáveis (App 3 M2) — só no fluxo per-loja (rota gated nova) */}
      {lojaId && cats && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button
              className="cv2-btn sec"
              style={{ fontSize: 12 }}
              disabled={carregandoArq}
              onClick={() => {
                if (mostrarArquivados && arquivados) {
                  setMostrarArquivados(false);
                } else {
                  setMostrarArquivados(true);
                  if (!arquivados) carregarArquivados();
                }
              }}
            >
              {carregandoArq ? 'Carregando…' : mostrarArquivados ? 'Ocultar arquivados' : 'Mostrar arquivados'}
            </button>
            {erroArq && <span style={{ fontSize: 12, color: 'var(--red)' }}>erro: {erroArq}</span>}
          </div>

          {mostrarArquivados && arquivados && (
            arquivados.length === 0 ? (
              <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum item arquivado.</div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em', margin: '12px 0 8px', textTransform: 'uppercase' }}>
                  Arquivados ({arquivados.length})
                </div>
                {arquivados.map((it, j) => (
                  <ItemLinha key={it.itemId || it.id || j} item={it} tenantDbId={tenantDbId} onAcaoFeita={carregar} />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
