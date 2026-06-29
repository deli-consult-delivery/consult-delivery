import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Supabase (direto, sem SDK) ──────────────────────────────────────────────
const SUPA_URL  = 'https://czyanilrverorwenikqw.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eWFuaWxydmVyb3J3ZW5pa3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTg5MzksImV4cCI6MjA5MjYzNDkzOX0.k_EIEgnM5a-4Ub52-w5VJw9WJBEPNQmmwgz8AEuyoAw';
const CLIENT_PAGE = 'https://app.consultdelivery.com.br/aprovacao-avaliacao.html';
const EVO_URL     = 'https://evo1-evolution-api.bawafu.easypanel.host';
const EVO_KEY     = '66A55B39-3167-4B15-8933-D65B26F56E6F';
const EVO_INST    = 'consult-delivery';
const WA_GROUP_FALLBACK = '120363175577392322@g.us';

// ─── Lista fixa das 14 lojas ─────────────────────────────────────────────────
const KNOWN_STORES = [
  'Café Container - Lanches e Salgados',
  'Churrascaria Cardoso - Marmitas & Espetos',
  'Delícias Grill - Marmitas & Espetinhos',
  'Jf Espetaria - Marmitas & Espetos',
  'Mangiare Pizzaria - Forno a Lenha',
  'Marmitaria & Restaurante - Panelada da Tia',
  'Panificadora Café Com Pão Cidade Jardim',
  'Piazza Navona Pizzaria',
  'Pizzaria Lá Mazza - Pizzas e Porções',
  'Planet Pizza - Parauapebas',
  'Popdi Pizza',
  "Varanda's Churrascaria e Pizzaria",
  'Villas Caldos da 14 - B. União',
  'Villas Caldos - Panelinhas e Petiscos',
];

