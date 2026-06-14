import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — VendaERP (consulta, read-only · Fase 1 / MVP)
// Consome o Bridge (ponto único de contato com o ERP):
//   GET /api/vendaerp/status · /contratos · /lancamentos · /estoque
// A credencial do ERP vive só no Bridge — o Console nunca a vê.
// Escrita (criar/emitir) chega na Fase 2.
// ============================================================

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

// Aba → endpoint + colunas exibidas (best-effort sobre o shape do ERP).
const ABAS = [
  { id: 'contratos',   label: 'Contratos',   path: '/api/vendaerp/contratos' },
  { id: 'lancamentos', label: 'Financeiro',  path: '/api/vendaerp/lancamentos' },
  { id: 'estoque',     label: 'Estoque',     path: '/api/vendaerp/estoque' },
];

async function bridgeGet(path) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Bridge retornou ${res.status}`);
  }
  return json?.data ?? json;
}

// Normaliza a resposta do ERP num array de linhas, qualquer que seja o envelope.
function comoLinhas(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['data', 'itens', 'items', 'registros', 'lista', 'result', 'results']) {
    if (Array.isArray(data[k])) return data[k];
  }
  // objeto único → uma linha
  return [data];
}

function colunasDe(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).slice(0, 8);
}

function cell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function VendaErpPainel() {
  const [status, setStatus] = useState(null);   // { conectado, empresa, total_empresas }
  const [statusErro, setStatusErro] = useState(null);
  const [aba, setAba] = useState('contratos');
  const [rows, setRows] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const checarStatus = useCallback(async () => {
    setStatusErro(null);
    try {
      setStatus(await bridgeGet('/api/vendaerp/status'));
    } catch (e) {
      setStatus(null);
      setStatusErro(e.message);
    }
  }, []);

  const carregarAba = useCallback(async (id) => {
    const def = ABAS.find(a => a.id === id);
    if (!def) return;
    setCarregando(true); setErro(null); setRows(null);
    try {
      setRows(comoLinhas(await bridgeGet(def.path)));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { checarStatus(); }, [checarStatus]);
  useEffect(() => { carregarAba(aba); }, [aba, carregarAba]);

  const cols = rows ? colunasDe(rows) : [];

  return (
    <div>
      <h1>VendaERP</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Consulta ao ERP (somente leitura). A escrita (criar/emitir) chega na próxima fase.
      </div>

      {/* Status da conexão */}
      <div className="cv2-card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <b style={{ fontSize: 13 }}>Conexão</b>
          <div className="cv2-sub" style={{ marginTop: 4 }}>
            {statusErro
              ? <span style={{ color: 'var(--danger, #c0392b)' }}>● Desconectado — {statusErro}</span>
              : status
                ? <span style={{ color: 'var(--ok, #1e8449)' }}>● Conectado{status.empresa ? ` · ${status.empresa}` : ''}{status.total_empresas != null ? ` · ${status.total_empresas} empresa(s)` : ''}</span>
                : 'Verificando…'}
          </div>
        </div>
        <button className="cv2-btn sec" onClick={checarStatus}>Testar conexão</button>
      </div>

      {/* Abas de domínio */}
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <div className="cv2-spread" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {ABAS.map(a => (
              <button
                key={a.id}
                className={`cv2-btn ${aba === a.id ? '' : 'sec'}`}
                style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => setAba(a.id)}
              >{a.label}</button>
            ))}
          </div>
          <button className="cv2-btn sec" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => carregarAba(aba)}>Atualizar</button>
        </div>

        <div className="cv2-tbl-wrap">
          <table className="cv2-tbl">
            <thead>
              <tr>{(cols.length ? cols : ['—']).map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={Math.max(cols.length, 1)} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>Carregando…</td></tr>
              ) : erro ? (
                <tr><td colSpan={Math.max(cols.length, 1)} style={{ textAlign: 'center', color: 'var(--danger, #c0392b)', padding: 28 }}>Erro: {erro}</td></tr>
              ) : (rows && rows.length) ? (
                rows.map((r, i) => (
                  <tr key={i}>{cols.map((c, j) => <td key={j}>{cell(r[c])}</td>)}</tr>
                ))
              ) : (
                <tr><td colSpan={Math.max(cols.length, 1)} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>— nenhum registro —</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cv2-sub" style={{ marginTop: 10, fontSize: 11.5 }}>
        Dados ao vivo do VendaERP via Bridge. As colunas se ajustam ao retorno real do ERP.
      </div>
    </div>
  );
}
