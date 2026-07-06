import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — Cardápio iFood (consulta · read-only + pausar/reabrir gated)
// Consome o Bridge (ponto único de contato com o iFood):
//   GET  /api/ifood/cardapio?tenant_id=…  → { catalogos:[{ categorias:[{ nome, itens:[…] }] }] }
//   POST /api/ifood/acao?tenant_id=…      → cria DRAFT amarelo (NÃO executa)
// A credencial do iFood vive só no Bridge. O tenant_id é obrigatório p/ usuário
// (gate de membership no Bridge, mesmo padrão do VendaERP/lojas).
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
  const [cats, setCats] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    setCarregando(true); setErro(null);
    try {
      const cardapio = await bridgeFetch(`/api/ifood/cardapio?tenant_id=${encodeURIComponent(tenantDbId)}`);
      setCats(categoriasDe(cardapio));
    } catch (e) {
      setErro(e.message);
      setCats(null);
    } finally {
      setCarregando(false);
    }
  }, [tenantDbId]);

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

      <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="cv2-btn sec" style={{ fontSize: 12 }} disabled={carregando} onClick={carregar}>
          {carregando ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {carregando && !cats && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando cardápio…</div>
      )}

      {erro && !cats && !carregando && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--red)' }}>Erro ao carregar: {erro}</div>
      )}

      {vazio && (
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
