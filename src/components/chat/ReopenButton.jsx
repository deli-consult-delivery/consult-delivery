import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';

export default function ReopenButton({ conversation, onReopened }) {
  const [loading, setLoading] = useState(false);

  if (!conversation || conversation.status_v2 !== 'closed') return null;

  async function handleReopen() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    await supabase
      .from('conversations')
      .update({ status_v2: 'in_progress' })
      .eq('id', conversation.id);

    await supabase.from('conversation_events').insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      event_type: 'reopened',
      actor_id: user?.id ?? null,
      actor_type: 'user',
      actor_name: user?.user_metadata?.full_name ?? user?.email ?? 'Usuário',
    });

    setLoading(false);
    onReopened?.();
  }

  return (
    <button
      onClick={handleReopen}
      disabled={loading}
      style={{
        background: 'var(--warn-soft)',
        color: '#92400e',
        border: '1px solid #fcd34d',
        borderRadius: 'var(--r-sm)',
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 500,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? 'Reabrindo…' : 'Reabrir atendimento'}
    </button>
  );
}
