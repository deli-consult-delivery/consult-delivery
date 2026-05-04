import { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import RequireRole from '../components/auth/RequireRole.jsx';
import {
  listAgentDrafts,
  approveDraft,
  rejectDraft,
  updateDraftContent,
  subscribeToDrafts,
} from '../lib/api.js';

const CHANNEL_LABELS = {
  whatsapp_grupo:   { label: 'WhatsApp Grupo',  color: '#25D366' },
  whatsapp_pv:      { label: 'WhatsApp PV',      color: '#128C7E' },
  telegram_interno: { label: 'Telegram Interno', color: '#2AABEE' },
  painel:           { label: 'Painel',            color: '#B70C00' },
};

function fmtRelTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}

function fmtExpira(iso) {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'expirado';
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return '< 1h';
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function DraftCard({ draft, onApprove, onReject, onEdit }) {
  const ch = CHANNEL_LABELS[draft.channel] ?? { label: draft.channel, color: 'var(--g-500)' };
  const isExpiring = draft.expires_at && (new Date(draft.expires_at).getTime() - Date.now()) < 3600000;

  return (
    <div
      className="card slide-up"
      style={{ padding: 20, borderLeft: `3px solid ${ch.color}`, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AgentAvatar id={draft.agent_name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>
              {draft.agent_name?.toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: ch.color + '22', color: ch.color,
            }}>
              {ch.label}
            </span>
            {draft.loja?.nome && (
              <span style={{ fontSize: 11, color: 'var(--g-500)' }}>📍 {draft.loja.nome}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>
            Para: <code style={{ fontSize: 11 }}>{draft.target_id}</code>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{fmtRelTime(draft.created_at)}</div>
          <div style={{
            fontSize: 11, fontWeight: 600, marginTop: 2,
            color: isExpiring ? 'var(--warn)' : 'var(--g-500)',
          }}>
            Expira: {fmtExpira(draft.expires_at)}
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 8,
        padding: '12px 14px', fontSize: 13, color: 'var(--g-900)',
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {draft.content}
      </div>

      {draft.reasoning && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="sparkles" size={12} style={{ color: 'var(--g-400)', marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--g-600)', lineHeight: 1.5, margin: 0 }}>
            <strong>Por que:</strong> {draft.reasoning}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--g-100)', paddingTop: 12 }}>
        <button
          className="btn-ghost"
          style={{ fontSize: 12, padding: '6px 12px', flex: 1, justifyContent: 'center' }}
          onClick={() => onEdit(draft)}
        >
          ✏️ Editar
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, padding: '6px 14px', color: 'var(--red)', borderColor: 'var(--red)' }}
          onClick={() => onReject(draft)}
        >
          ❌ Rejeitar
        </button>
        <button
          className="btn-primary"
          style={{ fontSize: 12, padding: '6px 16px' }}
          onClick={() => onApprove(draft)}
        >
          ✅ Aprovar e enviar
        </button>
      </div>
    </div>
  );
}

function EditModal({ draft, onSave, onClose }) {
  const [content, setContent] = useState(draft.content);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const edited = content !== draft.content ? 'Conteúdo editado antes de aprovar' : null;
      await updateDraftContent(draft.id, content, edited);
      await approveDraft(draft.id);
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card slide-up"
        style={{ width: 560, maxWidth: '95vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Editar mensagem</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>
              {draft.agent_name?.toUpperCase()} → {draft.target_id}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={8}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
            borderRadius: 8, border: '1px solid var(--g-300)', resize: 'vertical',
            background: 'var(--white)', color: 'var(--g-900)', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : '✅ Salvar e aprovar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ draft, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await rejectDraft(draft.id, reason.trim());
      onConfirm();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card slide-up"
        style={{ width: 460, maxWidth: '95vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Rejeitar draft</div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--g-600)', margin: 0 }}>
          Informe o motivo da rejeição. O agente usará esse feedback para melhorar futuras propostas.
        </p>

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Ex: tom muito formal, não condiz com o contexto atual da loja…"
          style={{
            width: '100%', padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
            borderRadius: 8, border: '1px solid var(--g-300)', resize: 'vertical',
            background: 'var(--white)', color: 'var(--g-900)', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            style={{ background: 'var(--red)', opacity: !reason.trim() ? 0.5 : 1 }}
            onClick={handleConfirm}
            disabled={!reason.trim() || saving}
          >
            {saving ? 'Rejeitando…' : '❌ Confirmar rejeição'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftsPendentesContent({ tenantId, userId }) {
  const [drafts, setDrafts]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [filterAgent, setFilterAgent]       = useState('');
  const [filterChannel, setFilterChannel]   = useState('');
  const [editingDraft, setEditingDraft]     = useState(null);
  const [rejectingDraft, setRejectingDraft] = useState(null);
  const [toast, setToast]                   = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadDrafts = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await listAgentDrafts(tenantId);
      setDrafts(data);
    } catch (err) {
      console.error('[DraftsPendentes]', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = subscribeToDrafts(tenantId, () => loadDrafts());
    return unsub;
  }, [tenantId, loadDrafts]);

  async function handleApprove(draft) {
    try {
      await approveDraft(draft.id);
      showToast('Draft aprovado e enviado!');
      loadDrafts();
    } catch {
      showToast('Erro ao aprovar. Tente novamente.', 'error');
    }
  }

  const agentNames  = [...new Set(drafts.map(d => d.agent_name).filter(Boolean))];
  const channelKeys = [...new Set(drafts.map(d => d.channel).filter(Boolean))];

  const filtered = drafts.filter(d => {
    if (filterAgent   && d.agent_name !== filterAgent)   return false;
    if (filterChannel && d.channel    !== filterChannel) return false;
    return true;
  });

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 880, margin: '0 auto', position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 400,
          padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          background: toast.type === 'error' ? 'var(--red)' : 'var(--success)',
          color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }} className="slide-up">
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 className="page-h1">Drafts Pendentes</h1>
          <p className="page-sub">Mensagens propostas pelos agentes aguardando sua aprovação antes do envio.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filtered.length > 0 && (
            <span style={{
              background: 'var(--red)', color: 'white',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
            }}>
              {filtered.length} pendente{filtered.length > 1 ? 's' : ''}
            </span>
          )}
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={loadDrafts}>
            <Icon name="refresh" size={13} /> Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: 8, border: '1px solid var(--g-300)',
            background: 'var(--white)', color: 'var(--g-900)', fontSize: 13,
          }}
        >
          <option value="">Todos os agentes</option>
          {agentNames.map(n => <option key={n} value={n}>{n.toUpperCase()}</option>)}
        </select>

        <select
          value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: 8, border: '1px solid var(--g-300)',
            background: 'var(--white)', color: 'var(--g-900)', fontSize: 13,
          }}
        >
          <option value="">Todos os canais</option>
          {channelKeys.map(k => (
            <option key={k} value={k}>{CHANNEL_LABELS[k]?.label ?? k}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-500)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--red)" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
          </svg>
          <div style={{ marginTop: 12, fontSize: 13 }}>Carregando drafts…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-900)' }}>Nenhum draft pendente</div>
          <div style={{ fontSize: 13, color: 'var(--g-500)', marginTop: 6 }}>
            {filterAgent || filterChannel
              ? 'Tente remover os filtros para ver outros drafts.'
              : 'Todos os agentes estão sem propostas aguardando aprovação.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map(d => (
            <DraftCard
              key={d.id}
              draft={d}
              onApprove={handleApprove}
              onReject={setRejectingDraft}
              onEdit={setEditingDraft}
            />
          ))}
        </div>
      )}

      {editingDraft && (
        <EditModal
          draft={editingDraft}
          onSave={() => { setEditingDraft(null); showToast('Editado e aprovado!'); loadDrafts(); }}
          onClose={() => setEditingDraft(null)}
        />
      )}

      {rejectingDraft && (
        <RejectModal
          draft={rejectingDraft}
          onConfirm={() => { setRejectingDraft(null); showToast('Draft rejeitado.'); loadDrafts(); }}
          onClose={() => setRejectingDraft(null)}
        />
      )}
    </div>
  );
}

export default function DraftsPendentesScreen({ tenantId, userId }) {
  return (
    <RequireRole resource="approve_drafts" action="execute" userId={userId}>
      <DraftsPendentesContent tenantId={tenantId} userId={userId} />
    </RequireRole>
  );
}