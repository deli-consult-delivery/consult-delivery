import { useState, useCallback } from 'react';
import { supabase } from './supabase.js';

export const STATUS_LABELS = {
  aguardando:         'Aguardando Atendimento',
  em_atendimento:     'Atendimento Iniciado',
  atendimento_aberto: 'Atendimento Aberto',
  automacao:          'Resposta da Automação',
  finalizado:         'Finalizado',
};

export const STATUS_COLORS = {
  aguardando:         { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },   // amber
  em_atendimento:     { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },   // blue
  atendimento_aberto: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },   // emerald
  automacao:          { bg: '#F3E8FF', text: '#6B21A8', dot: '#A855F7' },   // purple
  finalizado:         { bg: '#F3F4F6', text: '#4B5563', dot: '#9CA3AF' },   // gray
};

export const STATUS_FLOW = {
  aguardando:         ['em_atendimento', 'atendimento_aberto', 'automacao', 'finalizado'],
  em_atendimento:     ['atendimento_aberto', 'automacao', 'finalizado'],
  atendimento_aberto: ['em_atendimento', 'automacao', 'finalizado'],
  automacao:          ['em_atendimento', 'atendimento_aberto', 'finalizado'],
  finalizado:         ['reabrir'],
};

export function useConversationStatus(conversationId, tenantDbId, currentUserId) {
  const [status, setStatus]           = useState('aguardando');
  const [assignedTo, setAssignedTo]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [internalNotes, setInternalNotes] = useState('');

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from('conversations')
      .select('status, assigned_to, internal_notes')
      .eq('id', conversationId)
      .single();
    if (data) {
      setStatus(data.status || 'aguardando');
      setAssignedTo(data.assigned_to || null);
      setInternalNotes(data.internal_notes || '');
    }
  }, [conversationId]);

  const changeStatus = useCallback(async (newStatus, notes = null) => {
    if (!conversationId || !tenantDbId) return { error: 'Sem conversa ativa' };
    setLoading(true);

    const payload = { status: newStatus };
    if (notes !== null) payload.internal_notes = notes;

    if (newStatus === 'em_atendimento' || newStatus === 'atendimento_aberto') {
      payload.assigned_to = currentUserId;
    }
    if (newStatus === 'finalizado') {
      payload.finished_by = currentUserId;
    }
    if (newStatus === 'aguardando' && status === 'finalizado') {
      // reabrindo
      payload.reopened_by = currentUserId;
      payload.assigned_to = currentUserId;
    }

    const { error } = await supabase
      .from('conversations')
      .update(payload)
      .eq('id', conversationId)
      .eq('tenant_id', tenantDbId);

    if (!error) {
      setStatus(newStatus);
      if (payload.assigned_to) setAssignedTo(payload.assigned_to);
      if (notes !== null) setInternalNotes(notes);
    }

    setLoading(false);
    return { error };
  }, [conversationId, tenantDbId, currentUserId, status]);

  const finish = useCallback(async () => changeStatus('finalizado'), [changeStatus]);
  const reopen = useCallback(async () => changeStatus('aguardando'), [changeStatus]);
  const start  = useCallback(async () => changeStatus('em_atendimento'), [changeStatus]);

  return {
    status,
    assignedTo,
    loading,
    internalNotes,
    refresh,
    changeStatus,
    finish,
    reopen,
    start,
  };
}
