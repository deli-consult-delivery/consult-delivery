/**
 * useContato — infra do contato/atendimento da conversa ativa (cv2 redesign / FASE 3)
 *
 * Responsabilidades:
 *  - Carregar os departamentos ATIVOS do tenant (deps) p/ a UI de transferência.
 *  - transferir(convId, departmentId): muda department_id da conversa.
 *
 * Padrões CLAUDE.md (P1 — silent-fail):
 *  - Todo .update() carrega .select('id'). 0 linhas afetadas = erro explícito
 *    (RLS barrou / vínculo de tenant incorreto), NUNCA tratado como sucesso.
 *  - Toda query: .eq('tenant_id', tenantDbId).
 *  - Sem console.log. Imutabilidade: só retorna { error } | { data }.
 *
 * Contrato de retorno de transferir:
 *   { error: null, id }            → sucesso
 *   { error: <Error|string> }      → falha (inclui o caso 0-linhas)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase.js';

const ERRO_ZERO_LINHAS =
  'Sem permissão para transferir esta conversa (0 linhas afetadas — verifique o vínculo de tenant / RLS).';

export function useContato(tenantDbId) {
  const [deps, setDeps] = useState([]);
  const [transferindo, setTransferindo] = useState(false);

  // departamentos ativos do tenant (lista da transferência)
  useEffect(() => {
    if (!tenantDbId) { setDeps([]); return; }
    let vivo = true;
    supabase
      .from('departments')
      .select('id, name')
      .eq('tenant_id', tenantDbId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (vivo) setDeps(data || []); });
    return () => { vivo = false; };
  }, [tenantDbId]);

  const transferir = useCallback(async (convId, departmentId) => {
    if (!convId) return { error: 'Sem conversa ativa.' };
    if (!departmentId) return { error: 'Departamento não informado.' };
    if (!tenantDbId) return { error: 'Tenant ausente.' };
    setTransferindo(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .update({ department_id: departmentId })
        .eq('id', convId)
        .eq('tenant_id', tenantDbId)
        .select('id'); // OBRIGATÓRIO: sem isto, 0-linhas (RLS) volta error:null = silent-fail
      if (error) return { error };
      if (!data || data.length === 0) return { error: ERRO_ZERO_LINHAS };
      return { error: null, id: data[0].id };
    } finally {
      setTransferindo(false);
    }
  }, [tenantDbId]);

  return { deps, transferir, transferindo };
}