const SUPA_HDR = {
  'apikey': SUPA_ANON,
  'Authorization': `Bearer ${SUPA_ANON}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbSelect(q = '') {
  const r = await fetch(`${SUPA_URL}/rest/v1/reviews?${q}`, { headers: SUPA_HDR });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbUpdate(match, body) {
  const q = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SUPA_URL}/rest/v1/reviews?${q}`, {
    method: 'PATCH', headers: SUPA_HDR, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbUpdateStoreGroup(store, groupId) {
  const q = `store=eq.${encodeURIComponent(store)}`;
  const r = await fetch(`${SUPA_URL}/rest/v1/reviews?${q}`, {
    method: 'PATCH', headers: SUPA_HDR, body: JSON.stringify({ whatsapp_group: groupId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmtDate(iso) {
  if (!iso) return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function mapRow(r) {
  return {
    id: r.id, store: r.store, orderId: r.order_id, rating: r.rating,
    clientName: r.client_name, clientComment: r.client_comment,
    suggestedResponse: r.suggested_response, finalResponse: r.final_response,
    status: r.status, deadline: r.deadline,
    reviewDate: r.review_date || null,
    createdAt: r.created_at ? r.created_at.slice(0, 10) : null,
    token: r.token, approvedAt: r.approved_at, publishedAt: r.published_at,
    whatsappGroup: r.whatsapp_group || null,
  };
}

const STATUS_CFG = {
  pending:        { label: 'Aguardando envio',       cls: 'warn' },
  sent_to_client: { label: 'Com cliente',            cls: 'warn' },
  approved:       { label: 'Aprovado',               cls: 'ok'   },
  modified:       { label: 'Aprovado c/ alteração',  cls: 'ok'   },
  published:      { label: 'Publicado no iFood',     cls: 'mut'  },
};

const inp = {
  width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '6px 9px',
  border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink)',
};

function Stars({ rating }) {
  const cols = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#84cc16', 5: '#22c55e' };
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? (cols[rating] || '#888') : '#ccc', fontSize: 13 }}>★</span>
      ))}
    </span>
  );
}

function buildWaMsg(review, resp) {
  const stars = '⭐'.repeat(review.rating || 0);
  const link = `${CLIENT_PAGE}?token=${review.token}`;
  return `📋 *Avaliação para aprovação — ${review.store}*\n\n${stars} — Pedido ${review.orderId}\n\n*Comentário do cliente:*\n_"${review.clientComment}"_\n\n*Sugestão de resposta:*\n${resp}\n\n🔗 *Link para aprovar ou editar:*\n${link}\n\n_(Sem retorno até as 9h do dia seguinte, publicamos essa resposta no iFood.)_`;
}

async function postEvo(groupId, text) {
  const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
    body: JSON.stringify({ number: groupId, text }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchEvoGroups() {
  const r = await fetch(`${EVO_URL}/group/fetchAllGroups/${EVO_INST}?getParticipants=false`, {
    headers: { 'apikey': EVO_KEY },
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return (Array.isArray(data) ? data : [])
    .map(g => ({ id: g.id, name: g.subject || g.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function copiar(t) { try { navigator.clipboard?.writeText(t || ''); } catch { /* ignora */ } }

// ─── Seção de configuração de grupos por loja ────────────────────────────────
function ConfigGrupos({ stores, storeGroups, groups, groupsLoading, groupsError, onSave }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(() => ({ ...storeGroups }));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal({ ...storeGroups }); }, [storeGroups]);

  async function salvar() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
  }

  return (
    <div className="cv2-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Grupos WhatsApp por loja</h3>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>
            Configure o grupo de cada loja. A lista de grupos é buscada automaticamente na Evolution API.
          </div>
        </div>
        <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={() => setOpen(v => !v)}>
          {open ? 'Fechar' : 'Configurar'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {groupsLoading && <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Carregando grupos da Evolution API…</div>}
          {groupsError && <div style={{ fontSize: 13, color: 'var(--red)' }}>Erro ao buscar grupos: {groupsError}</div>}
          {!groupsLoading && groups.length === 0 && !groupsError && (
            <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhum grupo encontrado na Evolution API.</div>
          )}
          {stores.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhuma loja encontrada nas avaliações ainda.</div>
          )}
          {stores.map(store => (
            <div key={store} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 0', borderBottom: '1px solid var(--line)',
            }}>
              <span style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{store}</span>
              <select
                value={local[store] || ''}
                onChange={e => setLocal(l => ({ ...l, [store]: e.target.value }))}
                style={{ ...inp, width: 'auto', minWidth: 260, fontSize: 12 }}
                disabled={groupsLoading || groups.length === 0}
              >
                <option value="">— selecionar grupo —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {local[store] && (
                <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'monospace' }}>
                  {local[store]}
                </span>
              )}
            </div>
          ))}
          {stores.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button className="cv2-btn" style={{ fontSize: 12 }} disabled={saving || groupsLoading} onClick={salvar}>
                {saving ? 'Salvando…' : 'Salvar configuração de grupos'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--tx2)', marginLeft: 10 }}>
                Aplica o grupo a todas as avaliações da loja no Supabase.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card individual ──────────────────────────────────────────────────────────
function CardReview({ review, busy, onSend, onPublish, onSaveDraft }) {
  const [draft, setDraft] = useState(review.finalResponse || review.suggestedResponse || '');
  const [copied, setCopied] = useState(false);

  const st = STATUS_CFG[review.status] || { label: review.status, cls: 'mut' };
  const isApproved = review.status === 'approved' || review.status === 'modified';
  const isDone = review.status === 'published';
  const finalText = review.finalResponse || review.suggestedResponse || draft;
  const over = draft.length > 300;

  function handleCopyLink() {
    copiar(`${CLIENT_PAGE}?token=${review.token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className={`cv2-bdg ${st.cls}`} style={{ fontSize: 11 }}>{st.label}</span>
        <Stars rating={review.rating} />
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>Pedido {review.orderId}</span>
        {review.deadline && <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ {fmtDate(review.deadline)}</span>}
        {review.reviewDate && (
          <span style={{ fontSize: 11, color: 'var(--tx2)', marginLeft: 'auto' }}>
            📅 {fmtDate(review.reviewDate)}
          </span>
        )}
      </div>

      {/* Indicador de grupo WA */}
      {review.whatsappGroup ? (
        <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
          📲 Grupo: <span style={{ fontFamily: 'monospace' }}>{review.whatsappGroup}</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>
          ⚠ Grupo WA não configurado — configure acima antes de enviar.
        </div>
      )}

      {/* Cliente */}
      {review.clientName && (
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>
          Cliente: <strong style={{ color: 'var(--ink)' }}>{review.clientName}</strong>
        </div>
      )}

      {/* Comentário */}
      <div style={{
        fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 10,
        background: 'var(--bg2,#f5f4f2)', borderRadius: 6, padding: '8px 10px',
        borderLeft: '3px solid var(--line)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>COMENTÁRIO DO CLIENTE</span>
        "{review.clientComment}"
      </div>

      {/* Resposta */}
      {isDone ? (
        <div style={{
          fontSize: 13, lineHeight: 1.6, background: 'var(--green-soft,#f0fdf4)',
          borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--green,#22c55e)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>RESPOSTA PUBLICADA</span>
          {finalText}
          {review.publishedAt && <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 4 }}>
            Publicado em {new Date(review.publishedAt).toLocaleDateString('pt-BR')}
          </div>}
        </div>
      ) : isApproved ? (
        <>
          <div style={{
            fontSize: 13, lineHeight: 1.6, background: 'var(--green-soft,#f0fdf4)',
            borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--green,#22c55e)', marginBottom: 8,
          }}>
            <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>
              RESPOSTA APROVADA{review.status === 'modified' ? ' COM ALTERAÇÃO' : ''}
              {review.approvedAt && ` · ${new Date(review.approvedAt).toLocaleDateString('pt-BR')}`}
            </span>
            {finalText}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="cv2-btn" style={{ fontSize: 11.5 }} disabled={busy} onClick={() => onPublish(review.id, finalText)}>
              {busy ? '…' : 'Marcar como publicado'}
            </button>
            <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => copiar(finalText)}>Copiar resposta</button>
          </div>
        </>
      ) : (
        <>
          <div style={{
            background: review.status === 'sent_to_client' ? '#fffbeb' : 'var(--bg2,#f5f4f2)',
            borderRadius: 6, padding: '10px 12px', marginBottom: 4,
            borderLeft: `3px solid ${review.status === 'sent_to_client' ? '#f59e0b' : 'var(--line)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>SUGESTÃO DE RESPOSTA</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: over ? 'var(--red)' : 'var(--tx2)' }}>
                {draft.length}/300{over ? ' ⚠' : ''}
              </span>
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={3}
              style={{ ...inp, borderColor: over ? 'var(--red)' : 'var(--line)', resize: 'vertical', background: 'transparent' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <button
              className="cv2-btn"
              style={{ fontSize: 11.5 }}
              disabled={busy || over || !draft.trim() || !review.whatsappGroup}
              title={!review.whatsappGroup ? 'Configure o grupo WA desta loja antes de enviar' : ''}
              onClick={() => onSend(review.id, draft)}
            >
              {busy ? '…' : review.status === 'sent_to_client' ? 'Reenviar prévia' : 'Enviar prévia ao cliente'}
            </button>
            <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={handleCopyLink}>
              {copied ? '✓ Copiado!' : 'Copiar link'}
            </button>
            <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => copiar(draft)}>Copiar resposta</button>
            {draft !== (review.finalResponse || review.suggestedResponse || '') && (
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={busy} onClick={() => onSaveDraft(review.id, draft)}>
                Salvar rascunho
              </button>
            )}
          </div>
          {review.status === 'sent_to_client' && (
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 6 }}>
              ⏰ Aguardando aprovação — sem retorno até 9h do dia seguinte, publicar a sugestão original.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Accordion por loja ───────────────────────────────────────────────────────
function StoreAccordion({ storeName, reviews, defaultOpen, busy, onSend, onPublish, onSaveDraft }) {
  const [open, setOpen] = useState(defaultOpen);

  const pendingCount = reviews.filter(r => r.status === 'pending' || r.status === 'sent_to_client').length;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const minDeadline = reviews.reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
  const isUrgent = minDeadline && minDeadline <= tomorrow;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 8, marginBottom: 10,
      background: '#fff', overflow: 'hidden',
    }}>
      {/* Cabeçalho do accordion */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
          cursor: 'pointer', userSelect: 'none',
          background: open ? 'var(--bg2,#f5f4f2)' : '#fff',
          borderBottom: open ? '1px solid var(--line)' : 'none',
        }}
      >
        <span style={{ fontSize: 15, color: 'var(--tx2)', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, color: 'var(--ink)' }}>{storeName}</span>
        {isUrgent && (
          <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ urgente {fmtDate(minDeadline)}</span>
        )}
        {pendingCount > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 10,
            background: '#e0e7ff', color: '#3730a3', fontWeight: 600,
          }}>
            {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
          {reviews.length} avaliação{reviews.length !== 1 ? 'ões' : ''}
        </span>
      </div>

      {/* Conteúdo expandido */}
      {open && (
        <div style={{ padding: '10px 14px' }}>
          {reviews.map(rev => (
            <CardReview
              key={`${rev.id}-${rev.status}-${rev.whatsappGroup}`}
              review={rev}
              busy={busy === rev.id}
              onSend={onSend}
              onPublish={onPublish}
              onSaveDraft={onSaveDraft}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function PainelAvaliacoesConsultor({ tenantDbId: _t, userId: _u }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore]   = useState('all');

  // grupos Evolution API
  const [groups, setGroups]           = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError]   = useState(null);

  const pollerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await sbSelect('order=created_at.desc&limit=300');
      setReviews(rows.map(mapRow));
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchEvoGroups()
      .then(gs => { setGroups(gs); setGroupsError(null); })
      .catch(e => setGroupsError(e.message))
      .finally(() => setGroupsLoading(false));
  }, []);

  useEffect(() => {
    load();
    pollerRef.current = setInterval(load, 30_000);
    return () => clearInterval(pollerRef.current);
  }, [load]);

  // Mapa loja → grupo (derivado das reviews, para ConfigGrupos)
  const storeGroups = {};
  reviews.forEach(r => {
    if (r.store && r.whatsappGroup && !storeGroups[r.store]) {
      storeGroups[r.store] = r.whatsappGroup;
    }
  });

  // Lojas que têm avaliações (para ConfigGrupos)
  const storesWithReviews = [...new Set(reviews.map(r => r.store).filter(Boolean))].sort();

  async function handleSaveGroups(mapping) {
    const entries = Object.entries(mapping).filter(([, v]) => v);
    if (!entries.length) return;
    try {
      await Promise.all(entries.map(([store, groupId]) => sbUpdateStoreGroup(store, groupId)));
      flash('Grupos salvos ✓');
      await load();
    } catch (e) { setError('Erro ao salvar grupos: ' + e.message); }
  }

  async function handleSend(id, draft) {
    const rev = reviews.find(r => r.id === id);
    if (!rev) return;
    const groupId = rev.whatsappGroup || WA_GROUP_FALLBACK;
    setBusy(id); setError(null);
    try {
      const msg = buildWaMsg(rev, draft);
      await postEvo(groupId, msg);
      await sbUpdate({ id }, { status: 'sent_to_client', suggested_response: draft });
      flash('Prévia enviada ao grupo ✓');
      await load();
    } catch (e) { setError('Erro ao enviar: ' + e.message); }
    setBusy(null);
  }

  async function handlePublish(id, finalText) {
    setBusy(id); setError(null);
    try {
      await sbUpdate({ id }, { status: 'published', final_response: finalText, published_at: new Date().toISOString() });
      flash('Marcado como publicado ✓');
      await load();
    } catch (e) { setError('Erro: ' + e.message); }
    setBusy(null);
  }

  async function handleSaveDraft(id, draft) {
    setBusy(id); setError(null);
    try {
      await sbUpdate({ id }, { suggested_response: draft });
      flash('Rascunho salvo ✓');
      await load();
    } catch (e) { setError('Erro: ' + e.message); }
    setBusy(null);
  }

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  // Filtrar reviews
  const filtered = reviews.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterStore !== 'all' && r.store !== filterStore) return false;
    return true;
  });

  // Agrupar por loja e ordenar pelo prazo mais urgente
  const byStore = {};
  filtered.forEach(r => {
    if (!byStore[r.store]) byStore[r.store] = [];
    byStore[r.store].push(r);
  });

  const sortedStores = Object.keys(byStore).sort((a, b) => {
    const aMin = byStore[a].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    const bMin = byStore[b].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    if (!aMin && !bMin) return a.localeCompare(b, 'pt-BR');
    if (!aMin) return 1;
    if (!bMin) return -1;
    return aMin.localeCompare(bMin);
  });

  const kpi = {
    pending:  reviews.filter(r => r.status === 'pending').length,
    sent:     reviews.filter(r => r.status === 'sent_to_client').length,
    approved: reviews.filter(r => r.status === 'approved' || r.status === 'modified').length,
    done:     reviews.filter(r => r.status === 'published').length,
  };

  const semGrupo = storesWithReviews.filter(s => !storeGroups[s]).length;

  return (
    <div>
      <h1>Respostas de Avaliações <span className="cv2-mock">iFood · Consultor</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Gerencie sugestões de resposta, envie prévia ao cliente e marque como publicado.
        {error  && <span style={{ color: 'var(--red)'   }}> · {error}</span>}
        {notice && <span style={{ color: 'var(--green)' }}> · {notice}</span>}
      </div>

      {/* Alerta lojas sem grupo */}
      {semGrupo > 0 && (
        <div className="cv2-card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>
            ⚠ <strong>{semGrupo} loja{semGrupo > 1 ? 's' : ''}</strong> sem grupo WhatsApp configurado — configure abaixo antes de enviar.
          </span>
        </div>
      )}

      {/* Config de grupos */}
      <ConfigGrupos
        stores={storesWithReviews}
        storeGroups={storeGroups}
        groups={groups}
        groupsLoading={groupsLoading}
        groupsError={groupsError}
        onSave={handleSaveGroups}
      />

      {/* KPIs */}
      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Aguardando envio</div>
          <div className="v">{kpi.pending}</div>
          <div className={`d${kpi.pending > 0 ? ' neg' : ' mut'}`}>{kpi.pending > 0 ? 'pendentes' : 'ok'}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Com cliente</div>
          <div className="v">{kpi.sent}</div>
          <div className="d mut">aguardando aprovação</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Para publicar</div>
          <div className="v">{kpi.approved}</div>
          <div className={`d${kpi.approved > 0 ? ' neg' : ' mut'}`}>{kpi.approved > 0 ? 'prontas' : 'nenhuma'}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Publicadas</div>
          <div className="v">{kpi.done}</div>
          <div className="d mut">concluídas</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="cv2-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, display: 'block', marginBottom: 3 }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">Todos</option>
            <option value="pending">Aguardando envio</option>
            <option value="sent_to_client">Com cliente</option>
            <option value="approved">Aprovado</option>
            <option value="modified">Com alteração</option>
            <option value="published">Publicado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, display: 'block', marginBottom: 3 }}>Loja</label>
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">Todas as lojas</option>
            {KNOWN_STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={load} disabled={loading}>
          {loading ? 'Atualizando…' : '↺ Atualizar'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--tx2)' }}>Auto-atualiza a cada 30s</span>
      </div>

      {/* Lista agrupada por loja */}
      {loading && reviews.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando avaliações…</div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          {reviews.length === 0 ? 'Nenhuma avaliação cadastrada ainda.' : 'Nenhuma avaliação com esse filtro.'}
        </div>
      )}
      {sortedStores.map((store, idx) => (
        <StoreAccordion
          key={store}
          storeName={store}
          reviews={byStore[store]}
          defaultOpen={idx === 0}
          busy={busy}
          onSend={handleSend}
          onPublish={handlePublish}
          onSaveDraft={handleSaveDraft}
        />
      ))}
    </div>
  );
}
