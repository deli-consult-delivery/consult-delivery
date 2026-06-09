// ============================================================
// Console v2 · telas funcionais (Gatilhos, Tópicos, Tarefas,
// Links, Arquivos) + telas de referência (Provedores/Integrações/Sistemas).
// Visual fiel ao generic() do protótipo (docs/prototipo/console-v2.html);
// CRUD real contra Supabase (tabelas tenant_* · RLS por tenant).
// Sem dado fake: estado vazio até o cliente cadastrar.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ---------- Tela read-only (referência: Provedores/Integrações/Sistemas) -----
function Tela({ titulo, sub, kpis, cols, rows, acao, nota }) {
  return (
    <div>
      <h1>{titulo}</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{sub}</div>
      {kpis && <div className="cv2-kpis">{kpis}</div>}
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cv2-spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <b style={{ fontSize: 13 }}>{titulo}</b>
          {acao && <button className="cv2-btn sec" disabled title="Disponível na próxima atualização">{acao}</button>}
        </div>
        <table className="cv2-tbl">
          <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {(rows && rows.length) ? rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => <td key={j} dangerouslySetInnerHTML={{ __html: cell }} />)}</tr>
            )) : (
              <tr><td colSpan={cols.length} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>— nenhum registro ainda —</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div className="cv2-sub" style={{ marginTop: 10, fontSize: 11.5 }}>{nota}</div>}
    </div>
  );
}

