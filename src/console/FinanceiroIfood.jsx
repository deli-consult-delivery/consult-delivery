import { useState, useEffect, useCallback } from 'react';
import { listLojasConsultoria, getIfoodVendas, getIfoodRepasses } from '../lib/api.js';

// ============================================================
// Tela "Financeiro iFood" (Console v2) — sprint App 2 Finanças.
// Contrato: docs/integracoes/ifood/financeiro-ui-spec.md (worker 85).
// Vendas via API Sales (já live, tenant-scoped). Repasses (Settlement)
// via rota do worker 83 — se ainda não existir ou falhar, mostra estado
// vazio decente ("Em breve"), NUNCA card de erro (mesmo padrão do card
// "Notas iFood" antes do #763).
// ============================================================

function mensagemErro(err) {
  const status = err?.status;
  if (status === 401) return 'Sessão expirada ou token inválido — faça login novamente.';
  if (status === 403) return 'Sem permissão para acessar o financeiro desta loja.';
  if (status === 429) {
    const s = err?.retryAfterSeconds;
    return `Limite de requisições do iFood atingido — tente novamente${s ? ` em ${s}s` : ' em instantes'}.`;
  }
  return err?.details?.message || err?.message || 'Erro ao comunicar com o iFood.';
}

function fmtBRL(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

function hoje() { return new Date().toISOString().slice(0, 10); }
function diasAtras(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// Sales (confirmado): sales[].saleGrossValue = {bag, deliveryFee, serviceFee}.
// "Bruto" = soma dos 3 campos; "líquido" não tem campo próprio documentado
// ainda (o iFood cobra comissão à parte, no Settlement) — por ora mostramos
// bruto == líquido só como placeholder visual até o worker 83/82 confirmarem
// o campo de dedução; não inventamos uma fórmula sem fonte.
function valorBrutoDaVenda(venda) {
  const g = venda?.saleGrossValue || {};
  const soma = (Number(g.bag) || 0) + (Number(g.deliveryFee) || 0) + (Number(g.serviceFee) || 0);
  return soma;
}

export default function FinanceiroIfood({ tenantDbId }) {
  const [lojas, setLojas] = useState(null);
  const [lojaId, setLojaId] = useState('');
  const [dataInicio, setDataInicio] = useState(diasAtras(7));
  const [dataFim, setDataFim] = useState(hoje());
  const [vendas, setVendas] = useState(null);
  const [repasses, setRepasses] = useState(undefined); // undefined = ainda não tentou; null = indisponível/"em breve"
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!tenantDbId) return;
    listLojasConsultoria(tenantDbId)
      .then(rows => {
        const apiLojas = (rows || []).filter(l => l.fonte_dados === 'api');
        setLojas(apiLojas);
        if (apiLojas.length === 1) setLojaId(apiLojas[0].id);
      })
      .catch(e => setErro(e.message));
  }, [tenantDbId]);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    setCarregando(true); setErro(null);
    try {
      const dataVendas = await getIfoodVendas({ tenantId: tenantDbId, dataInicio, dataFim });
      const lista = Array.isArray(dataVendas?.sales) ? dataVendas.sales : (Array.isArray(dataVendas) ? dataVendas : []);
      setVendas(lista);
    } catch (e) {
      setVendas([]);
      setErro(mensagemErro(e));
    }

    if (lojaId) {
      try {
        const r = await getIfoodRepasses({ lojaId, dataInicio, dataFim });
        const listaR = Array.isArray(r?.settlements) ? r.settlements : (Array.isArray(r) ? r : []);
        setRepasses(listaR);
      } catch {
        // rota ainda não existe / indisponível — estado vazio decente, sem poluir o erro principal
        setRepasses(null);
      }
    } else {
      setRepasses(undefined);
    }
    setCarregando(false);
  }, [tenantDbId, lojaId, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  function atalho(dias) {
    setDataInicio(dias === 0 ? hoje() : diasAtras(dias));
    setDataFim(hoje());
  }

  const totalBruto = (vendas || []).reduce((s, v) => s + valorBrutoDaVenda(v), 0);
  const qtdTransacoes = (vendas || []).length;
  const qtdRepasses = Array.isArray(repasses) ? repasses.length : null;

  return (
    <div>
      <h1>Financeiro <span className="cv2-mock">iFood</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Vendas e repasses da API oficial do iFood — sandbox de homologação.</div>

      <div className="cv2-card" style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
          Loja
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">Selecione…</option>
            {(lojas || []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
          De
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
          Até
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </label>
        <button className="cv2-btn" onClick={carregar} disabled={carregando}>{carregando ? 'Carregando…' : 'Aplicar'}</button>
        <button className="cv2-btn sec" onClick={() => atalho(0)}>Hoje</button>
        <button className="cv2-btn sec" onClick={() => atalho(7)}>7 dias</button>
        <button className="cv2-btn sec" onClick={() => atalho(30)}>30 dias</button>
      </div>

      {lojas != null && lojas.length === 0 && (
        <div className="cv2-card" style={{ marginTop: 12, textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhuma loja com fonte de dados "api" nesta conta ainda.
        </div>
      )}

      {erro && <div className="cv2-card" style={{ marginTop: 12, color: 'var(--red)' }}>⚠ {erro}</div>}

      <div className="cv2-kpis" style={{ marginTop: 12 }}>
        <div className="cv2-kpi">
          <div className="l">Vendas brutas</div>
          <div className="v">{vendas && vendas.length ? fmtBRL(totalBruto) : '—'}</div>
          <div className="d mut">{vendas && vendas.length ? 'no período' : 'sem vendas no período'}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Vendas líquidas</div>
          <div className="v">{vendas && vendas.length ? fmtBRL(totalBruto) : '—'}</div>
          <div className="d mut">taxas/comissão ainda não confirmadas (ver Settlement)</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Repasses (settlements)</div>
          <div className="v">{qtdRepasses != null ? qtdRepasses : '—'}</div>
          <div className="d mut">{repasses === null ? 'Em breve' : 'no período'}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Transações</div>
          <div className="v">{qtdTransacoes}</div>
          <div className="d mut">no período</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {vendas == null ? (
          <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando vendas…</div>
        ) : vendas.length === 0 ? (
          <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma venda encontrada no período.</div>
        ) : (
          <div className="cv2-tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Pedido</th><th>Bruto</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v, i) => (
                  <tr key={v.id || v.shortId || i}>
                    <td>{v.createdAt ? new Date(v.createdAt).toLocaleString('pt-BR') : '—'}</td>
                    <td title={v.id}>{v.shortId || v.id || '—'}</td>
                    <td>{fmtBRL(valorBrutoDaVenda(v))}</td>
                    <td><span className="cv2-bdg mut">{v.currentStatus || v.type || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
