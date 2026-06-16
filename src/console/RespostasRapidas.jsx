import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — Respostas Rápidas v3
// Upload real de imagem/áudio, gravação de voz, grupo e visibilidade
// ============================================================

const TIPOS = [
  { id: 'text',  label: 'Texto'  },
  { id: 'image', label: 'Imagem' },
  { id: 'audio', label: 'Áudio'  },
];

const TIPO_BADGE = {
  text:       { cls: 'mut',  txt: 'TEXTO'  },
  image:      { cls: 'info', txt: 'IMAGEM' },
  audio:      { cls: 'warn', txt: 'ÁUDIO'  },
  video_link: { cls: 'err',  txt: 'VÍDEO'  },
};

const TIPO_ICONE = {
  text:       '⭐',
  image:      '🖼',
  audio:      '🎵',
  video_link: '🎬',
};

const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)',
  borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff',
};

function wrapSelection(ref, marker) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const val   = el.value;
  const novo  = val.slice(0, start) + marker + val.slice(start, end) + marker + val.slice(end);
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSet.call(el, novo);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const novoEnd = start + marker.length + (end - start) + marker.length;
  el.setSelectionRange(novoEnd, novoEnd);
  el.focus();
}

function FormatToolbar({ textareaRef }) {
  const btn = (label, marker, title) => (
    <button
      type="button"
      title={title}
      onClick={() => wrapSelection(textareaRef, marker)}
      style={{
        padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 3,
        background: '#f5f5f5', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
      {btn(<b>B</b>, '*',  'Negrito (*texto*)')}
      {btn(<em>I</em>, '_', 'Itálico (_texto_)')}
      {btn(<del>S</del>, '~', 'Tachado (~texto~)')}
      {btn(<code style={{ fontSize: 11 }}>{'</>'}</code>, '`', 'Código (`texto`)')}
    </div>
  );
}

// ── Formulário (criação ou edição) ────────────────────────────
function FormQR({ tenantDbId, userId, initial, onSaved, onCancel }) {
  const [titulo,       setTitulo]       = useState(initial?.title            ?? '');
  const [atalho,       setAtalho]       = useState(initial?.shortcut         ?? '');
  const [tipo,         setTipo]         = useState(initial?.media_type       ?? 'text');
  const [conteudo,     setConteudo]     = useState(initial?.content          ?? '');
  const [grupo,        setGrupo]        = useState(initial?.group_name       ?? '');
  const [filePath,     setFilePath]     = useState(initial?.file_path        ?? null);
  const [filePreview,  setFilePreview]  = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [recording,    setRecording]    = useState(false);
  const [recSeconds,   setRecSeconds]   = useState(0);
  const [mediaRec,     setMediaRec]     = useState(null);
  const [visDeptIds,   setVisDeptIds]   = useState(initial?.visible_dept_ids ?? []);
  const [visUserIds,   setVisUserIds]   = useState(initial?.visible_user_ids ?? []);
  const [depts,        setDepts]        = useState([]);
  const [agents,       setAgents]       = useState([]);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Se editando, carrega preview da imagem/áudio já salvo
  useEffect(() => {
    if (initial?.file_path) {
      const { data } = supabase.storage.from('public').getPublicUrl(initial.file_path);
      setFilePreview(data?.publicUrl ?? null);
    }
  }, [initial?.file_path]);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('departments').select('id, name')
      .eq('tenant_id', tenantDbId).eq('is_active', true).order('name')
      .then(({ data }) => setDepts(data ?? []));
    supabase.rpc('get_tenant_members', { p_tenant_id: tenantDbId })
      .then(({ data }) => setAgents(data ?? []));
  }, [tenantDbId]);

  // Limpa recursos de gravação ao desmontar
  useEffect(() => () => {
    if (mediaRec?.stream) mediaRec.stream.getTracks().forEach(t => t.stop());
  }, [mediaRec]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setFilePreview(URL.createObjectURL(file));
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `quick-replies/${tenantDbId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('public').upload(path, file, { upsert: false });
    setUploading(false);
    if (error) { setErro('Erro ao enviar imagem: ' + error.message); setFilePreview(null); return; }
    setFilePath(path);
  }

  function removerArquivo() {
    setFilePath(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function iniciarGravacao() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        setFilePreview(URL.createObjectURL(blob));
        setUploading(true);
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const path = `quick-replies/${tenantDbId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('public').upload(path, blob, { contentType: mimeType, upsert: false });
        setUploading(false);
        if (error) { setErro('Erro ao salvar áudio: ' + error.message); setFilePreview(null); return; }
        setFilePath(path);
      };
      const timer = setInterval(() => setRecSeconds(s => s + 1), 1000);
      recorder.start();
      recorder._timer = timer;
      setMediaRec({ recorder, stream });
      setRecording(true);
      setRecSeconds(0);
    } catch (err) {
      setErro('Microfone não disponível: ' + err.message);
    }
  }

  function pararGravacao() {
    if (mediaRec?.recorder) {
      clearInterval(mediaRec.recorder._timer);
      mediaRec.recorder.stop();
    }
    setRecording(false);
  }

  async function salvar() {
    setErro(null);
    if (!titulo.trim()) { setErro('Informe o título.'); return; }
    if (tipo !== 'text' && !filePath && !initial?.media_url) { setErro('Selecione ou grave o arquivo de mídia.'); return; }
    const payload = {
      tenant_id:        tenantDbId,
      title:            titulo.trim(),
      shortcut:         atalho.trim() || null,
      content:          conteudo,
      media_type:       tipo,
      media_url:        filePath ? null : (initial?.media_url ?? null),
      file_path:        filePath ?? null,
      group_name:       grupo.trim() || null,
      visible_user_ids: visUserIds.length > 0 ? visUserIds : null,
      visible_dept_ids: visDeptIds.length > 0 ? visDeptIds : null,
      created_by:       userId ?? null,
    };
    setSalvando(true);
    let error;
    try {
      if (initial?.id) {
        ({ error } = await supabase.from('quick_replies').update(payload).eq('id', initial.id));
      } else {
        ({ error } = await supabase.from('quick_replies').insert(payload));
      }
    } finally {
      setSalvando(false);
    }
    if (error) { setErro(error.message); return; }
    if (!initial?.id) {
      setTitulo(''); setAtalho(''); setTipo('text'); setConteudo('');
      setGrupo(''); setFilePath(null); setFilePreview(null);
      setVisUserIds([]); setVisDeptIds([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    onSaved();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {erro && <div style={{ color: 'var(--red)', fontSize: 12 }}>{erro}</div>}

      {/* Título + Atalho */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputStyle, flex: 2 }} placeholder="Título*" value={titulo} onChange={e => setTitulo(e.target.value)} />
        <input style={{ ...inputStyle, flex: 1 }} placeholder="Atalho (ex: /ola)" value={atalho} onChange={e => setAtalho(e.target.value)} />
      </div>

      {/* Grupo */}
      <input style={inputStyle} placeholder="Grupo (ex: Boas-vindas, Cobrança)" value={grupo} onChange={e => setGrupo(e.target.value)} />

      {/* Tipo */}
      <div style={{ display: 'flex', gap: 6 }}>
        {TIPOS.map(t => (
          <button
            key={t.id}
            type="button"
            className={tipo === t.id ? 'cv2-btn' : 'cv2-btn sec'}
            style={{ fontSize: 12, padding: '5px 10px' }}
            onClick={() => { if (recording) pararGravacao(); setTipo(t.id); setFilePath(null); setFilePreview(null); }}
          >
            {TIPO_ICONE[t.id]} {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo por tipo */}
      {tipo === 'text' && (
        <>
          <FormatToolbar textareaRef={textareaRef} />
          <textarea
            ref={textareaRef}
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder="Texto da mensagem… use *negrito*, _itálico_, ~tachado~, `código`"
            value={conteudo}
            onChange={e => setConteudo(e.target.value)}
          />
        </>
      )}

      {tipo === 'image' && (
        <>
          {/* Input oculto de arquivo */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {!filePath ? (
            <button
              type="button"
              className="cv2-btn sec"
              style={{ alignSelf: 'flex-start' }}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Enviando…' : '📎 Anexar imagem'}
            </button>
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
              <img
                src={filePreview}
                alt=""
                style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }}
              />
              <button
                type="button"
                onClick={removerArquivo}
                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12, lineHeight: '22px', padding: 0 }}
              >✕</button>
            </div>
          )}
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            placeholder="Legenda da imagem (opcional)"
            value={conteudo}
            onChange={e => setConteudo(e.target.value)}
          />
        </>
      )}

      {tipo === 'audio' && (
        <>
          {!filePath ? (
            recording ? (
              <button
                type="button"
                className="cv2-btn"
                style={{ background: 'var(--red)', borderColor: 'var(--red)', alignSelf: 'flex-start' }}
                onClick={pararGravacao}
              >
                ⏹ Parar gravação ({recSeconds}s)
              </button>
            ) : (
              <button
                type="button"
                className="cv2-btn sec"
                style={{ alignSelf: 'flex-start' }}
                disabled={uploading}
                onClick={iniciarGravacao}
              >
                {uploading ? 'Salvando áudio…' : '🎙 Iniciar gravação'}
              </button>
            )
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {filePreview && <audio controls src={filePreview} style={{ height: 36 }} />}
              <button type="button" className="cv2-btn sec" style={{ fontSize: 11 }} onClick={removerArquivo}>✕ Regravar</button>
            </div>
          )}
        </>
      )}

      {/* Visibilidade: Departamentos */}
      {depts.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4 }}>Departamentos (vazio = todos)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {depts.map(d => (
              <label key={d.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visDeptIds.includes(d.id)}
                  onChange={e => setVisDeptIds(prev => e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id))}
                />
                {d.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Visibilidade: Atendentes */}
      {agents.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4 }}>Atendentes (vazio = todos)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {agents.map(a => (
              <label key={a.user_id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visUserIds.includes(a.user_id)}
                  onChange={e => setVisUserIds(prev => e.target.checked ? [...prev, a.user_id] : prev.filter(x => x !== a.user_id))}
                />
                {a.full_name || a.email}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="cv2-btn" disabled={salvando || uploading || recording} onClick={salvar}>
          {salvando ? 'Salvando…' : (initial?.id ? 'Salvar alterações' : 'Criar resposta rápida')}
        </button>
        {onCancel && (
          <button className="cv2-btn sec" onClick={onCancel}>Cancelar</button>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function RespostasRapidas({ tenantDbId, userId }) {
  const [rows,       setRows]       = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [confirmaId, setConfirmaId] = useState(null);
  const [removendo,  setRemovendo]  = useState(false);
  const [erro,       setErro]       = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const { data, error } = await supabase
      .from('quick_replies')
      .select('id, title, shortcut, content, media_type, media_url, file_path, group_name, visible_user_ids, visible_dept_ids')
      .eq('tenant_id', tenantDbId)
      .order('title');
    if (error) { setErro(error.message); return; }
    setRows(data ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function remover(id) {
    setRemovendo(true);
    const { error, count } = await supabase.from('quick_replies').delete({ count: 'exact' }).eq('id', id);
    setRemovendo(false);
    if (error) { setErro(error.message); return; }
    if (count === 0) { setErro('Sem permissão para apagar este item.'); return; }
    setConfirmaId(null);
    await carregar();
  }

  return (
    <div>
      <h1>
        Respostas Rápidas{' '}
        <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
          CHAT AO VIVO
        </span>
      </h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Mensagens pré-definidas acessíveis durante o atendimento — texto com formatação WhatsApp, imagem com legenda ou áudio gravado.
        {erro ? <span style={{ color: 'var(--red)', marginLeft: 8 }}>Erro: {erro}</span> : null}
      </div>

      {/* Formulário de criação */}
      <div className="cv2-card" style={{ maxWidth: 700 }}>
        <h3 style={{ marginBottom: 14 }}>Nova resposta rápida</h3>
        <FormQR tenantDbId={tenantDbId} userId={userId} onSaved={carregar} />
      </div>

      {/* Lista de respostas salvas */}
      {rows === null && (
        <div className="cv2-card" style={{ color: 'var(--tx2)' }}>Carregando…</div>
      )}
      {rows !== null && rows.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhuma resposta rápida cadastrada ainda.
        </div>
      )}
      {rows && rows.map(r => {
        const bdg    = TIPO_BADGE[r.media_type] ?? TIPO_BADGE.text;
        const icone  = TIPO_ICONE[r.media_type] ?? '⭐';
        const isEditing = editandoId === r.id;
        const isConfirm = confirmaId === r.id;
        const pubUrl = r.file_path
          ? supabase.storage.from('public').getPublicUrl(r.file_path).data?.publicUrl
          : null;

        return (
          <div key={r.id} className="cv2-card">
            {isEditing ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                  Editando: <em>{r.title}</em>
                </div>
                <FormQR
                  tenantDbId={tenantDbId}
                  userId={userId}
                  initial={r}
                  onSaved={() => { setEditandoId(null); void carregar(); }}
                  onCancel={() => setEditandoId(null)}
                />
              </>
            ) : (
              <>
                <div className="cv2-spread">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{icone}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <b style={{ fontSize: 14 }}>{r.title}</b>
                        {r.shortcut && (
                          <code style={{ fontSize: 11, color: 'var(--tx2)', background: '#f0f0f0', padding: '1px 5px', borderRadius: 3 }}>
                            {r.shortcut}
                          </code>
                        )}
                        {r.group_name && (
                          <span style={{ fontSize: 11, color: 'var(--tx2)', background: '#ebebeb', padding: '1px 6px', borderRadius: 10 }}>
                            {r.group_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`cv2-bdg ${bdg.cls}`}>{bdg.txt}</span>
                    <button
                      className="cv2-btn sec"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => { setEditandoId(r.id); setConfirmaId(null); }}
                    >
                      ✏️ Editar
                    </button>
                    {isConfirm ? (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--red)' }}>Confirmar?</span>
                        <button
                          className="cv2-btn"
                          style={{ fontSize: 11, padding: '3px 8px', background: 'var(--red)', borderColor: 'var(--red)' }}
                          disabled={removendo}
                          onClick={() => remover(r.id)}
                        >
                          {removendo ? '…' : 'Sim, apagar'}
                        </button>
                        <button
                          className="cv2-btn sec"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => setConfirmaId(null)}
                        >
                          Não
                        </button>
                      </>
                    ) : (
                      <button
                        className="cv2-btn sec"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => setConfirmaId(r.id)}
                      >
                        🗑 Apagar
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview de conteúdo */}
                {r.content && (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>
                    {r.content}
                  </div>
                )}
                {pubUrl && r.media_type === 'image' && (
                  <img
                    src={pubUrl}
                    alt=""
                    style={{ marginTop: 8, maxHeight: 100, maxWidth: '100%', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }}
                  />
                )}
                {pubUrl && r.media_type === 'audio' && (
                  <audio controls src={pubUrl} style={{ marginTop: 8, height: 36, width: '100%', maxWidth: 300 }} />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
