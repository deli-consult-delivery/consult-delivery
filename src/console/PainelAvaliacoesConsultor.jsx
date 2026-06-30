import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ─── Supabase (direto, sem SDK) ──────────────────────────────────────────────
const SUPA_URL  = 'https://czyanilrverorwenikqw.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eWFuaWxydmVyb3J3ZW5pa3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTg5MzksImV4cCI6MjA5MjYzNDkzOX0.k_EIEgnM5a-4Ub52-w5VJw9WJBEPNQmmwgz8AEuyoAw';
const CLIENT_PAGE = 'https://app.consultdelivery.com.br/aprovacao-avaliacao.html';
const EVO_URL     = 'https://evo1-evolution-api.bawafu.easypanel.host';
const EVO_KEY     = '66A55B39-3167-4B15-8933-D65B26F56E6F';
const EVO_INST    = 'consult-delivery';
const WA_GROUP_FALLBACK = '120363175577392322@g.us';

// ─── LocalStorage — persiste o mapeamento loja→grupo independente do banco ───
const LS_KEY = 'cd_store_groups_v1';
function lsLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function lsSave(m) { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch {} }

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

function fmtDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function mapRow(r) {
  return {
    id: r.id, store: r.store, orderId: r.order_id, rating: r.rating,
    clientName: r.client_name, clientComment: r.client_comment,
    suggestedResponse: r.suggested_response, finalResponse: r.final_response,
    status: r.status, deadline: r.deadline,
    reviewDate: r.review_date || null,
    createdAt: r.created_at ? r.created_at.slice(0, 10) : null,
    token: r.token,
    sentAt: r.sent_at || null,
    approvedAt: r.approved_at,
    publishedAt: r.published_at,
    whatsappGroup: r.whatsapp_group || null,
  };
}

const STATUS_CFG = {
  pending:        { label: 'Aguardando envio',       cls: 'warn' },
  sent_to_client: { label: 'Enviado ao cliente',     cls: 'warn' },
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

// ─── Pílula de status resumida (usada no accordion) ──────────────────────────
function StatusPill({ count, label, bg, color, border }) {
  if (!count) return null;
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>
      {count} {label}{count > 1 ? 's' : ''}
    </span>
  );
}

// ─── Timeline de status (dentro do card) ─────────────────────────────────────
function StatusTimeline({ review }) {
  const isSent      = ['sent_to_client', 'approved', 'modified', 'published'].includes(review.status);
  const isApproved  = ['approved', 'modified', 'published'].includes(review.status);
  const isPublished = review.status === 'published';

  const steps = [
    {
      label: 'Enviado ao cliente',
      done: isSent,
      ts: review.sentAt,
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#93c5fd',
    },
    {
      label: review.status === 'modified' ? 'Aprovado c/ alteração' : 'Aprovado pelo cliente',
      done: isApproved,
      ts: review.approvedAt,
      color: '#16a34a',
      bg: '#f0fdf4',
      border: '#86efac',
    },
    {
      label: 'Publicado no iFood',
      done: isPublished,
      ts: review.publishedAt,
      color: '#7c3aed',
      bg: '#faf5ff',
      border: '#c4b5fd',
    },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, marginBottom: 10 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'stretch', gap: 4 }}>
          <div style={{
            flex: 1, padding: '6px 9px', borderRadius: 6,
            background: step.done ? step.bg : 'var(--bg2,#f5f4f2)',
            border: `1px solid ${step.done ? step.border : 'var(--line)'}`,
            opacity: step.done ? 1 : 0.45,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: step.done ? step.color : 'var(--tx2)', lineHeight: 1 }}>
                {step.done ? '✓' : '○'}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: step.done ? 'var(--ink)' : 'var(--tx2)', lineHeight: 1.3 }}>
                {step.label}
              </span>
            </div>
            <div style={{ fontSize: 10, color: step.done ? step.color : 'var(--tx2)', marginTop: 3, paddingLeft: 16 }}>
              {step.done && step.ts ? fmtDateTime(step.ts) : step.done ? '—' : 'Pendente'}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 1, background: 'var(--line)', flexShrink: 0, alignSelf: 'stretch', margin: '4px 0' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Mensagem única por loja ──────────────────────────────────────────────────
