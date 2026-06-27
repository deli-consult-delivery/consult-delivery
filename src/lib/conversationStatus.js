import { useState, useCallback } from 'react';
import { supabase } from './supabase.js';

export const STATUS_LABELS = {
  aguardando:         'Aguardando Atendimento',
  em_atendimento:     'Atendimento Iniciado',
  atendimento_aberto: 'Atendimento Aberto',
  automacao:          'Resposta da Automação',
  finalizado:         'Finalizado',
  falha:              'Falha no Envio',
  archived:           'Oculta',
};

export const STATUS_EMOJI = {
  aguardando:         '⏳',
  em_atendimento:     '💬',
  atendimento_aberto: '📂',
  automacao:          '🤖',
  finalizado:         '✅',
  falha:              '⚠️',
  archived:           '📦',
};

export const STATUS_COLORS = {
  aguardando:         { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },   // amber
  em_atendimento:     { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },   // blue
  atendimento_aberto: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },   // emerald
  automacao:          { bg: '#F3E8FF', text: '#6B21A8', dot: '#A855F7' },   // purple
  finalizado:         { bg: '#F3F4F6', text: '#4B5563', dot: '#9CA3AF' },   // gray
  falha:              { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },   // red
  archived:           { bg: '#F3F4F6', text: '#4B5563', dot: '#9CA3AF' },   // gray
};

// Mapa de sincronização entre status (campo PT-BR) e status_v2 (ENUM EN)
export const STATUS_V2_MAP = {
  aguardando:         'open',
  em_atendimento:     'waiting',
  atendimento_aberto: 'in_progress',
  automacao:          'automacao',
  finalizado:         'closed',
  falha:              'falha',
  archived:           'archived',
};

export const STATUS_FLOW = {
  aguardando:         ['em_atendimento', 'atendimento_aberto', 'automacao', 'finalizado'],
  em_atendimento:     ['atendimento_aberto', 'automacao', 'finalizado'],
  atendimento_aberto: ['em_atendimento', 'automacao', 'finalizado'],
  automacao:          ['em_atendimento', 'atendimento_aberto', 'finalizado'],
  finalizado:         ['reabrir'],
  falha:              ['em_atendimento', 'atendimento_aberto', 'finalizado'],
  archived:           ['em_atendimento'],
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
    if (!conversationId) return { error: 'Sem conversa ativa' };
    setLoading(true);

    const payload = {
      status:            newStatus,
      status_v2:         STATUS_V2_MAP[newStatus] || 'open',
      status_changed_by: currentUserId || null,
    };
    if (notes !== null) payload.internal_notes = notes;

    if (newStatus === 'em_atendimento' || newStatus === 'atendimento_aberto') {
      payload.assigned_to = currentUserId;
    }
    if (newStatus === 'finalizado') {
      payload.finished_by = currentUserId;
    }
    if (newStatus === 'aguardando' && status === 'finalizado') {
      payload.reopened_by = currentUserId;
      payload.assigned_to = null;
    }
    if (newStatus === 'archived') {
      payload.assigned_to = null;
    }

    // Filtra apenas por ID — RLS já garante isolamento multi-tenant.
    // .select('id') é OBRIGATÓRIO: sem ele um UPDATE que casa 0 linhas
    // (RLS barrou) retorna error:null e mascara a falha (silent-fail / Bug B).
    const { data, error } = await supabase
      .from('conversations')
      .update(payload)
      .eq('id', conversationId)
      .select('id');

    if (error) {
      setLoading(false);
      return { error };
    }
    if (!data || data.length === 0) {
      setLoading(false);
      return { error: 'Sem permissão para alterar esta conversa (0 linhas afetadas — verifique o vínculo de tenant).' };
    }

    setStatus(newStatus);
    if ('assigned_to' in payload) setAssignedTo(payload.assigned_to);
    if (notes !== null) setInternalNotes(notes);

    setLoading(false);
    return { error: null };
  }, [conversationId, currentUserId, status]);

  const finish  = useCallback(async () => changeStatus('finalizado'),       [changeStatus]);
  const reopen  = useCallback(async () => changeStatus('aguardando'),        [changeStatus]);
  const start   = useCallback(async () => changeStatus('em_atendimento'),    [changeStatus]);
  const open_   = useCallback(async () => changeStatus('atendimento_aberto'),[changeStatus]);
  const fail    = useCallback(async () => changeStatus('falha'),             [changeStatus]);
  const archive = useCallback(async () => changeStatus('archived'),          [changeStatus]);

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
    open: open_,
    fail,
    archive,
  };
}
