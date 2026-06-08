import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — PR12b: Radar REAL
// Cruza as métricas importadas (radar_metricas, via planilhas iFood)
// com os casos da Defesa (defesa_casos) e monta o diagnóstico.
// Sem dados ainda → chama o usuário para Importar relatórios.
// ============================================================

const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

export default function RadarReal({ tenantNome, tenantDbId }) {
  const [m, setM] = useState(null);          // mapa metrica -> {valor, valor_texto, metadata, periodo}
  const [casos, setCasos] = useState({ total: 0, atraso: 0, defendidoCentavos: 0 });
  const [temFonte, setTemFonte] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    try {
      const [{ data: mets, error: e1 }, { count: fontesOk, error: e2 }, { data: casosRows, error: e3 }] = await Promise.all([
        supabase.from('radar_metricas').select('metrica, valor, valor_texto, metadata, periodo_inicio, periodo_fim, created_at')
          .eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(400),
        supabase.from('radar_fontes').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).eq('status', 'processado'),
        supabase.from('defesa_casos').select('motivo, status, resultado_valor_centavos')
          .eq('tenant_id', tenantDbId).limit(500),
      ]);
      if (e1 || e2 || e3) throw (e1 || e2 || e3);
      // última ocorrência de cada métrica (rows já vêm desc por created_at)
      const mapa = {};
      for (const r of mets ?? []) { if (!mapa[r.metrica]) mapa[r.metrica] = r; }
      setM(mapa);
      setTemFonte((fontesOk ?? 0) > 0);
      const cs = casosRows ?? [];
      const atraso = cs.filter(c => /atras/i.test(c.motivo || '')).length;
      const defendido = cs.filter(c => c.status === 'ganho').reduce((s, c) => s + (Number(c.resultado_valor_centavos) || 0), 0);
      setCasos({ total: cs.length, atraso, defendidoCentavos: defendido });
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  const val = k => (m && m[k] ? Number(m[k].valor) : null);
  const txt = k => (m && m[k] ? m[k].valor_texto : null);

  if (temFonte === false) {
    return (
      <div>
        <h1>Radar <span className="cv2-mock">SEM DADOS AINDA</span></h1>
        <div className="cv2-rule" />
        <div className="cv2-card" style={{ maxWidth: 620 }}>
          <h3>O Radar precisa dos seus relatórios do iFood</h3>
          <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
            Baixe os relatórios no Portal do Parceiro (Vendas, Cancelamentos, Cardápio, Conciliação…) e envie em <b>Dados › Importar relatórios</b>. Em minutos o Radar monta o diagnóstico desta loja — quanto entra, quanto o iFood retém e onde está vazando dinheiro.
          </div>
        </div>
      </div>
    );
  }

  const taxas = val('conciliacao_taxas');
  const entrada = val('conciliacao_entrada') ?? val('vendas_valor_total');
  const subsidios = val('conciliacao_subsidios');
  const pedidos = val('vendas_total_pedidos');
  const ticket = val('vendas_ticket_medio');
  const conv = val('funil_conversao_pct');
  const visitas = val('funil_visitas');
  const cancQtd = val('cancelamentos_qtd');
  const cancMotivo = txt('cancelamentos_motivo_top');
  const cancMotivoQtd = val('cancelamentos_motivo_top');
  const itemTop = txt('cardapio_item_top_valor');
  const melhorDia = txt('vendas_melhor_dia');
  const pctTaxas = (taxas != null && entrada) ? Math.round((Math.abs(taxas) / Math.abs(entrada)) * 100) : null;

  const sinais = [];
  if (taxas != null) sinais.push({ sinal: `Taxas e comissões do iFood no período`, impacto: fmtBRL(Math.abs(taxas)), cls: 'err', acao: pctTaxas != null ? `${pctTaxas}% do faturamento — revisar plano e logÍstica` : 'revisar plano e logIIstica' });
  if (cancQtd != null && cancQtd > 0) sinais.push({ sinal: `${fmtNum(cancQtd)} cancelamentos — motivo top: ${cancMotivo || 'n/d'}`, impacto: /atras/i.test(cancMotivo || '') ? 'contestável' : 'analisar', cls: /atras/i.test(cancMotivo || '') ? 'warn' : 'mut', acao: 'a Defesa prepara a contestação' });
  if (conv != null) sinais.push({ sinal: `Conversão do cardápio: ${conv}% (${fmtNum(visitas)} visitas)`, impacto: conv < 25 ? 'baixa' : 'ok', cls: conv < 25 ? 'warn' : 'ok', acao: conv < 25 ? 'fotos/descrições e ofertas no cardápio' : 'manter' });
  if (subsidios != null && Math.abs(subsidios) > 0) sinais.push({ sinal: 'Promoções custeadas pela loja', impacto: fmtBRL(Math.abs(subsidios)), cls: 'warn', acao: 'avaliar retorno das ofertas' });

  return (
    <div>
      <h1>Radar <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Diagnóstico de {tenantNome} a partir dos relatórios importados do iFood.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Faturamento (entrada)" v={entrada != null ? fmtBRL(entrada) : '—'} d={pedidos != null ? `${fmtNum(pedidos)} pedidos` : ''} />
        <Kpi l="Taxas iFood" v={taxas != null ? fmtBRL(Math.abs(taxas)) : '—'} d={pctTaxas != null ? `${pctTaxas}% do faturamento` : ''} neg />
        <Kpi l="Ticket médio" v={ticket != null ? fmtBRL(ticket) : '—'} d={melhorDia ? `melhor dia: ${melhorDia}` : ''} mut />
        <Kpi l="Conversão do cardápio" v={conv != null ? `${conv}%` : '—'} d={conv != null ? (conv < 25 ? 'abaixo do ideal' : 'saudável') : ''} neg={conv != null && conv < 25} />
        <Kpi l="Cancelamentos" v={cancQtd != null ? fmtNum(cancQtd) : '—'} d={cancMotivo ? `top: ${cancMotivo}` : ''} neg={cancQtd > 0} />
        <Kpi l="R$ defendido (Defesa)" v={fmtBRL(casos.defendidoCentavos / 100)} d={`${casos.total} casos · ${casos.atraso} por atraso`} mut />
      </div>

      <div className="cv2-card">
        <h3>O que o Radar viu</h3>
        <table>
          <thead><tr><th>Sinal</th><th>Impacto</th><th>Ação sugerida</th></tr></thead>
          <tbody>
            {sinais.map((s, i) => (
              <tr key={i}><td>{s.sinal}</td><td><span className={`cv2-bdg ${s.cls}`}>{s.impacto}</span></td><td>{s.acao}</td></tr>
            ))}
            {itemTop && <tr><td>Item campeão de faturamento</td><td><span className="cv2-bdg ok">{itemTop}</span></td><td>destacar no topo do cardápio e em ofertas</td></tr>}
            {!sinais.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--tx2)' }}>Importe mais relatórios para enriquecer o diagnóstico.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