function buildWaMsgStore(reviews) {
  const storeName = reviews[0]?.store || '';
  const tokens = reviews.map(r => r.token).filter(Boolean).join(',');
  const link = `${CLIENT_PAGE}?tokens=${tokens}`;

  let msg = `📋 *Avaliações para aprovação — ${storeName}*\n\n`;
  reviews.forEach((rev, i) => {
    const stars = '⭐'.repeat(rev.rating || 0);
    msg += `*${i + 1}. ${stars} — Pedido ${rev.orderId}*\n`;
    if (rev.clientComment) msg += `_"${rev.clientComment}"_\n`;
    const resp = rev.suggestedResponse || rev.finalResponse || '';
    if (resp) msg += `💬 ${resp}\n`;
    msg += '\n';
  });
  msg += `🔗 *Link para aprovar ou editar todas:*\n${link}\n\n`;
  msg += `_(Sem retorno até as 9h do dia seguinte, publicamos as respostas no iFood.)_`;
  return msg;
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

// ─── Configuração de grupos por loja ─────────────────────────────────────────
function ConfigGrupos({ storeGroups, groups, groupsLoading, groupsError, onSave }) {
  const [open, setOpen]   = useState(false);
  const [local, setLocal] = useState({});
  const [saving, setSaving] = useState(false);

  function handleToggle() {
    if (!open) setLocal({ ...storeGroups });
    setOpen(v => !v);
  }

  function handleChange(store, value) {
    setLocal(l => ({ ...l, [store]: value }));
  }

  async function salvar() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
  }

  const configuredCount = KNOWN_STORES.filter(s => local[s]).length;
  const allConfigured   = configuredCount === KNOWN_STORES.length;

  return (
    <div className="cv2-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Grupos WhatsApp por loja</h3>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>
            {configuredCount} de {KNOWN_STORES.length} lojas configuradas.
            {' '}O mesmo grupo pode ser usado em múltiplas lojas.
          </div>
        </div>
        <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={handleToggle}>
          {open ? 'Fechar' : 'Configurar grupos'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {groupsLoading && <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Carregando grupos da Evolution API…</div>}
          {groupsError   && <div style={{ fontSize: 13, color: 'var(--red)' }}>Erro ao buscar grupos: {groupsError}</div>}
          {!groupsLoading && groups.length === 0 && !groupsError && (
            <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhum grupo encontrado na Evolution API.</div>
          )}

          {!groupsLoading && groups.length > 0 && (
            <>
              {KNOWN_STORES.map(store => (
                <div key={store} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '8px 0', borderBottom: '1px solid var(--line)',
                }}>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {store}
                  </span>
                  <select
                    value={local[store] || ''}
                    onChange={e => handleChange(store, e.target.value)}
                    style={{ ...inp, width: 'auto', minWidth: 260, fontSize: 12 }}
                  >
                    <option value="">— selecionar grupo —</option>
                    {groups.map((g, idx) => (
                      <option key={`${idx}-${g.id}`} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {local[store] && (
                    <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'monospace', minWidth: 80 }}>
                      {local[store]}
                    </span>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="cv2-btn" style={{ fontSize: 12 }} disabled={saving} onClick={salvar}>
                  {saving ? 'Salvando…' : `Salvar configuração (${configuredCount}/${KNOWN_STORES.length} lojas)`}
                </button>
                <span style={{ fontSize: 11, color: 'var(--tx2)' }}>Salva localmente e sincroniza com o banco.</span>
                {!allConfigured && (
                  <span style={{ fontSize: 11, color: 'var(--red)' }}>
                    ⚠ {KNOWN_STORES.length - configuredCount} loja{KNOWN_STORES.length - configuredCount > 1 ? 's' : ''} sem grupo.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card individual ──────────────────────────────────────────────────────────
function CardReview({ review, resolvedGroup, busy, onPublish, onSaveDraft, onSendSingle }) {
  const [draft, setDraft] = useState(review.finalResponse || review.suggestedResponse || '');
  const [copied, setCopied] = useState(false);

  const st = STATUS_CFG[review.status] || { label: review.status, cls: 'mut' };
  const isApproved = review.status === 'approved' || review.status === 'modified';
  const isDone     = review.status === 'published';
  const finalText  = review.finalResponse || review.suggestedResponse || draft;
  const over       = draft.length > 300;

  const effectiveGroup = review.whatsappGroup || resolvedGroup || null;
  const singleLink = `${CLIENT_PAGE}?token=${review.token}`;

  function handleCopyLink() {
    copiar(singleLink);
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

      {/* Timeline de status — aparece quando já passou do pending */}
      {review.status !== 'pending' && <StatusTimeline review={review} />}

      {/* Grupo WA */}
      {effectiveGroup ? (
        <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
          📲 Grupo: <span style={{ fontFamily: 'monospace' }}>{effectiveGroup}</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>
          ⚠ Grupo WA não configurado — configure acima antes de enviar.
        </div>
      )}

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

      {/* Resposta — estado publicado */}
      {isDone ? (
        <div style={{
          fontSize: 13, lineHeight: 1.6, background: 'var(--green-soft,#f0fdf4)',
          borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--green,#22c55e)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>RESPOSTA PUBLICADA</span>
          {finalText}
        </div>

      /* Resposta — estado aprovado (aguardando publicação) */
      ) : isApproved ? (
        <>
          <div style={{
            fontSize: 13, lineHeight: 1.6, background: 'var(--green-soft,#f0fdf4)',
            borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--green,#22c55e)', marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
              RESPOSTA APROVADA{review.status === 'modified' ? ' COM ALTERAÇÃO' : ''}
            </div>
            {finalText}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="cv2-btn" style={{ fontSize: 11.5 }} disabled={busy} onClick={() => onPublish(review.id, finalText)}>
              {busy ? '…' : 'Marcar como publicado'}
            </button>
            <button className="cv2-btn sec" style={{ fontSize: 11.5 }} onClick={() => copiar(finalText)}>Copiar resposta</button>
          </div>
        </>

      /* Resposta — estado pendente / enviado ao cliente */
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
            {review.status === 'sent_to_client' && (
              <button
                className="cv2-btn sec"
                style={{ fontSize: 11.5 }}
                disabled={busy || over || !draft.trim() || !effectiveGroup}
                onClick={() => onSendSingle(review.id, draft)}
              >
                {busy ? '…' : 'Reenviar esta individualmente'}
              </button>
            )}
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
function StoreAccordion({ storeName, reviews, defaultOpen, busyId, busyStore, storeGroups, onSendStore, onPublish, onSaveDraft, onSendSingle }) {
  const [open, setOpen] = useState(defaultOpen);

  // Apenas pendentes (não enviadas) vão para o botão de envio em lote
  const toSend        = reviews.filter(r => r.status === 'pending');
  const sentCount     = reviews.filter(r => r.status === 'sent_to_client').length;
  const approvedCount = reviews.filter(r => r.status === 'approved' || r.status === 'modified').length;
  const publishedCount = reviews.filter(r => r.status === 'published').length;

  const resolvedGroup = reviews.find(r => r.whatsappGroup)?.whatsappGroup || storeGroups[storeName] || null;

  const tomorrow    = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const minDeadline = reviews.reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
  const isUrgent    = minDeadline && minDeadline <= tomorrow;
  const isBusy      = busyStore === storeName;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 8, marginBottom: 10,
      background: '#fff', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
        background: open ? 'var(--bg2,#f5f4f2)' : '#fff',
        borderBottom: open ? '1px solid var(--line)' : 'none',
        flexWrap: 'wrap',
      }}>
        {/* Área clicável (toggle) */}
        <div
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', userSelect: 'none', minWidth: 200, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 15, color: 'var(--tx2)', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{storeName}</span>
          {isUrgent && <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ urgente {fmtDate(minDeadline)}</span>}

          {/* Pílulas de status — visíveis sem abrir o accordion */}
          <StatusPill count={toSend.length}    label="aguardando"  bg="#fef3c7" color="#92400e" border="#fcd34d" />
          <StatusPill count={sentCount}         label="enviada"     bg="#dbeafe" color="#1e40af" border="#93c5fd" />
          <StatusPill count={approvedCount}     label="aprovada"    bg="#dcfce7" color="#15803d" border="#86efac" />
          <StatusPill count={publishedCount}    label="publicada"   bg="#f3f4f6" color="#4b5563" border="#d1d5db" />

          <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
            {reviews.length} avaliação{reviews.length !== 1 ? 'ões' : ''}
          </span>
        </div>

        {/* Botão de envio — apenas para reviews ainda não enviadas */}
        {toSend.length > 0 && (
          <button
            className="cv2-btn"
            style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={isBusy || !resolvedGroup}
            title={!resolvedGroup ? 'Configure o grupo WA desta loja em "Grupos WhatsApp por loja"' : ''}
            onClick={e => { e.stopPropagation(); onSendStore(storeName, toSend); }}
          >
            {isBusy ? '…' : `Enviar ${toSend.length} avaliação${toSend.length > 1 ? 'ões' : ''} ao cliente`}
          </button>
        )}
        {!resolvedGroup && toSend.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--red)', whiteSpace: 'nowrap' }}>⚠ sem grupo WA</span>
        )}
      </div>

      {open && (
        <div style={{ padding: '10px 14px' }}>
          {reviews.map(rev => (
            <CardReview
              key={`${rev.id}-${rev.status}-${rev.whatsappGroup}`}
              review={rev}
              resolvedGroup={resolvedGroup}
              busy={busyId === rev.id}
              onPublish={onPublish}
              onSaveDraft={onSaveDraft}
              onSendSingle={onSendSingle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function PainelAvaliacoesConsultor({ tenantDbId: _t, userId: _u }) {
  const [reviews, setReviews]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [notice, setNotice]       = useState(null);
  const [busyId, setBusyId]       = useState(null);
  const [busyStore, setBusyStore] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore]   = useState('all');

  const [groups, setGroups]               = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError]     = useState(null);

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

  const storeGroups = useMemo(() => {
    const sg = { ...lsLoad() };
    reviews.forEach(r => { if (r.store && r.whatsappGroup) sg[r.store] = r.whatsappGroup; });
    return sg;
  }, [reviews]);

  async function handleSaveGroups(mapping) {
    lsSave(mapping);
    const entries = Object.entries(mapping).filter(([, v]) => v);
    if (entries.length) {
      try {
        await Promise.all(entries.map(([store, groupId]) => sbUpdateStoreGroup(store, groupId)));
      } catch (e) {
        setError('Aviso: grupos salvos localmente, mas houve erro ao sincronizar com o banco: ' + e.message);
      }
    }
    flash('Grupos salvos ✓');
    await load();
  }

  async function handleSendStore(storeName, pendingReviews) {
    if (!pendingReviews.length) return;
    const groupId = pendingReviews.find(r => r.whatsappGroup)?.whatsappGroup
      || storeGroups[storeName]
      || WA_GROUP_FALLBACK;
    setBusyStore(storeName); setError(null);
    try {
      const msg = buildWaMsgStore(pendingReviews);
      await postEvo(groupId, msg);
      const now = new Date().toISOString();
      await Promise.all(pendingReviews.map(rev =>
        sbUpdate({ id: rev.id }, { status: 'sent_to_client', sent_at: now })
      ));
      flash(`Avaliações de "${storeName}" enviadas ao cliente ✓`);
      await load();
    } catch (e) { setError('Erro ao enviar: ' + e.message); }
    setBusyStore(null);
  }

  async function handleSendSingle(id, draft) {
    const rev = reviews.find(r => r.id === id);
    if (!rev) return;
    const groupId = rev.whatsappGroup || storeGroups[rev.store] || WA_GROUP_FALLBACK;
    setBusyId(id); setError(null);
    try {
      const msg = buildWaMsg(rev, draft);
      await postEvo(groupId, msg);
      await sbUpdate({ id }, { status: 'sent_to_client', suggested_response: draft, sent_at: new Date().toISOString() });
      flash('Reenvio individual feito ✓');
      await load();
    } catch (e) { setError('Erro ao reenviar: ' + e.message); }
    setBusyId(null);
  }

  async function handlePublish(id, finalText) {
    setBusyId(id); setError(null);
    try {
      await sbUpdate({ id }, { status: 'published', final_response: finalText, published_at: new Date().toISOString() });
      flash('Marcado como publicado ✓');
      await load();
    } catch (e) { setError('Erro: ' + e.message); }
    setBusyId(null);
  }

  async function handleSaveDraft(id, draft) {
    setBusyId(id); setError(null);
    try {
      await sbUpdate({ id }, { suggested_response: draft });
      flash('Rascunho salvo ✓');
      await load();
    } catch (e) { setError('Erro: ' + e.message); }
    setBusyId(null);
  }

  function flash(msg) { setNotice(msg); setTimeout(() => setNotice(null), 4000); }

  const filtered = reviews.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterStore  !== 'all' && r.store  !== filterStore)  return false;
    return true;
  });

  const byStore = {};
  filtered.forEach(r => { if (!byStore[r.store]) byStore[r.store] = []; byStore[r.store].push(r); });

  const sortedStores = Object.keys(byStore).sort((a, b) => {
    const aMin = byStore[a].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    const bMin = byStore[b].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    if (!aMin && !bMin) return a.localeCompare(b, 'pt-BR');
    if (!aMin) return 1; if (!bMin) return -1;
    return aMin.localeCompare(bMin);
  });

  const kpi = {
    pending:  reviews.filter(r => r.status === 'pending').length,
    sent:     reviews.filter(r => r.status === 'sent_to_client').length,
    approved: reviews.filter(r => r.status === 'approved' || r.status === 'modified').length,
    done:     reviews.filter(r => r.status === 'published').length,
  };

  const semGrupo = [...new Set(reviews.map(r => r.store).filter(Boolean))].filter(s => !storeGroups[s]).length;

  return (
    <div>
      <h1>Respostas de Avaliações <span className="cv2-mock">iFood · Consultor</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Gerencie sugestões de resposta, envie prévia ao cliente e marque como publicado.
        {error  && <span style={{ color: 'var(--red)'   }}> · {error}</span>}
        {notice && <span style={{ color: 'var(--green)' }}> · {notice}</span>}
      </div>

      {semGrupo > 0 && (
        <div className="cv2-card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>
            ⚠ <strong>{semGrupo} loja{semGrupo > 1 ? 's' : ''}</strong> sem grupo WhatsApp configurado — configure abaixo antes de enviar.
          </span>
        </div>
      )}

      <ConfigGrupos
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
          <div className="l">Enviado ao cliente</div>
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
            <option value="sent_to_client">Enviado ao cliente</option>
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
          busyId={busyId}
          busyStore={busyStore}
          storeGroups={storeGroups}
          onSendStore={handleSendStore}
          onPublish={handlePublish}
          onSaveDraft={handleSaveDraft}
          onSendSingle={handleSendSingle}
        />
      ))}
    </div>
  );
}
