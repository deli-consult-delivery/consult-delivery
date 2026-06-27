/**
 * useQuickReplies — respostas rápidas do tenant (cv2 redesign / FASE 4)
 *
 * Porta a lógica do ChatScreen legado: carrega a tabela quick_replies do tenant
 * (.eq tenant_id, order title) e expõe a lista + um buscador por atalho (shortcut,
 * ex.: "/ola") para o composer expandir o texto ao digitar o atalho.
 *
 * Padrões CLAUDE.md:
 *  - Toda query: .eq('tenant_id', tenantDbId).
 *  - Sem console.log: erro tratado via early-return + lista vazia.
 *  - Imutabilidade: novo array no setState.
 *
 * Contrato:
 *  - useQuickReplies(tenantDbId) → { quickReplies, buscarPorShortcut }
 *  - quickReplies: [{ id, title, shortcut, content, media_type, media_url, file_path, group_name }]
 *  - buscarPorShortcut(texto) → quickReply | null  (match exato do shortcut, case-insensitive)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase.js';

const SELECT_QR = 'id, title, shortcut, content, media_type, media_url, file_path, group_name';

export function useQuickReplies(tenantDbId) {
  const [quickReplies, setQuickReplies] = useState([]);

  useEffect(() => {
    if (!tenantDbId) { setQuickReplies([]); return; }
    let vivo = true;
    supabase
      .from('quick_replies')
      .select(SELECT_QR)
      .eq('tenant_id', tenantDbId)
      .order('title', { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return;
        setQuickReplies(error ? [] : (data || []));
      });
    return () => { vivo = false; };
  }, [tenantDbId]);

  // match exato do atalho digitado (com ou sem barra inicial), case-insensitive
  const buscarPorShortcut = useCallback((texto) => {
    const t = String(texto || '').trim().toLowerCase();
    if (!t) return null;
    return quickReplies.find((qr) => (qr.shortcut || '').trim().toLowerCase() === t) || null;
  }, [quickReplies]);

  return { quickReplies, buscarPorShortcut };
}