// ---------- estilos de formulário (consistentes com o design system) ---------
const inp = { background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 11px', fontSize: 13, outline: 'none', fontWeight: 500, color: 'var(--tx)', fontFamily: 'inherit', minWidth: 0 };
function Campo({ f, value, onChange }) {
  if (f.type === 'select') {
    return (
      <select style={inp} value={value ?? f.default ?? ''} onChange={e => onChange(e.target.value)}>
        {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }
  const type = f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : 'text';
  return <input style={inp} type={type} placeholder={f.label} value={value ?? ''} onChange={e => onChange(e.target.value)} />;
}

// ---------- Tela CRUD genérica ----------------------------------------------
function CrudTela({ titulo, sub, table, tenantDbId, userId, cols, fields, toRow, acao, nota }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantDbId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from(table).select('*').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(100);
    if (!error) setRows(data || []);
    setLoading(false);
  }, [table, tenantDbId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setErr('');
    const payload = { tenant_id: tenantDbId };
    if (userId) payload.created_by = userId;
    for (const f of fields) {
      let v = form[f.key];
      if (v === undefined || v === '') v = f.default ?? null;
      if (f.type === 'datetime' && v) v = new Date(v).toISOString();
      if (f.type === 'number' && v != null && v !== '') v = Number(v);
      payload[f.key] = v;
    }
    const missing = fields.filter(f => f.required && !payload[f.key]);
    if (missing.length) { setErr('Preencha: ' + missing.map(m => m.label).join(', ')); return; }
    setBusy(true);
    const { error } = await supabase.from(table).insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setForm({}); setAdding(false); load();
  }

  async function remove(id) {
    setBusy(true);
    const { error } = await supabase.from(table).delete().eq('id', id).eq('tenant_id', tenantDbId);
    setBusy(false);
    if (!error) setRows(rs => rs.filter(r => r.id !== id));
  }

  const allCols = [...cols, ''];
  return (
    <div>
      <h1>{titulo}</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{sub}</div>
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cv2-spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <b style={{ fontSize: 13 }}>{titulo}</b>
          <button className="cv2-btn" onClick={() => { setAdding(a => !a); setErr(''); }}>{adding ? 'Cancelar' : acao}</button>
        </div>

        {adding && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', background: '#faf9f8' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {fields.map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: f.wide ? '1 1 240px' : '0 1 180px' }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{f.label}{f.required ? ' *' : ''}</label>
                  <Campo f={f} value={form[f.key]} onChange={v => setForm(s => ({ ...s, [f.key]: v }))} />
                </div>
              ))}
              <button className="cv2-btn" disabled={busy} onClick={save} style={{ alignSelf: 'flex-end' }}>{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
            {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{err}</div>}
          </div>
        )}

        <table className="cv2-tbl">
          <thead><tr>{allCols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={allCols.length} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>carregando…</td></tr>
            ) : rows.length ? rows.map(rec => {
              const cells = toRow(rec);
              return (
                <tr key={rec.id}>
                  {cells.map((cell, j) => <td key={j}>{cell}</td>)}
                  <td style={{ textAlign: 'right' }}>
                    <button className="cv2-btn danger" disabled={busy} onClick={() => remove(rec.id)} style={{ padding: '4px 10px', fontSize: 11 }}>Excluir</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={allCols.length} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>— nenhum registro ainda —</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div className="cv2-sub" style={{ marginTop: 10, fontSize: 11.5 }}>{nota}</div>}
    </div>
  );
}

// ---------- helpers de exibição ----------------------------------------------
const Bdg = ({ cls, children }) => <span className={`cv2-bdg ${cls}`}>{children}</span>;
const fmtData = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDataCurta = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
const fmtTam = b => b ? `${Math.round(b / 1024)} KB` : '—';

const PRIO = { baixa: ['mut', 'baixa'], media: ['warn', 'média'], alta: ['err', 'alta'], urgente: ['err', 'urgente'] };
const ST_TOPICO = { aberto: ['warn', 'aberto'], em_andamento: ['ok', 'em andamento'], concluido: ['ok', 'concluído'], arquivado: ['mut', 'arquivado'] };
const ST_TAREFA = { agendada: ['warn', 'agendada'], executando: ['ok', 'executando'], concluida: ['ok', 'concluída'], cancelada: ['mut', 'cancelada'] };

// ============================================================
// TELAS FUNCIONAIS
// ============================================================
export function Gatilhos({ tenantDbId, userId }) {
  return <CrudTela titulo="Gatilhos" sub="Reações automáticas a eventos externos (WhatsApp, Asaas, iFood)."
    table="tenant_gatilhos" tenantDbId={tenantDbId} userId={userId}
    cols={['Gatilho', 'Fonte', 'Ação', 'Execuções 7d']}
    fields={[
      { key: 'nome', label: 'Gatilho', type: 'text', required: true, wide: true },
      { key: 'fonte', label: 'Fonte', type: 'select', default: 'whatsapp', options: [{ v: 'whatsapp', l: 'WhatsApp' }, { v: 'asaas', l: 'Asaas' }, { v: 'ifood', l: 'iFood' }, { v: 'manual', l: 'Manual' }] },
      { key: 'acao', label: 'Ação', type: 'text', wide: true },
    ]}
    toRow={r => [r.nome, <Bdg cls="mut">{r.fonte}</Bdg>, r.acao || '—', r.execucoes_7d ?? 0]}
    acao="+ Novo gatilho" />;
}

export function Topicos({ tenantDbId, userId }) {
  return <CrudTela titulo="Tópicos" sub="Fila de trabalho — quem cuida do quê."
    table="tenant_topicos" tenantDbId={tenantDbId} userId={userId}
    cols={['Título', 'Prioridade', 'Responsável', 'Status']}
    fields={[
      { key: 'titulo', label: 'Título', type: 'text', required: true, wide: true },
      { key: 'prioridade', label: 'Prioridade', type: 'select', default: 'media', options: [{ v: 'baixa', l: 'Baixa' }, { v: 'media', l: 'Média' }, { v: 'alta', l: 'Alta' }, { v: 'urgente', l: 'Urgente' }] },
      { key: 'responsavel', label: 'Responsável', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', default: 'aberto', options: [{ v: 'aberto', l: 'Aberto' }, { v: 'em_andamento', l: 'Em andamento' }, { v: 'concluido', l: 'Concluído' }, { v: 'arquivado', l: 'Arquivado' }] },
    ]}
    toRow={r => {
      const p = PRIO[r.prioridade] || ['mut', r.prioridade];
      const s = ST_TOPICO[r.status] || ['mut', r.status];
      return [r.titulo, <Bdg cls={p[0]}>{p[1]}</Bdg>, r.responsavel || '—', <Bdg cls={s[0]}>{s[1]}</Bdg>];
    }}
    acao="+ Novo tópico" />;
}

export function TarefasAgendadas({ tenantDbId, userId }) {
  return <CrudTela titulo="Tarefas agendadas" sub="Ações únicas com hora marcada."
    table="tenant_tarefas" tenantDbId={tenantDbId} userId={userId}
    cols={['Tarefa', 'Agente', 'Quando', 'Status']}
    fields={[
      { key: 'titulo', label: 'Tarefa', type: 'text', required: true, wide: true },
      { key: 'agente', label: 'Agente', type: 'text' },
      { key: 'quando', label: 'Quando', type: 'datetime' },
      { key: 'status', label: 'Status', type: 'select', default: 'agendada', options: [{ v: 'agendada', l: 'Agendada' }, { v: 'executando', l: 'Executando' }, { v: 'concluida', l: 'Concluída' }, { v: 'cancelada', l: 'Cancelada' }] },
    ]}
    toRow={r => {
      const s = ST_TAREFA[r.status] || ['mut', r.status];
      return [r.titulo, r.agente || '—', fmtData(r.quando), <Bdg cls={s[0]}>{s[1]}</Bdg>];
    }}
    acao="+ Nova tarefa" />;
}

export function Links({ tenantDbId, userId }) {
  return <CrudTela titulo="Links compartilhados" sub="Links públicos com validade e contagem de acessos."
    table="tenant_links" tenantDbId={tenantDbId} userId={userId}
    cols={['Arquivo', 'Link', 'Expira', 'Acessos']}
    fields={[
      { key: 'arquivo', label: 'Arquivo', type: 'text', required: true, wide: true },
      { key: 'url', label: 'Link (URL)', type: 'text', required: true, wide: true },
      { key: 'expira_em', label: 'Expira', type: 'datetime' },
    ]}
    toRow={r => [
      r.arquivo,
      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--red)', fontWeight: 600 }}>abrir</a>,
      fmtDataCurta(r.expira_em),
      r.acessos ?? 0,
    ]}
    acao="+ Novo link" />;
}

export function Arquivos({ tenantDbId, userId }) {
  return <CrudTela titulo="Arquivos" sub="Workspace do cliente — cada um enxerga só a sua pasta."
    table="tenant_files" tenantDbId={tenantDbId} userId={userId}
    cols={['Arquivo', 'Pasta', 'Tamanho', 'Modificado']}
    fields={[
      { key: 'name', label: 'Arquivo', type: 'text', required: true, wide: true },
      { key: 'folder', label: 'Pasta', type: 'text', default: '/' },
      { key: 'size_bytes', label: 'Tamanho (bytes)', type: 'number' },
      { key: 'storage_path', label: 'Caminho (storage)', type: 'text', wide: true },
    ]}
    toRow={r => [r.name, r.folder || '/', fmtTam(r.size_bytes), fmtDataCurta(r.updated_at || r.created_at)]}
    acao="+ Enviar arquivo" />;
}

// ============================================================
// TELAS DE REFERÊNCIA (leitura — configuração feita pela equipe CD)
// ============================================================
const NOTA = 'Leitura — a configuração desta tela é feita pela equipe Consult Delivery (cofre Infisical).';
export function Provedores() {
  return <Tela titulo="Provedores de IA" sub="Cada cliente pode usar a própria chave (BYO-key via cofre)." cols={['Provider', 'Modelo padrão', 'Chave', 'Status']}
    rows={[
      ['Anthropic', 'claude-sonnet-4-6', '•••• cofre', '<span class="cv2-bdg ok">ativo</span>'],
      ['OpenRouter', 'gpt-image (Estúdio)', '•••• cofre', '<span class="cv2-bdg ok">ativo</span>'],
      ['Ollama Cloud', 'kimi-k2.6', '—', '<span class="cv2-bdg mut">fallback</span>'],
    ]} nota={NOTA} />;
}
export function Integracoes() {
  return <Tela titulo="Integrações" sub="Conexões do cliente — credenciais no cofre." cols={['Integração', 'Status', 'Usada por']}
    rows={[
      ['WhatsApp (Evolution)', '<span class="cv2-bdg ok">conectada</span>', 'BRENO · MIA · Bom Dia'],
      ['Asaas', '<span class="cv2-bdg ok">conectada</span>', 'CORA · Defesa'],
      ['iFood (planilhas)', '<span class="cv2-bdg ok">via Importar</span>', 'Radar · Análise'],
      ['Telegram interno', '<span class="cv2-bdg ok">conectada</span>', 'DELI · alertas'],
    ]} nota="Leitura — a conexão é feita pela equipe Consult Delivery." />;
}
export function Sistemas() {
  return <Tela titulo="Sistemas externos" sub="Atalhos e referências dos sistemas do cliente." cols={['Sistema', 'Endereço', 'Tipo']}
    rows={[
      ['Painel iFood', 'portal.ifood.com.br', 'canal'],
      ['Asaas', 'asaas.com', 'pagamento'],
    ]} nota="Leitura — referência dos sistemas do cliente." />;
}
