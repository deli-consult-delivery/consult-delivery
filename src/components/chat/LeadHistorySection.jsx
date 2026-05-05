import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function fmtTs(ts) {
  const d = new Date(ts);
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}. ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const EVENT_LABELS = {
  created:              'Conversa iniciada',
  closed:               evt => `${evt.actor_name ?? 'Sistema'} finalizou`,
  reopened:             evt => `${evt.actor_name ?? 'Sistema'} reabriu`,
  assigned:             evt => `${evt.actor_name ?? 'Sistema'} assumiu`,
  unassigned:           evt => `${evt.actor_name ?? 'Sistema'} desatribuiu`,
  transferred:          evt => {
    const { dept_from, dept_to } = evt.metadata ?? {};
    if (dept_from && dept_to) return `Transferido de ${dept_from} → ${dept_to}`;
    if (dept_to) return `Movido para ${dept_to}`;
    return 'Transferência de departamento';
  },
  tagged:               evt => `Tag: ${evt.metadata?.tag_name ?? ''}`,
  untagged:             evt => `Tag removida: ${evt.metadata?.tag_name ?? ''}`,
  note_added:           evt => `${evt.actor_name ?? 'Sistema'} adicionou nota`,
  automation_executed:  evt => `Automação: ${evt.metadata?.automation_name ?? ''}`,
};

function eventLabel(evt) {
  const fn = EVENT_LABELS[evt.event_type];
  if (!fn) return evt.event_type;
  return typeof fn === 'function' ? fn(evt) : fn;
}

const EVENT_COLORS = {
  closed: 'var(--g-400)',
  reopened: '#10B981',
  transferred: '#3B82F6',
  tagged: '#8B5CF6',
  assigned: '#F59E0B',
};

const FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'transferred', label: 'Transferências' },
  { value: 'closed', label: 'Finalizadas' },
  { value: 'reopened', label: 'Reabertas' },
  { value: 'tagged', label: 'Tags' },
];

export default function LeadHistorySection({ customerId, tenantId }) {
  const [events, setEvents]   = useState([]);
  const [filter, setFilter]   = useState('');
  const [loaded, setLoaded]   = useState(false);
  const [adding, setAdding]   = useState(false);
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    // Fetch conversation_events for all conversations of this customer
    supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .then(async ({ data: convs }) => {
        if (cancelled || !convs?.length) { setLoaded(true); return; }
        const ids = convs.map(c => c.id);
        const { data } = await supabase
          .from('conversation_events')
          .select('id, conversation_id, event_type, actor_name, metadata, ts')
          .in('conversation_id', ids)
          .order('ts', { ascending: false })
          .limit(100);
        if (!cancelled) {
          setEvents(data ?? []);
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [customerId]);

  async function addManualNote() {
    if (!note.trim() || !customerId) return;
    setSaving(true);

    // Get first conversation for this customer to attach the note
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, tenant_id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (conv) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: evt } = await supabase
        .from('conversation_events')
        .insert({
          tenant_id: conv.tenant_id,
          conversation_id: conv.id,
          event_type: 'note_added',
          actor_type: 'user',
          actor_name: user?.user_metadata?.full_name ?? user?.email ?? 'Usuário',
          metadata: { note: note.trim() },
        })
        .select('id, conversation_id, event_type, actor_name, metadata, ts')
        .single();

      if (evt) setEvents(prev => [evt, ...prev]);
    }

    setNote('');
    setAdding(false);
    setSaving(false);
  }

  const filtered = filter ? events.filter(e => e.event_type === filter) : events;

  if (!loaded) return null;

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="section-h2" style={{ margin: 0 }}>Histórico</span>
        <button
          onClick={() => setAdding(v => !v)}
          style={{ fontSize: 11, color: 'var(--g-500)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          + Adicionar
        </button>
      </div>

      {/* Filtro por tipo */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => setFilter(o.value)}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 99,
              border: '1px solid var(--g-200)',
              background: filter === o.value ? 'var(--g-800)' : 'var(--g-50)',
              color: filter === o.value ? 'var(--white)' : 'var(--g-600)',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Adicionar nota manual */}
      {adding && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
          <input
            className="input"
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManualNote()}
            placeholder="Anotação rápida…"
            style={{ fontSize: 12, padding: '5px 8px', flex: 1 }}
          />
          <button
            onClick={addManualNote}
            disabled={saving || !note.trim()}
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px' }}
          >
            {saving ? '…' : 'Ok'}
          </button>
        </div>
      )}

      {/* Lista de eventos */}
      {filtered.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--g-400)', textAlign: 'center', padding: '12px 0' }}>
          {filter ? 'Nenhum evento deste tipo' : 'Sem histórico ainda'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filtered.map(evt => (
          <div key={evt.id} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--g-100)' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
              background: EVENT_COLORS[evt.event_type] ?? 'var(--g-300)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--g-700)', wordBreak: 'break-word' }}>
                {eventLabel(evt)}
                {evt.metadata?.note && (
                  <span style={{ color: 'var(--g-500)' }}> — {evt.metadata.note}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--g-400)', marginTop: 1 }}>{fmtTs(evt.ts)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
