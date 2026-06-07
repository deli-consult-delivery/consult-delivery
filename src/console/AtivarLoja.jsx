import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 · F1 — PR7: Onboarding self-service "Ativar loja"
// 1. Cadastra a loja com volume (qualificação D6 ao vivo:
//    >=300 pedidos/mês OU >=6 cancelamentos/mês)
// 2. Vincula o grupo de WhatsApp (whatsapp_groups.loja_id)
// 3. Ensina o fluxo (vigia automático + comandos @defesa)
// ============================================================

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };

export default function AtivarLoja({ tenantDbId }) {
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [pedidosMes, setPedidosMes] = useState('');
  const [cancelMes, setCancelMes] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [lojas, setLojas] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  const pedidos = Number(pedidosMes) || 0;
  const cancel = Number(cancelMes) || 0;
  const preencheuVolume = pedidosMes !== '' || cancelMes !== '';
  const qualificada = pedidos >= 300 || cancel >= 6;

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: gs, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
      supabase.from('whatsapp_groups').select('id, group_name, loja_id, ativo').eq('tenant_id', tenantDbId).order('group_name'),
      supabase.from('lojas').select('id, nome, cidade, metadata, created_at').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(30),
    ]);
    if (e1 || e2) { setErro((e1 || e2).message); return; }
    setGrupos(gs ?? []);
    setLojas(ls ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function ativar() {
    setErro(null); setMsg(null);
    if (nome.trim().length < 2) { setErro('Informe o nome da loja.'); return; }
    setSalvando(true);
    try {
      const { data: loja, error: e1 } = await supabase
        .from('lojas')
        .insert({
          tenant_id: tenantDbId,
          nome: nome.trim(),
          cidade: cidade.trim() || null,
          plataforma: 'ifood',
          is_active: true,
          metadata: {
            origem: 'console-v2-onboarding',
            pedidos_mes: pedidos,
            cancelamentos_mes: cancel,
            qualificada_defesa: qualificada,
            ativada_em: new Date().toISOString(),
          },
        })
        .select('id, nome')
        .single();
      if (e1) throw e1;
      if (grupoId) {
        const { error: e2 } = await supabase.from('whatsapp_groups').update({ loja_id: loja.id }).eq('id', grupoId);
        if (e2) throw e2;
      }
      setMsg(`Loja "${loja.nome}" ativada${grupoId ? ' e grupo vinculado' : ''}. ${qualificada ? 'Perfil qualificado para a Defesa.' : 'Volume abaixo do perfil — comece pelo Radar gratuito.'}`);
      setNome(''); setCidade(''); setPedidosMes(''); setCancelMes(''); setGrupoId('');
      await carregar();
    } catch (err) {
      setErro(err?.message || 'falha ao ativar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h1>Ativar loja <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>SELF-SERVICE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Cadastre a loja, vincule o grupo de WhatsApp e a Defesa começa a vigiar sozinha.{erro ? ` · erro: ${erro}` : ''}</div>

      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 1fr)', gap: 14, alignItems: 'start' }}>
        <div className="cv2-card">
          <h3>1 · Dados da loja</h3>
          <label style={labelStyle}>Nome da loja</label>
          <input style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Uraka Burger — Centro" />
          <label style={labelStyle}>Cidade (opcional)</label>
          <input style={inputStyle} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex.: Salvador/BA" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Pedidos por mês</label>
              <input style={inputStyle} type="number" min="0" value={pedidosMes} onChange={e => setPedidosMes(e.target.value)} placeholder="Ex.: 450" />
            </div>
            <div>
              <label style={labelStyle}>Cancelamentos por mês</label>
              <input style={inputStyle} type="number" min="0" value={cancelMes} onChange={e => setCancelMes(e.target.value)} placeholder="Ex.: 8" />
            </div>
          </div>
          {preencheuVolume && (
            <div style={{ marginTop: 12 }}>
              {qualificada
                ? <span className="cv2-bdg ok">PERFIL QUALIFICADO · a Defesa se paga com o volume desta loja</span>
                : <span className="cv2-bdg warn">ABAIXO DO PERFIL · recomendado começar pelo Radar gratuito</span>}
            </div>
          )}
          <label style={labelStyle}>2 · Grupo de WhatsApp da loja</label>
          <select style={inputStyle} value={grupoId} onChange={e => setGrupoId(e.target.value)}>
            <option value="">— vincular depois —</option>
            {grupos.map(g => (
              <option key={g.id} value={g.id} disabled={!!g.loja_id}>{g.group_name}{g.loja_id ? ' (já vinculado)' : ''}</option>
            ))}
          </select>
          <div style={{ marginTop: 16 }}>
            <button className="cv2-btn" disabled={salvando} onClick={ativar}>{salvando ? 'Ativando…' : 'Ativar loja'}</button>
          </div>
        </div>

        <div className="cv2-card">
          <h3>3 · Como funciona a partir da ativação</h3>
          <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
            <b style={{ color: 'var(--ink)' }}>Automático:</b> o vigia lê o grupo a cada 5 minutos. Qualquer mensagem sobre pedido cancelado vira um caso na fila da Defesa, com a contestação já escrita.<br />
            <b style={{ color: 'var(--ink)' }}>Forçar um caso:</b> mencione <b>@defesa</b> na mensagem com o que aconteceu (valor e número do pedido ajudam).<br />
            <b style={{ color: 'var(--ink)' }}>Aprovar sem abrir o painel:</b> responda <b>@defesa ok</b> na mesma conversa — ou <b>@defesa descartar</b>.<br />
            <b style={{ color: 'var(--ink)' }}>Fechar o ciclo:</b> quando o iFood responder, marque Ganho (com o valor recuperado) ou Perdido na tela Defesa Comercial — é isso que alimenta o painel “R$ defendido”.
          </div>
        </div>
      </div>

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Lojas ativadas</h1>
      <div className="cv2-rule" />
      {lojas && lojas.length > 0 && (
        <div className="cv2-card">
          <table>
            <thead><tr><th>Loja</th><th>Cidade</th><th>Perfil</th><th>Grupo vinculado</th></tr></thead>
            <tbody>
              {lojas.map(l => {
                const md = l.metadata || {};
                const grupo = grupos.find(g => g.loja_id === l.id);
                return (
                  <tr key={l.id}>
                    <td><b>{l.nome}</b></td>
                    <td>{l.cidade || '—'}</td>
                    <td>{md.qualificada_defesa === true ? <span className="cv2-bdg ok">qualificada</span> : md.qualificada_defesa === false ? <span className="cv2-bdg warn">radar</span> : <span className="cv2-bdg mut">—</span>}</td>
                    <td>{grupo ? grupo.group_name : <span style={{ color: 'var(--tx2)' }}>sem grupo</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {lojas && !lojas.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma loja cadastrada ainda.</div>}
    </div>
  );
}
