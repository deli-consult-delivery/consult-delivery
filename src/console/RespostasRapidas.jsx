import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — Respostas Rápidas
// CRUD completo: texto com formatação WhatsApp + mídia (imagem/áudio/vídeo)
// ============================================================

const TIPOS = [
  { id: 'text',       label: 'Texto'     },
  { id: 'image',      label: 'Imagem'    },
  { id: 'audio',      label: 'Áudio'     },
  { id: 'video_link', label: 'Link de vídeo' },
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

// Insere marcador WhatsApp ao redor do texto selecionado no textarea
function wrapSelection(ref, marker) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const val   = el.value;
  const selected = val.slice(start, end);
  const before    = val.slice(0, start);
  const after     = val.slice(end);
  const novo = before + marker + selected + marker + after;
  // Atualiza via setter React (dispara onChange)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeInputValueSetter.call(el, novo);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // Reposiciona o cursor depois do marcador de fechamento
  const novoEnd = start + marker.length + selected.length + marker.length;
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
  const [titulo,   setTitulo]   = useState(initial?.title     ?? '');
  const [atalho,   setAtalho]   = useState(initial?.shortcut  ?? '');
  const [tipo,     setTipo]     = useState(initial?.media_type ?? 'text');
  const [conteudo, setConteudo] = useState(initial?.content   ?? '');
  const [mediaUrl, setMediaUrl] = useState(initial?.media_url ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState(null);
  const textareaRef = useRef(null);

  async function salvar() {
    setErro(null);
    if (!titulo.trim()) { setErro('Informe o título.'); return; }
    if (tipo !== 'text' && !mediaUrl.trim()) { setErro('Informe a URL da mídia.'); return; }
    const payload = {
      tenant_id:  tenantDbId,
      title:      titulo.trim(),
      shortcut:   atalho.trim() || null,
      content:    conteudo,
      media_type: tipo,
      media_url:  mediaUrl.trim() || null,
      created_by: userId ?? null,
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
      setTitulo(''); setAtalho(''); setTipo('text'); setConteudo(''); setMediaUrl('');
    }
    onSaved();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {erro && <div style={{ color: 'var(--red)', fontSize: 12 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputStyle, flex: 2 }} placeholder="Título*" value={titulo} onChange={e => setTitulo(e.target.value)} />
        <input style={{ ...inputStyle, flex: 1 }} placeholder="Atalho (ex: /ola)" value={atalho} onChange={e => setAtalho(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {TIPOS.map(t => (
          <button
            key={t.id}
            type="button"
            className={tipo === t.id ? 'cv2-btn' : 'cv2-btn sec'}
            style={{ fontSize: 12, padding: '5px 10px' }}
            onClick={() => setTipo(t.id)}
          >
            {TIPO_ICONE[t.id]} {t.label}
          </button>
        ))}
      </div>
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
      {tipo !== 'text' && (
        <>
          <input
            style={inputStyle}
            placeholder={
              tipo === 'image'      ? 'URL da imagem (https://…)' :
              tipo === 'audio'      ? 'URL do áudio (https://…)'  :
                                     'URL do vídeo (https://…)'
            }
            value={mediaUrl}
            onChange={e => setMediaUrl(e.target.value)}
          />
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            placeholder="Legenda / texto opcional"
            value={conteudo}
            onChange={e => setConteudo(e.target.value)}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="cv2-btn" disabled={salvando} onClick={salvar}>
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
      .select('id, title, shortcut, content, media_type, media_url')
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
        Mensagens pré-definidas acessíveis durante o atendimento — suportam texto com formatação WhatsApp, imagem, áudio e link de vídeo.
        {erro ? <span style={{ color: 'var(--red)', marginLeft: 8 }}>Erro: {erro}</span> : null}
      </div>

      {/* Formulário de criação */}
      <div className="cv2-card" style={{ maxWidth: 680 }}>
        <h3 style={{ marginBottom: 14 }}>Nova resposta rápida</h3>
        <FormQR
          tenantDbId={tenantDbId}
          userId={userId}
          onSaved={carregar}
        />
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
        const bdg  = TIPO_BADGE[r.media_type] ?? TIPO_BADGE.text;
        const icone = TIPO_ICONE[r.media_type] ?? '⭐';
        const isEditing   = editandoId === r.id;
        const isConfirm   = confirmaId === r.id;

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
                      <b style={{ fontSize: 14 }}>{r.title}</b>
                      {r.shortcut && (
                        <code style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx2)', background: '#f0f0f0', padding: '1px 5px', borderRadius: 3 }}>
                          {r.shortcut}
                        </code>
                      )}
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

                {/* Preview do conteúdo */}
                {r.content && (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>
                    {r.content}
                  </div>
                )}
                {r.media_url && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--tx3)' }}>
                    🔗 <a href={r.media_url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{r.media_url}</a>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
