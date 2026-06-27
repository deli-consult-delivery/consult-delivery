/**
 * useStatusAtend — finalizar / reabrir atendimento (cv2 redesign / FASE 1)
 *
 * Padrões CLAUDE.md (P1 — silent-fail):
 *  - Todo .update() carrega .select('id'). 0 linhas afetadas = erro explícito
 *    (RLS barrou ou vínculo de tenant incorreto), NUNCA tratado como sucesso.
 *  - Toda query: .eq('tenant_id', tenantDbId).
 *  - Grava finished_by / reopened_by = userId.
 *  - Imutabilidade: não muta nada; só retorna { error } | { data }.
 *
 * Contrato de retorno das ações:
 *   { error: null, id }            → sucesso
 *   { error: <Error|string> }      → falha (inclui o caso 0-linhas)
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase.js';

const ERRO_ZERO_LINHAS =
  'Sem permissão para alterar esta conversa (0 linhas afetadas — verifique o vínculo de tenant / RLS).';

export function useStatusAtend(tenantDbId, userId) {
  const [atualizando, setAtualizando] = useState(false);

  const aplicar = useCallback(async (convId, patch) => {
    if (!convId) return { error: 'Sem conversa ativa.' };
    if (!tenantDbId) return { error: 'Tenant ausente.' };
    setAtualizando(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .update(patch)
        .eq('id', convId)
        .eq('tenant_id', tenantDbId)
        .select('id'); // OBRIGATÓRIO: sem isto, 0-linhas (RLS) retorna error:null = silent-fail
      if (error) return { error };
      if (!data || data.length === 0) return { error: ERRO_ZERO_LINHAS };
      return { error: null, id: data[0].id };
    } finally {
      setAtualizando(false);
    }
  }, [tenantDbId]);

  const finalizar = useCallback(
    (convId) =>
      aplicar(convId, {
        status: 'finalizado',
        status_v2: 'closed',
        finished_by: userId || null,
      }),
    [aplicar, userId],
  );

  const reabrir = useCallback(
    (convId) =>
      aplicar(convId, {
        status: 'aguardando',
        status_v2: 'open',
        reopened_by: userId || null,
        assigned_to: null,
      }),
    [aplicar, userId],
  );

  return { finalizar, reabrir, atualizando };
}
