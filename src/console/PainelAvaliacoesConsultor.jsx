import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { listLojasConsultoria, enviarWhatsAppAvaliacao, listEvoGroups, updateLojaWaGroup } from '../lib/api';

const CLIENT_PAGE = 'https://app.consultdelivery.com.br/aprovacao-avaliacao.html';

async function sbSelect() {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function sbUpdate(match, body) {
  let q = supabase.from('reviews').update(body);
  Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
  const { error } = await q;
  if (error) throw new Error(error.message);
}

async function sbUpdateNote(id, notes) {
  const { error } = await supabase.from('reviews').update({ notes }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Arquivada = enviada ao cliente, publicada ou prazo vencido ──────────────
function isArchivedFn(r, today) {
  return r.status === 'sent_to_client'
    || r.status === 'published'
    || (!!r.deadline && r.deadline < today);
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
    notes: r.notes || '',
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

function StatusPill({ count, label, bg, color, border }) {
  if (!count) return null;
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap',
    }}>
      {count} {label}{count > 1 ? 's' : ''}
    </span>
  );
}

function StatusTimeline({ review }) {
  const isSent      = ['sent_to_client', 'approved', 'modified', 'published'].includes(review.status);
  const isApproved  = ['approved', 'modified', 'published'].includes(review.status);
  const isPublished = review.status === 'published';
  const steps = [
    { label: 'Enviado ao cliente',   done: isSent,      ts: review.sentAt,      color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    { label: review.status === 'modified' ? 'Aprovado c/ alteração' : 'Aprovado pelo cliente',
                                     done: isApproved,  ts: review.approvedAt,  color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    { label: 'Publicado no iFood',   done: isPublished, ts: review.publishedAt, color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
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

function buildWaMsgStore(reviews) {
  // Mensagem de parabéns — envia o texto direto, sem template de avaliação
  if (reviews.length === 1 && reviews[0].orderId === 'PARABENS') {
    return reviews[0].suggestedResponse || '';
  }
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

function copiar(t) { try { navigator.clipboard?.writeText(t || ''); } catch {} }

// ─── Feature 4: análise local de avaliações publicadas ───────────────────────

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const OP_KEYWORDS  = ['frio','gelado','errado','faltou','faltando','demorou','demora','atraso','atrasado',
                       'diferente','ruim','pessimo','horrivel','mal','incompleto','estragado','vencido',
                       'embalagem','pouco','pequeno','molhado','quebrado','sem sal','salgado demais','queimado'];
const FID_KEYWORDS = ['otimo','excelente','adorei','amei','perfeito','voltarei','recomendo','maravilhoso',
                       'delicioso','parabens','nota 10','muito bom','adoramos','sempre peco','favorit',
                       'melhor','top','sensacional','incrivel','gostamos','amamos','amou'];

function hasKw(text, kws) { const t = normStr(text); return kws.some(k => t.includes(k)); }

function analisarReviews(storeName, publishedReviews) {
  if (!publishedReviews.length) return [];
  const demandas = [];
  const short = storeName.split(' - ')[0];

  const opRevs  = publishedReviews.filter(r => r.rating <= 3 || hasKw(r.clientComment, OP_KEYWORDS));
  const fidRevs = publishedReviews.filter(r => r.rating >= 4 && (r.rating === 5 || hasKw(r.clientComment, FID_KEYWORDS)));
  const avgRating = publishedReviews.reduce((s, r) => s + (r.rating || 0), 0) / publishedReviews.length;

  if (opRevs.length > 0) {
    const bullets = opRevs.slice(0, 5).map(r => {
      const comment = (r.clientComment || '').slice(0, 100);
      return `• ⭐${r.rating} (Ped. ${r.orderId}): "${comment}${(r.clientComment?.length || 0) > 100 ? '…' : ''}"`;
    }).join('\n');

    demandas.push({
      titulo: `[${short}] Melhorias operacionais — ${opRevs.length} reclamação${opRevs.length !== 1 ? 'ões' : ''} identificada${opRevs.length !== 1 ? 's' : ''}`,
      descricao: `Avaliações publicadas com pontos de melhoria:\n\n${bullets}\n\nAção: Apresentar para a equipe da loja, identificar causa raiz de cada ponto e criar plano de correção com prazo.`,
      prioridade: opRevs.some(r => r.rating <= 2) ? 'high' : 'med',
      tipo: 'operacional',
    });
  }

  if (fidRevs.length > 0) {
    const bullets = fidRevs.slice(0, 5).map(r => {
      const comment = (r.clientComment || '').slice(0, 80);
      const name = r.clientName || 'Cliente';
      return `• ⭐${r.rating} — ${name}: "${comment}${(r.clientComment?.length || 0) > 80 ? '…' : ''}"`;
    }).join('\n');

    demandas.push({
      titulo: `[${short}] Fidelização — ${fidRevs.length} cliente${fidRevs.length !== 1 ? 's' : ''} satisfeito${fidRevs.length !== 1 ? 's' : ''} a cultivar`,
      descricao: `Clientes com alta satisfação identificados nas avaliações publicadas:\n\n${bullets}\n\nAção sugerida: Criar ação de retorno (cupom, programa de pontos ou oferta exclusiva) para reconquistar estes clientes frequentes.`,
      prioridade: 'low',
      tipo: 'fidelizacao',
    });
  }

  if (demandas.length === 0) {
    demandas.push({
      titulo: `[${short}] Revisão das avaliações publicadas — ${publishedReviews.length} resp.`,
      descricao: `Média de ${avgRating.toFixed(1)} ⭐ em ${publishedReviews.length} avaliação${publishedReviews.length !== 1 ? 'ões' : ''} publicada${publishedReviews.length !== 1 ? 's' : ''}. Revisar com o cliente os principais temas desta rodada e oportunidades de melhoria.`,
      prioridade: avgRating < 3.5 ? 'med' : 'low',
      tipo: 'operacional',
    });
  }

  return demandas;
}

async function ensureAvaliacoesEspacos(tenantId, storeName) {
  const { data: lojas, error: eLojas } = await supabase
    .from('lojas')
    .select('id, client_id')
    .eq('tenant_id', tenantId)
    .eq('is_contato', false)
    .ilike('nome', storeName)
    .limit(1);
  if (eLojas) throw new Error('Erro ao buscar loja: ' + eLojas.message);
  if (!lojas?.length) throw new Error(`Loja não encontrada no Espaços para "${storeName}"`);
  const { client_id: clientId } = lojas[0];
  if (!clientId) throw new Error(`A loja "${storeName}" não tem cliente vinculado no Espaços`);

  const { data: folders } = await supabase
    .from('espacos_folders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', clientId)
    .order('position', { ascending: true })
    .limit(1);

  let folderId;
  if (folders?.length) {
    folderId = folders[0].id;
  } else {
    const { data: newFolder, error: eFolder } = await supabase
      .from('espacos_folders')
      .insert({ tenant_id: tenantId, customer_id: clientId, name: storeName.split(' - ')[0], color: '#B70C00', position: 99 })
      .select('id').single();
    if (eFolder) throw new Error('Erro ao criar pasta no Espaços: ' + eFolder.message);
    folderId = newFolder.id;
  }

  const LIST_NAME = 'Avaliações iFood';
  const { data: lists } = await supabase
    .from('espacos_lists')
    .select('id')
    .eq('folder_id', folderId)
    .eq('name', LIST_NAME)
    .limit(1);

  let listId;
  if (lists?.length) {
    listId = lists[0].id;
  } else {
    const { data: newList, error: eList } = await supabase
      .from('espacos_lists')
      .insert({ tenant_id: tenantId, folder_id: folderId, name: LIST_NAME, color: '#B70C00', position: 99 })
      .select('id').single();
    if (eList) throw new Error('Erro ao criar lista no Espaços: ' + eList.message);
    listId = newList.id;
    await supabase.from('espacos_columns').insert([
      { tenant_id: tenantId, list_id: listId, name: 'A Fazer',    color: '#6B7280', position: 0, is_done: false },
      { tenant_id: tenantId, list_id: listId, name: 'Fazendo',    color: '#3B82F6', position: 1, is_done: false },
      { tenant_id: tenantId, list_id: listId, name: 'Aguardando', color: '#F59E0B', position: 2, is_done: false },
      { tenant_id: tenantId, list_id: listId, name: 'Concluído',  color: '#10B981', position: 3, is_done: true  },
    ]);
  }

  const { data: columns } = await supabase
    .from('espacos_columns')
    .select('id')
    .eq('list_id', listId)
    .eq('is_done', false)
    .order('position', { ascending: true })
    .limit(1);

  const toDoColumnId = columns?.[0]?.id;
  if (!toDoColumnId) throw new Error('Coluna "A Fazer" não encontrada na lista');

  return { listId, toDoColumnId };
}

function AvisoGruposFaltando({ lojasSemGrupo }) {
  if (!lojasSemGrupo.length) return null;
  return (
    <div className="cv2-card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>
        ⚠ Sem grupo WhatsApp cadastrado: <strong>{lojasSemGrupo.join(', ')}</strong>.
        Cadastre em <code>lojas.whatsapp_group_jid</code> antes de enviar avaliações destas lojas.
      </span>
    </div>
  );
}

function AlertBanner({ overdueReviews, todayReviews, onGoToStore, onDismiss, onDismissId }) {
  if (overdueReviews.length === 0 && todayReviews.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      {overdueReviews.length > 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderLeft: '4px solid #ef4444',
          borderRadius: 8, padding: '10px 14px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>
              🔴 {overdueReviews.length} avaliação{overdueReviews.length !== 1 ? 'ões' : ''} com prazo vencido
            </span>
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {overdueReviews.map(r => (
              <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => onGoToStore(r.store)} style={{
                  background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px 0 0 6px',
                  padding: '3px 8px', fontSize: 11.5, cursor: 'pointer', color: '#7f1d1d', fontFamily: 'inherit',
                }}>
                  {r.store.split(' - ')[0]} · Pedido {r.orderId} · venceu {fmtDate(r.deadline)}
                </button>
                <button onClick={() => onDismissId && onDismissId(r.id)} style={{
                  background: '#fca5a5', border: '1px solid #fca5a5', borderRadius: '0 6px 6px 0',
                  borderLeft: 'none', padding: '3px 7px', fontSize: 12, cursor: 'pointer',
                  color: '#7f1d1d', fontFamily: 'inherit', lineHeight: 1,
                }} title="Arquivar este alerta">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
      {todayReviews.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b',
          borderRadius: 8, padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
              🟡 {todayReviews.length} avaliação{todayReviews.length !== 1 ? 'ões' : ''} vence{todayReviews.length === 1 ? '' : 'm'} hoje
            </span>
            {overdueReviews.length === 0 && (
              <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 18, lineHeight: 1 }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {todayReviews.map(r => (
              <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => onGoToStore(r.store)} style={{
                  background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px 0 0 6px',
                  padding: '3px 8px', fontSize: 11.5, cursor: 'pointer', color: '#78350f', fontFamily: 'inherit',
                }}>
                  {r.store.split(' - ')[0]} · Pedido {r.orderId} · vence hoje
                </button>
                <button onClick={() => onDismissId && onDismissId(r.id)} style={{
                  background: '#fcd34d', border: '1px solid #fcd34d', borderRadius: '0 6px 6px 0',
                  borderLeft: 'none', padding: '3px 7px', fontSize: 12, cursor: 'pointer',
                  color: '#78350f', fontFamily: 'inherit', lineHeight: 1,
                }} title="Arquivar este alerta">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DemandaModal({ storeName, demandas, onConfirm, onClose, loading }) {
  const PRIO_COLOR = { high: '#ef4444', med: '#f59e0b', low: '#22c55e' };
  const PRIO_LABEL = { high: 'Alta prioridade', med: 'Média prioridade', low: 'Baixa prioridade' };
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, maxWidth: 580, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>
          🤖 Demandas geradas — {storeName.split(' - ')[0]}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
          Essas tarefas serão criadas na lista <strong>Avaliações iFood</strong> do Espaços desta loja.
          Revise e confirme para criar.
        </p>

        {demandas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tx2)', fontSize: 13 }}>
            Nenhuma demanda identificada para esta loja.
          </div>
        ) : demandas.map((d, i) => (
          <div key={i} style={{
            border: '1px solid var(--line)', borderLeft: `4px solid ${PRIO_COLOR[d.prioridade] || '#888'}`,
            borderRadius: 8, padding: 12, marginBottom: 10,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--ink)' }}>{d.titulo}</div>
            <pre style={{
              fontSize: 12, color: 'var(--tx2)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
              margin: '0 0 8px', fontFamily: 'inherit',
            }}>{d.descricao}</pre>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                background: d.tipo === 'operacional' ? '#fee2e2' : '#dcfce7',
                color: d.tipo === 'operacional' ? '#991b1b' : '#15803d',
                border: `1px solid ${d.tipo === 'operacional' ? '#fca5a5' : '#86efac'}`,
              }}>
                {d.tipo === 'operacional' ? '🔧 Operacional' : '🎯 Fidelização'}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
              }}>
                {PRIO_LABEL[d.prioridade] || d.prioridade}
              </span>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <button className="cv2-btn sec" onClick={onClose} disabled={loading}>Cancelar</button>
          {demandas.length > 0 && (
            <button className="cv2-btn" onClick={onConfirm} disabled={loading}>
              {loading
                ? 'Criando tarefas…'
                : `Criar ${demandas.length} tarefa${demandas.length !== 1 ? 's' : ''} no Espaços`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CardReview({ review, resolvedGroup, busy, onPublish, onSaveDraft, onSendSingle, onSaveNote }) {
  const [draft, setDraft]           = useState(review.finalResponse || review.suggestedResponse || '');
  const [notes, setNotes]           = useState(review.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [copied, setCopied]         = useState(false);

  const st         = STATUS_CFG[review.status] || { label: review.status, cls: 'mut' };
  const isApproved = review.status === 'approved' || review.status === 'modified';
  const isDone     = review.status === 'published';
  const finalText  = review.finalResponse || review.suggestedResponse || draft;
  const over       = draft.length > 300;
  const notesChanged = notes !== (review.notes || '');

  const effectiveGroup = review.whatsappGroup || resolvedGroup || null;
  const singleLink = `${CLIENT_PAGE}?token=${review.token}`;

  function handleCopyLink() { copiar(singleLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  async function handleSaveNoteLocal() {
    await onSaveNote(review.id, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 3000);
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className={`cv2-bdg ${st.cls}`} style={{ fontSize: 11 }}>{st.label}</span>
        <Stars rating={review.rating} />
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{review.orderId === 'PARABENS' ? '🎉 Sem avaliações negativas' : `Pedido ${review.orderId}`}</span>
        {review.deadline && <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ {fmtDate(review.deadline)}</span>}
        {review.reviewDate && (
          <span style={{ fontSize: 11, color: 'var(--tx2)', marginLeft: 'auto' }}>📅 {fmtDate(review.reviewDate)}</span>
        )}
      </div>

      {review.status !== 'pending' && <StatusTimeline review={review} />}

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

      {review.orderId !== 'PARABENS' && (
        <div style={{
          fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 10,
          background: 'var(--bg2,#f5f4f2)', borderRadius: 6, padding: '8px 10px',
          borderLeft: '3px solid var(--line)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>COMENTÁRIO DO CLIENTE</span>
          "{review.clientComment}"
        </div>
      )}

      {isDone ? (
        <div style={{
          fontSize: 13, lineHeight: 1.6, background: 'var(--green-soft,#f0fdf4)',
          borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--green,#22c55e)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 2 }}>RESPOSTA PUBLICADA</span>
          {finalText}
        </div>
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
      ) : (
        <>
          <div style={{
            background: review.status === 'sent_to_client' ? '#fffbeb' : 'var(--bg2,#f5f4f2)',
            borderRadius: 6, padding: '10px 12px', marginBottom: 4,
            borderLeft: `3px solid ${review.status === 'sent_to_client' ? '#f59e0b' : 'var(--line)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{review.orderId === 'PARABENS' ? 'MENSAGEM PARA CLIENTE' : 'SUGESTÃO DE RESPOSTA'}</span>
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
                className="cv2-btn sec" style={{ fontSize: 11.5 }}
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

      <div style={{
        marginTop: 10, background: '#fefce8', border: '1px solid #fde68a',
        borderRadius: 6, padding: '8px 10px',
      }}>
        <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, display: 'block', marginBottom: 4 }}>
          📝 OBSERVAÇÕES INTERNAS
        </span>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); setNotesSaved(false); }}
          rows={2}
          placeholder="Registre o que aconteceu (ex: perdemos o prazo, cliente pediu alteração, aguardando retorno...)"
          style={{ ...inp, resize: 'vertical', background: 'transparent', borderColor: '#fde68a' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {notesChanged && (
            <button className="cv2-btn sec" style={{ fontSize: 11 }} disabled={busy} onClick={handleSaveNoteLocal}>
              Salvar observação
            </button>
          )}
          {notesSaved && !notesChanged && (
            <span style={{ fontSize: 11, color: '#16a34a' }}>✓ Observação salva</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StoreAccordion({ storeName, reviews, defaultOpen, busyId, busyStore, storeGroups, onSendStore, onPublish, onSaveDraft, onSendSingle, onSaveNote, onGerarDemandas, idPrefix = 'store' }) {
  const [open, setOpen] = useState(defaultOpen);

  const toSend         = reviews.filter(r => r.status === 'pending');
  const sentCount      = reviews.filter(r => r.status === 'sent_to_client').length;
  const approvedCount  = reviews.filter(r => r.status === 'approved' || r.status === 'modified').length;
  const publishedRevs  = reviews.filter(r => r.status === 'published');
  const publishedCount = publishedRevs.length;

  const resolvedGroup = storeGroups[storeName] || reviews.find(r => r.whatsappGroup)?.whatsappGroup || null;

  const today       = new Date().toISOString().slice(0, 10);
  const tomorrow    = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const minDeadline = reviews.reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
  const isOverdue   = minDeadline && minDeadline < today;
  const isUrgent    = !isOverdue && minDeadline && minDeadline <= tomorrow;
  const isBusy      = busyStore === storeName;

  return (
    <div id={`${idPrefix}-${storeName.replace(/[\s'&]/g, '-')}`} style={{
      border: `1px solid ${isOverdue ? '#fca5a5' : 'var(--line)'}`,
      borderRadius: 8, marginBottom: 10, background: '#fff', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
        background: open ? 'var(--bg2,#f5f4f2)' : '#fff',
        borderBottom: open ? '1px solid var(--line)' : 'none',
        flexWrap: 'wrap',
      }}>
        <div
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', userSelect: 'none', minWidth: 200, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 15, color: 'var(--tx2)', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{storeName}</span>
          {isOverdue && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
              🔴 venceu {fmtDate(minDeadline)}
            </span>
          )}
          {isUrgent && (
            <span className="cv2-bdg warn" style={{ fontSize: 11 }}>⏳ urgente {fmtDate(minDeadline)}</span>
          )}
          <StatusPill count={toSend.length}    label="aguardando"  bg="#fef3c7" color="#92400e" border="#fcd34d" />
          <StatusPill count={sentCount}         label="enviada"     bg="#dbeafe" color="#1e40af" border="#93c5fd" />
          <StatusPill count={approvedCount}     label="aprovada"    bg="#dcfce7" color="#15803d" border="#86efac" />
          <StatusPill count={publishedCount}    label="publicada"   bg="#f3f4f6" color="#4b5563" border="#d1d5db" />
          <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
            {reviews.length} avaliação{reviews.length !== 1 ? 'ões' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {toSend.length > 0 && (
            <button
              className="cv2-btn" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
              disabled={isBusy || !resolvedGroup}
              title={!resolvedGroup ? 'Configure o grupo WA desta loja em "Grupos WhatsApp por loja"' : ''}
              onClick={e => { e.stopPropagation(); onSendStore(storeName, toSend); }}
            >
              {isBusy ? '…' : (toSend.length === 1 && toSend[0].orderId === 'PARABENS')
                ? 'Enviar mensagem ao cliente 🎉'
                : `Enviar ${toSend.length} avaliação${toSend.length > 1 ? 'ões' : ''} ao cliente`}
            </button>
          )}
          {publishedCount > 0 && onGerarDemandas && (
            <button
              className="cv2-btn sec"
              style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
              onClick={e => { e.stopPropagation(); onGerarDemandas(storeName, publishedRevs); }}
            >
              🤖 Gerar demandas
            </button>
          )}
          {!resolvedGroup && toSend.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--red)', whiteSpace: 'nowrap' }}>⚠ sem grupo WA</span>
          )}
        </div>
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
              onSaveNote={onSaveNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigGrupos({ lojas, groups, groupsLoading, groupsError, onSave }) {
  const [open, setOpen]     = useState(false);
  const [local, setLocal]   = useState({});
  const [saving, setSaving] = useState(false);

  function handleToggle() {
    if (!open) {
      const init = {};
      lojas.forEach(l => { init[l.id] = l.whatsapp_group_jid || ''; });
      setLocal(init);
    }
    setOpen(v => !v);
  }

  function handleChange(lojaId, value) { setLocal(l => ({ ...l, [lojaId]: value })); }

  async function salvar() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={handleToggle}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>📲 Grupos WhatsApp por loja</span>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>
          {open ? '▾ Fechar' : '▸ Configurar grupos'}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {groupsLoading && (
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 8 }}>
              Carregando grupos da Evolution API…
            </div>
          )}
          {groupsError && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>
              Não foi possível carregar grupos automaticamente: {groupsError}.<br />
              <span style={{ color: 'var(--tx2)' }}>Insira o JID manualmente abaixo.</span>
            </div>
          )}
          {lojas.map(loja => (
            <div key={loja.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 200, color: 'var(--ink)' }}>
                {loja.nome}
              </span>
              {groups.length > 0 ? (
                <select
                  value={local[loja.id] || ''}
                  onChange={e => handleChange(loja.id, e.target.value)}
                  style={{ fontFamily: 'inherit', fontSize: 13, padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink)', flex: 1, minWidth: 200 }}
                >
                  <option value="">— sem grupo —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="JID do grupo (ex: 120363175577392322@g.us)"
                  value={local[loja.id] || ''}
                  onChange={e => handleChange(loja.id, e.target.value)}
                  style={{ fontFamily: 'inherit', fontSize: 13, padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink)', flex: 1, minWidth: 200 }}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="cv2-btn" disabled={saving || lojas.length === 0} onClick={salvar}>
              {saving ? 'Salvando…' : 'Salvar grupos'}
            </button>
            <button className="cv2-btn sec" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PainelAvaliacoesConsultor({ tenantDbId, userId: _u }) {
  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [notice, setNotice]         = useState(null);
  const [busyId, setBusyId]         = useState(null);
  const [busyStore, setBusyStore]   = useState(null);
  const [groups, setGroups]               = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore]   = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [demandaModal, setDemandaModal] = useState(null);
  const [demandaLoading, setDemandaLoading] = useState(false);

  const todayISO    = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const DISMISS_KEY = `cd_alert_dismissed_${todayISO}`;
  const [alertDismissed, setAlertDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const DISMISS_IDS_KEY = `cd_alert_dismissed_ids_${todayISO}`;
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => {
    try {
      const stored = localStorage.getItem(`cd_alert_dismissed_ids_${todayISO}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const [lojas, setLojas]           = useState([]);
  const [lojasLoading, setLojasLoading] = useState(true);
  const [lojasError, setLojasError]     = useState(null);

  const pollerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await sbSelect();
      setReviews(rows.map(mapRow));
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!tenantDbId) { setLojasLoading(false); return; }
    listLojasConsultoria(tenantDbId)
      .then(rows => { setLojas(rows); setLojasError(null); })
      .catch(e => setLojasError(e.message))
      .finally(() => setLojasLoading(false));
  }, [tenantDbId]);

  useEffect(() => {
    if (!tenantDbId) return;
    setGroupsLoading(true);
    listEvoGroups(tenantDbId)
      .then(data => { setGroups(data); setGroupsError(null); })
      .catch(e => setGroupsError(e.message))
      .finally(() => setGroupsLoading(false));
  }, [tenantDbId]);

  useEffect(() => {
    load();
    pollerRef.current = setInterval(load, 30_000);
    return () => clearInterval(pollerRef.current);
  }, [load]);

  const storeGroups = useMemo(() => {
    const sg = {};
    lojas.forEach(l => {
      if (l.whatsapp_group_jid) {
        sg[l.nome] = l.whatsapp_group_jid;
        // ifood_portal_nome é o nome que vem em reviews.store — indexar pelos dois
        if (l.ifood_portal_nome) sg[l.ifood_portal_nome] = l.whatsapp_group_jid;
      }
    });
    // reviews só preenchem fallback — loja tem prioridade
    reviews.forEach(r => { if (r.store && r.whatsappGroup && !sg[r.store]) sg[r.store] = r.whatsappGroup; });
    return sg;
  }, [lojas, reviews]);

  const activeReviews   = reviews.filter(r => !isArchivedFn(r, todayISO));
  const archivedReviews = reviews.filter(r =>  isArchivedFn(r, todayISO));

  const { overdueReviews, todayReviews } = useMemo(() => {
    const nonPub = reviews.filter(r => r.status !== 'published');
    return {
      overdueReviews: nonPub.filter(r => r.deadline && r.deadline < todayISO),
      todayReviews:   nonPub.filter(r => r.deadline === todayISO),
    };
  }, [reviews, todayISO]);

  function handleDismissAlert() {
    setAlertDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  function handleDismissAlertId(id) {
    setDismissedAlertIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(DISMISS_IDS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function handleGoToStore(storeName) {
    const hasActive   = activeReviews.some(r => r.store === storeName);
    const hasArchived = archivedReviews.some(r => r.store === storeName);
    if (hasArchived && !hasActive) setShowArchived(true);
    setFilterStore(storeName);
    setFilterStatus('all');
    const prefix = hasActive ? 'store' : 'archived';
    setTimeout(() => {
      const el = document.getElementById(`${prefix}-${storeName.replace(/[\s'&]/g, '-')}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  function handleGerarDemandas(storeName, publishedRevs) {
    const demandas = analisarReviews(storeName, publishedRevs);
    setDemandaModal({ storeName, demandas, publishedRevs });
  }

  async function handleConfirmarDemandas() {
    if (!demandaModal) return;
    if (!tenantDbId) {
      setError('ID do tenant não disponível — não foi possível criar as tarefas.');
      setDemandaModal(null);
      return;
    }
    setDemandaLoading(true);
    try {
      const { listId, toDoColumnId } = await ensureAvaliacoesEspacos(tenantDbId, demandaModal.storeName);
      const rows = demandaModal.demandas.map((d, i) => ({
        tenant_id:   tenantDbId,
        list_id:     listId,
        column_id:   toDoColumnId,
        title:       d.titulo,
        description: d.descricao,
        priority:    d.prioridade,
        position:    i,
      }));
      const { error: eInsert } = await supabase.from('client_tasks').insert(rows);
      if (eInsert) throw new Error(eInsert.message);
      flash(`${demandaModal.demandas.length} tarefa${demandaModal.demandas.length !== 1 ? 's' : ''} criada${demandaModal.demandas.length !== 1 ? 's' : ''} no Espaços ✓`);
      setDemandaModal(null);
    } catch (e) {
      setError('Erro ao criar tarefas no Espaços: ' + e.message);
    }
    setDemandaLoading(false);
  }

  async function handleSaveGroups(mapping) {
    try {
      await Promise.all(
        Object.entries(mapping).map(([lojaId, groupJid]) => updateLojaWaGroup(lojaId, groupJid))
      );
      if (tenantDbId) {
        const rows = await listLojasConsultoria(tenantDbId);
        setLojas(rows);
      }
      flash('Grupos salvos ✓');
    } catch (e) {
      setError('Erro ao salvar grupos: ' + e.message);
    }
  }

  async function handleSendStore(storeName, pendingReviews) {
    if (!pendingReviews.length) return;
    // Busca grupo: 1) lojas (por nome exato), 2) qualquer review já enviada desta loja
    const groupId = storeGroups[storeName]
      || reviews.find(r => r.store === storeName && r.whatsappGroup)?.whatsappGroup;
    if (!groupId) { setError(`Loja "${storeName}" sem grupo WhatsApp cadastrado.`); return; }
    setBusyStore(storeName); setError(null);
    try {
      const msg = buildWaMsgStore(pendingReviews);
      await enviarWhatsAppAvaliacao({ tenantId: tenantDbId, chatId: groupId, texto: msg });
      const now = new Date().toISOString();
      const isParabens = pendingReviews.length === 1 && pendingReviews[0].orderId === 'PARABENS';
      await Promise.all(pendingReviews.map(rev =>
        sbUpdate({ id: rev.id }, {
          status: isParabens ? 'published' : 'sent_to_client',
          sent_at: now,
          whatsapp_group: groupId,
          ...(isParabens ? { published_at: now } : {}),
        })
      ));
      flash(isParabens ? `Mensagem enviada para "${storeName}" ✓` : `Avaliações de "${storeName}" enviadas ao cliente ✓`);
      await load();
    } catch (e) { setError('Erro ao enviar: ' + e.message); }
    setBusyStore(null);
  }

  async function handleSendSingle(id, draft) {
    const rev = reviews.find(r => r.id === id);
    if (!rev) return;
    const groupId = storeGroups[rev.store]
      || reviews.find(r => r.store === rev.store && r.whatsappGroup)?.whatsappGroup;
    if (!groupId) { setError(`Loja "${rev.store}" sem grupo WhatsApp cadastrado.`); return; }
    setBusyId(id); setError(null);
    try {
      const msg = buildWaMsg(rev, draft);
      await enviarWhatsAppAvaliacao({ tenantId: tenantDbId, chatId: groupId, texto: msg });
      await sbUpdate({ id }, { status: 'sent_to_client', suggested_response: draft, sent_at: new Date().toISOString(), whatsapp_group: groupId });
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

  async function handleSaveNote(id, notes) {
    setBusyId(id);
    try {
      await sbUpdateNote(id, notes);
      setReviews(prev => prev.map(r => r.id === id ? { ...r, notes } : r));
    } catch (e) { setError('Erro ao salvar observação: ' + e.message); }
    setBusyId(null);
  }

  function flash(msg) { setNotice(msg); setTimeout(() => setNotice(null), 4000); }

  const filtered = activeReviews.filter(r => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'approved') {
        if (r.status !== 'approved' && r.status !== 'modified') return false;
      } else if (r.status !== filterStatus) return false;
    }
    if (filterStore !== 'all' && r.store !== filterStore) return false;
    return true;
  });

  const byStore = {};
  filtered.forEach(r => { if (!byStore[r.store]) byStore[r.store] = []; byStore[r.store].push(r); });

  const archivedByStore = {};
  archivedReviews.forEach(r => { if (!archivedByStore[r.store]) archivedByStore[r.store] = []; archivedByStore[r.store].push(r); });

  const sortedStores = Object.keys(byStore).sort((a, b) => {
    const aMin = byStore[a].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    const bMin = byStore[b].reduce((m, r) => r.deadline && (!m || r.deadline < m) ? r.deadline : m, null);
    if (!aMin && !bMin) return a.localeCompare(b, 'pt-BR');
    if (!aMin) return 1; if (!bMin) return -1;
    return aMin.localeCompare(bMin);
  });

  const sortedArchivedStores = Object.keys(archivedByStore).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const kpi = {
    pending:  activeReviews.filter(r => r.status === 'pending').length,
    sent:     reviews.filter(r => r.status === 'sent_to_client').length,
    approved: activeReviews.filter(r => r.status === 'approved' || r.status === 'modified').length,
  };

  const lojasSemGrupo = [...new Set(reviews.map(r => r.store).filter(Boolean))].filter(s => !storeGroups[s]);

  return (
    <div>
      <h1>Respostas de Avaliações <span className="cv2-mock">iFood · Consultor</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Gerencie sugestões de resposta, envie prévia ao cliente e marque como publicado.
        {error  && <span style={{ color: 'var(--red)'   }}> · {error}</span>}
        {notice && <span style={{ color: 'var(--green)' }}> · {notice}</span>}
      </div>

      {demandaModal && (
        <DemandaModal
          storeName={demandaModal.storeName}
          demandas={demandaModal.demandas}
          loading={demandaLoading}
          onConfirm={handleConfirmarDemandas}
          onClose={() => setDemandaModal(null)}
        />
      )}

      {!alertDismissed && (
        <AlertBanner
          overdueReviews={overdueReviews.filter(r => !dismissedAlertIds.has(r.id))}
          todayReviews={todayReviews.filter(r => !dismissedAlertIds.has(r.id))}
          onGoToStore={handleGoToStore}
          onDismiss={handleDismissAlert}
          onDismissId={handleDismissAlertId}
        />
      )}

      <AvisoGruposFaltando lojasSemGrupo={lojasSemGrupo} />
      <ConfigGrupos
        lojas={lojas}
        groups={groups}
        groupsLoading={groupsLoading}
        groupsError={groupsError}
        onSave={handleSaveGroups}
      />
      {lojasLoading && <div className="cv2-sub">Carregando lojas…</div>}
      {lojasError && <div className="cv2-sub" style={{ color: 'var(--red)' }}>Erro ao carregar lojas: {lojasError}</div>}

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
          <div className="l">Arquivadas</div>
          <div className="v">{archivedReviews.length}</div>
          <div className="d mut">enviadas, publicadas ou vencidas</div>
        </div>
      </div>

      <div className="cv2-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, display: 'block', marginBottom: 3 }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">Todos</option>
            <option value="pending">Aguardando envio</option>
            <option value="approved">Aprovado / Com alteração</option>
            <option value="published">Publicado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, display: 'block', marginBottom: 3 }}>Loja</label>
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
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
      {!loading && filtered.length === 0 && activeReviews.length === 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          {reviews.length === 0 ? 'Nenhuma avaliação cadastrada ainda.' : 'Nenhuma avaliação ativa — todas foram arquivadas.'}
        </div>
      )}
      {!loading && filtered.length === 0 && activeReviews.length > 0 && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma avaliação com esse filtro.</div>
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
          onSaveNote={handleSaveNote}
          onGerarDemandas={handleGerarDemandas}
        />
      ))}

      {archivedReviews.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '2px solid var(--line)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx2)' }}>
              📦 Arquivadas ({archivedReviews.length})
            </span>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>enviadas ao cliente, publicadas ou com prazo vencido</span>
            <button
              className="cv2-btn sec"
              style={{ fontSize: 12, marginLeft: 'auto' }}
              onClick={() => setShowArchived(v => !v)}
            >
              {showArchived ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {showArchived && sortedArchivedStores.map((store, idx) => (
            <StoreAccordion
              key={`archived-${store}`}
              storeName={store}
              reviews={archivedByStore[store]}
              defaultOpen={idx === 0}
              busyId={busyId}
              busyStore={busyStore}
              storeGroups={storeGroups}
              onSendStore={handleSendStore}
              onPublish={handlePublish}
              onSaveDraft={handleSaveDraft}
              onSendSingle={handleSendSingle}
              onSaveNote={handleSaveNote}
              onGerarDemandas={handleGerarDemandas}
              idPrefix="archived"
            />
          ))}
        </div>
      )}
    </div>
  );
}