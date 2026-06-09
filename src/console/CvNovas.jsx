// ============================================================
// Console v2 · telas funcionais (Gatilhos, Tópicos, Tarefas,
// Links, Arquivos) + telas de referência (Provedores/Integrações/Sistemas).
// Visual fiel ao generic() do protótipo (docs/prototipo/console-v2.html);
// CRUD real contra Supabase (tabelas tenant_* · RLS por tenant).
// Sem dado fake: estado vazio até o cliente cadastrar.
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [editId, setEditId] = useState(null);   // id da linha em edição inline
  const [editForm, setEditForm] = useState({});  // valores editáveis dessa linha
  const [editErr, setEditErr] = useState('');

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

  // ----- edição inline -----
  function startEdit(rec) {
    setEditErr('');
    setAdding(false);                      // não deixa o form de "novo" aberto junto
    const init = {};
    for (const f of fields) {
      const raw = rec[f.key];
      // datetime do banco (ISO) → valor aceito pelo <input datetime-local>
      if (f.type === 'datetime' && raw) {
        const d = new Date(raw);
        if (!isNaN(d)) {
          const pad = n => String(n).padStart(2, '0');
          init[f.key] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else init[f.key] = '';
      } else {
        init[f.key] = raw ?? '';
      }
    }
    setEditForm(init);
    setEditId(rec.id);
  }

  function cancelEdit() { setEditId(null); setEditForm({}); setEditErr(''); }

  async function saveEdit() {
    setEditErr('');
    const patch = {};
    for (const f of fields) {
      let v = editForm[f.key];
      if (v === undefined || v === '') v = f.default ?? null;
      if (f.type === 'datetime' && v) v = new Date(v).toISOString();
      if (f.type === 'number' && v != null && v !== '') v = Number(v);
      patch[f.key] = v;
    }
    const missing = fields.filter(f => f.required && !patch[f.key]);
    if (missing.length) { setEditErr('Preencha: ' + missing.map(m => m.label).join(', ')); return; }
    setBusy(true);
    const { data, error } = await supabase.from(table).update(patch)
      .eq('id', editId).eq('tenant_id', tenantDbId).select().single();
    setBusy(false);
    if (error) { setEditErr(error.message); return; }
    // patch otimista: substitui a linha pelo registro retornado (ou pelo patch)
    setRows(rs => rs.map(r => r.id === editId ? (data || { ...r, ...patch }) : r));
    cancelEdit();
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
              if (editId === rec.id) {
                // 1 input por field editável; colunas read-only restantes ficam vazias
                // para manter o alinhamento com o cabeçalho (cols.length + ações).
                const fillers = Math.max(0, cols.length - fields.length);
                return (
                  <tr key={rec.id} style={{ background: '#faf9f8' }}>
                    {fields.map(f => (
                      <td key={f.key}>
                        <Campo f={f} value={editForm[f.key]} onChange={v => setEditForm(s => ({ ...s, [f.key]: v }))} />
                      </td>
                    ))}
                    {Array.from({ length: fillers }).map((_, i) => <td key={`fill-${i}`} />)}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="cv2-btn" disabled={busy} onClick={saveEdit} style={{ padding: '4px 10px', fontSize: 11, marginRight: 6 }}>{busy ? 'Salvando…' : 'Salvar'}</button>
                      <button className="cv2-btn sec" disabled={busy} onClick={cancelEdit} style={{ padding: '4px 10px', fontSize: 11 }}>Cancelar</button>
                      {editErr && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6, fontWeight: 600 }}>{editErr}</div>}
                    </td>
                  </tr>
                );
              }
              const cells = toRow(rec);
              return (
                <tr key={rec.id}>
                  {cells.map((cell, j) => <td key={j}>{cell}</td>)}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="cv2-btn sec" disabled={busy} onClick={() => startEdit(rec)} style={{ padding: '4px 10px', fontSize: 11, marginRight: 6 }}>Editar</button>
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

// Upload real para o bucket privado 'tenant-files' (RLS por tenant via path
// '<tenant_id>/<uuid>-<arquivo>'). Download por signed URL temporária.
const FILES_BUCKET = 'tenant-files';
const linkBtn = { color: 'var(--red)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', textAlign: 'left' };

export function Arquivos({ tenantDbId, userId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!tenantDbId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('tenant_files').select('*')
      .eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(200);
    if (!error) setRows(data || []);
    setLoading(false);
  }, [tenantDbId]);

  useEffect(() => { load(); }, [load]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';            // permite reenviar o mesmo arquivo depois
    if (!file || !tenantDbId) return;
    setErr(''); setBusy(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${tenantDbId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(FILES_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      const payload = { tenant_id: tenantDbId, name: file.name, folder: '/', size_bytes: file.size, storage_path: path };
      if (userId) payload.created_by = userId;
      const { error: insErr } = await supabase.from('tenant_files').insert(payload);
      if (insErr) {
        await supabase.storage.from(FILES_BUCKET).remove([path]);  // evita órfão no storage
        throw insErr;
      }
      await load();
    } catch (ex) {
      setErr(ex?.message || String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function download(rec) {
    if (!rec.storage_path) return;
    setErr('');
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(rec.storage_path, 120);
    if (error) { setErr(error.message); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(rec) {
    setBusy(true);
    if (rec.storage_path) await supabase.storage.from(FILES_BUCKET).remove([rec.storage_path]);
    const { error } = await supabase.from('tenant_files').delete().eq('id', rec.id).eq('tenant_id', tenantDbId);
    setBusy(false);
    if (!error) setRows(rs => rs.filter(r => r.id !== rec.id));
  }

  return (
    <div>
      <h1>Arquivos</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Workspace do cliente — cada um enxerga só a sua pasta.</div>
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cv2-spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <b style={{ fontSize: 13 }}>Arquivos</b>
          <button className="cv2-btn" disabled={busy || !tenantDbId} onClick={() => fileRef.current?.click()}>
            {busy ? 'Enviando…' : '+ Enviar arquivo'}
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onPick} />
        </div>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>{err}</div>}

        <table className="cv2-tbl">
          <thead><tr><th>Arquivo</th><th>Pasta</th><th>Tamanho</th><th>Modificado</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>carregando…</td></tr>
            ) : rows.length ? rows.map(rec => (
              <tr key={rec.id}>
                <td>
                  {rec.storage_path
                    ? <button className="cv2-btn-link" style={linkBtn} onClick={() => download(rec)}>{rec.name}</button>
                    : rec.name}
                </td>
                <td>{rec.folder || '/'}</td>
                <td>{fmtTam(rec.size_bytes)}</td>
                <td>{fmtDataCurta(rec.updated_at || rec.created_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="cv2-btn danger" disabled={busy} onClick={() => remove(rec)} style={{ padding: '4px 10px', fontSize: 11 }}>Excluir</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>— nenhum registro ainda —</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="cv2-sub" style={{ marginTop: 10, fontSize: 11.5 }}>
        Arquivos privados, isolados por cliente. O link de download é temporário (expira em 2 minutos).
      </div>
    </div>
  );
}

// ============================================================
// TELAS DE REFERÊNCIA (leitura — configuração feita pela equipe CD)
// ============================================================
const NOTA = 'Leitura — a configuração desta tela é feita pela equipe Consult Delivery (cofre Infisical).';

// helper de escape p/ valores vindos do banco (vão p/ dangerouslySetInnerHTML em <Tela>)
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Hook de leitura read-only por tenant (mesmo padrão de Arquivos/CrudTela).
// Robusto: query falha ou tabela inexistente → rows = [] (estado vazio gracioso).
function useRefRows(table, tenantDbId, mapRow) {
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    if (!tenantDbId) { setRows([]); return; }
    const { data, error } = await supabase.from(table)
      .select('*').eq('tenant_id', tenantDbId).order('ordem', { ascending: true });
    if (error || !data) { setRows([]); return; }
    setRows(data.map(mapRow));
  }, [table, tenantDbId, mapRow]);

  useEffect(() => { load(); }, [load]);
  return rows;
}

const ST_PROV = { ativo: 'ok', fallback: 'mut', inativo: 'mut' };

export function Provedores({ tenantDbId }) {
  const mapRow = useCallback(rec => {
    const cls = ST_PROV[rec.status] || 'mut';
    const st = esc(rec.status || '—');
    return [
      esc(rec.provider),
      esc(rec.modelo_padrao || '—'),
      rec.chave_ref ? esc(rec.chave_ref) : '—',
      `<span class="cv2-bdg ${cls}">${st}</span>`,
    ];
  }, []);
  const rows = useRefRows('tenant_provedores', tenantDbId, mapRow);
  return <Tela titulo="Provedores de IA" sub="Cada cliente pode usar a própria chave (BYO-key via cofre)."
    cols={['Provider', 'Modelo padrão', 'Chave', 'Status']} rows={rows} nota={NOTA} />;
}
const ST_INT = { conectada: 'ok', pendente: 'mut', desconectada: 'mut' };

export function Integracoes({ tenantDbId }) {
  const mapRow = useCallback(rec => {
    const cls = ST_INT[rec.status] || 'mut';
    return [
      esc(rec.nome),
      `<span class="cv2-bdg ${cls}">${esc(rec.status || '—')}</span>`,
      esc(rec.usada_por || '—'),
    ];
  }, []);
  const rows = useRefRows('tenant_integracoes', tenantDbId, mapRow);
  return <Tela titulo="Integrações" sub="Conexões do cliente — a integração é feita pela equipe Consult Delivery."
    cols={['Integração', 'Status', 'Usada por']} rows={rows} nota={NOTA} />;
}
export function Sistemas({ tenantDbId }) {
  const mapRow = useCallback(rec => [
    esc(rec.nome),
    esc(rec.endereco || '—'),
    esc(rec.tipo || '—'),
  ], []);
  const rows = useRefRows('tenant_sistemas', tenantDbId, mapRow);
  return <Tela titulo="Sistemas externos" sub="Atalhos e referências dos sistemas do cliente."
    cols={['Sistema', 'Endereço', 'Tipo']} rows={rows} nota="Leitura — referência dos sistemas do cliente." />;
}
