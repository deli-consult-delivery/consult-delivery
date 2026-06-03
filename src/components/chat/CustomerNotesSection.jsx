import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import LeadNotesSection from './LeadNotesSection.jsx';

function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const SOURCE_META = {
  breno:        { label: 'Breno',    bg: 'rgba(249,115,22,0.2)',  color: '#fdba74' },
  conversation: { label: 'Conversa', bg: 'rgba(59,130,246,0.2)',  color: '#93c5fd' },
};

export default function CustomerNotesSection({
  customerId, customerName, conversationId, tenantId,
  conversationMsgs = [], currentUserId,
}) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => { loadEntries(); }, [customerId, conversationId, tenantId]);

  async function loadEntries() {
    if (!customerId && !conversationId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from('customer_note_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (customerId) {
      q = q.eq('customer_id', customerId);
    } else {
      q = q.eq('conversation_id', conversationId);
    }
    const { data } = await q;
    setEntries(data ?? []);
    setLoading(false);
  }

  function copyContext() {
    const text = conversationMsgs.slice(-5)
      .map(m => `${m.sender_kind === 'inbound' ? 'Cliente' : 'Equipe'}: ${m.body ?? ''}`)
      .join('\n');
    setDraft(text);
  }

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    await supabase.from('customer_note_entries').insert({
      tenant_id:       tenantId,
      customer_id:     customerId || null,
      conversation_id: conversationId || null,
      content:         draft.trim(),
      source:          'manual',
      created_by:      currentUserId || null,
    });
    setSaving(false);
    setDraft('');
    setShowForm(false);
    loadEntries();
  }

  async function handleDelete(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
    await supabase.from('customer_note_entries').delete().eq('id', id);
  }

  async function handleCreateTask(entry) {
    const { data: taskRow } = await supabase.from('chat_tasks').insert({
      tenant_id:    tenantId,
      title:        entry.content.slice(0, 60).trim(),
      contact_name: customerName || null,
      created_by:   currentUserId || null,
    }).select('id').single();
    if (!taskRow?.id) return;
    await supabase.from('customer_note_entries')
      .update({ chat_task_id: taskRow.id })
      .eq('id', entry.id);
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, chat_task_id: taskRow.id } : e));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {customerId && (
        <div style={{ marginBottom: 8 }}>
          <LeadNotesSection customerId={customerId} tenantId={tenantId} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Registros{entries.length > 0 ? ` (${entries.length})` : ''}
        </span>
        <button
          onClick={() => { setShowForm(v => !v); setDraft(''); }}
          style={{
            background: showForm ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)',
            border: 'none', borderRadius: 5,
            color: showForm ? '#93c5fd' : 'rgba(255,255,255,0.55)',
            fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontWeight: 600,
          }}
        >+ Novo</button>
      </div>

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Escreva uma nota sobre este cliente…"
            rows={3}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, color: 'rgba(255,255,255,0.9)', fontSize: 12,
              padding: '7px 10px', resize: 'vertical', width: '100%',
              boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={copyContext}
              disabled={conversationMsgs.length === 0}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
                color: 'rgba(255,255,255,0.45)', fontSize: 11, padding: '4px 0', cursor: 'pointer',
              }}
            >Copiar contexto</button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              style={{
                flex: 1,
                background: saving || !draft.trim() ? 'rgba(59,130,246,0.3)' : '#3b82f6',
                border: 'none', borderRadius: 5, color: 'white',
                fontSize: 11, fontWeight: 600, padding: '4px 0',
                cursor: saving || !draft.trim() ? 'default' : 'pointer',
              }}
            >{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '8px 0' }}>
          Carregando…
        </div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', textAlign: 'center', padding: '8px 0' }}>
          Nenhum registro ainda
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {entries.map(e => (
            <EntryCard key={e.id} entry={e} onDelete={handleDelete} onCreateTask={handleCreateTask} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, onDelete, onCreateTask }) {
  const [expanded, setExpanded] = useState(false);
  const sm      = SOURCE_META[entry.source];
  const tooLong = entry.content.length > 100;
  const preview = tooLong && !expanded ? entry.content.slice(0, 100) + '…' : entry.content;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '8px 10px',
      borderLeft: sm ? `2px solid ${sm.color}` : '2px solid rgba(255,255,255,0.1)',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <span
          onClick={() => tooLong && setExpanded(v => !v)}
          style={{
            flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 1.45,
            cursor: tooLong ? 'pointer' : 'default', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >{preview}</span>
        <button
          onClick={() => onDelete(entry.id)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
            fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0,
          }}
        >×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {sm && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
            background: sm.bg, color: sm.color,
          }}>{sm.label}</span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>{relTime(entry.created_at)}</span>
        <button
          onClick={() => !entry.chat_task_id && onCreateTask(entry)}
          disabled={!!entry.chat_task_id}
          style={{
            marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 5,
            background: entry.chat_task_id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${entry.chat_task_id ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: entry.chat_task_id ? '#6ee7b7' : 'rgba(255,255,255,0.45)',
            cursor: entry.chat_task_id ? 'default' : 'pointer',
          }}
          title={entry.chat_task_id ? 'Tarefa já criada' : 'Criar tarefa a partir desta nota'}
        >{entry.chat_task_id ? '✓ Tarefa criada' : '→ Criar tarefa'}</button>
      </div>
    </div>
  );
}
