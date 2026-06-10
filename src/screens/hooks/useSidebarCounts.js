import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const STALE_MS = 60_000; // revalida após 1 min sem recarregar

/**
 * Contadores reais da barra lateral para o tenant atual.
 *
 * Fontes (mesmos nomes de coluna usados em useDashboardData.js):
 *  - conversations  → nº de conversas com unread_count > 0 (não lidas)
 *  - cora_cobrancas → nº de cobranças em aberto (status in aberto/negociando/escalonado)
 *
 * Retorna { chat, cora, loading, error, reload }.
 * `chat` e `cora` têm sempre valor numérico (0 quando vazio ou ainda carregando),
 * então o componente não precisa de guards.
 */
export function useSidebarCounts(tenantDbId) {
  const [state, setState] = useState({
    chat: 0,
    cora: 0,
    loading: true,
    error: null,
  });
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const [convsRes, cobrancasRes] = await Promise.all([
        // Conversas ativas do tenant (mesmo filtro de status do dashboard)
        supabase
          .from('conversations')
          .select('id, unread_count')
          .eq('tenant_id', tenantDbId)
          .not('status', 'in', '("fechado","finalizado","arquivado","archived","closed")'),

        // Cobranças em aberto (inadimplência)
        supabase
          .from('cora_cobrancas')
          .select('id')
          .eq('tenant_id', tenantDbId)
          .in('status', ['aberto', 'negociando', 'escalonado']),
      ]);

      const firstError = [convsRes, cobrancasRes].find(r => r.error)?.error;
      if (firstError) throw firstError;

      const chat = (convsRes.data ?? []).filter(c => (c.unread_count ?? 0) > 0).length;
      const cora = (cobrancasRes.data ?? []).length;

      setState({ chat, cora, loading: false, error: null });
      setLastFetch(Date.now());
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err?.message ?? 'Erro ao carregar contadores',
      }));
    }
  }, [tenantDbId]);

  // Carrega na montagem e quando tenantDbId muda
  useEffect(() => {
    load();
  }, [load]);

  // Revalida silenciosamente após STALE_MS
  useEffect(() => {
    if (!tenantDbId) return;
    const interval = setInterval(() => {
      if (Date.now() - lastFetch >= STALE_MS) load();
    }, STALE_MS);
    return () => clearInterval(interval);
  }, [tenantDbId, lastFetch, load]);

  return { ...state, reload: load };
}
