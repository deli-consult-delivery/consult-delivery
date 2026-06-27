/**
 * useBreno — sugestão do agente BRENO para a conversa ativa (cv2 redesign / FASE 4)
 *
 * Porta a lógica testada do ChatAoVivo antigo: carrega a última interação do
 * BRENO marcada como sugestão pendente de revisão (requires_review=true,
 * action_taken='suggested') e expõe ações de usar (preenche o draft via callback)
 * ou dispensar (marca action_taken='dismissed').
 *
 * Padrões CLAUDE.md:
 *  - Toda query: .eq('tenant_id', tenantDbId) (multi-tenant — a tabela tem coluna).
 *  - .update() com .select('id') p/ detectar silent-fail de RLS / 0-linhas (Padrão P1).
 *  - Sem console.log: erro tratado de forma explícita via retorno/early-return.
 *  - Imutabilidade: sempre novo estado no setState.
 *
 * Contrato:
 *  - useBreno(activeId, tenantDbId, onUsar) → { brenoSugestao, usarSugestao, dispensar }
 *  - onUsar(texto) é chamado por usarSugestao() para preencher o composer.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase.js';

// P1: a coluna da sugestão é `breno_response` (o legado selecionava
// `resposta_sugerida`, que NÃO existe → data null silencioso). Corrigido aqui.
const SELECT_BRENO = 'id, breno_response, conversation_id, created_at';

export function useBreno(activeId, tenantDbId, onUsar) {
  const [brenoSugestao, setBrenoSugestao] = useState(null);

  // ── carrega a sugestão pendente da conversa ativa ───────────────────────────
  useEffect(() => {
    // canais internos (chan-) e conversa nula não têm sugestão de BRENO
    if (!activeId || !tenantDbId || (typeof activeId === 'string' && activeId.startsWith('chan-'))) {
      setBrenoSugestao(null);
      return;
    }
    let vivo = true;
    supabase
      .from('breno_interactions')
      .select(SELECT_BRENO)
      .eq('conversation_id', activeId)
      .eq('tenant_id', tenantDbId)
      .eq('requires_review', true)
      .eq('action_taken', 'suggested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (vivo) setBrenoSugestao(data || null); });
    return () => { vivo = false; };
  }, [activeId, tenantDbId]);

  // ── dispensar: marca a sugestão como dismissed (best-effort, otimista) ───────
  const dispensar = useCallback(async () => {
    const id = brenoSugestao?.id;
    if (!id || !tenantDbId) return;
    setBrenoSugestao(null); // some da UI imediatamente
    const { error } = await supabase
      .from('breno_interactions')
      .update({ action_taken: 'dismissed' })
      .eq('id', id)
      .eq('tenant_id', tenantDbId)
      .select('id');
    void error; // P1: best-effort; UI local já refletiu a remoção
  }, [brenoSugestao, tenantDbId]);

  // ── usar: preenche o composer com a sugestão e dispensa em seguida ──────────
  const usarSugestao = useCallback(() => {
    if (!brenoSugestao) return;
    onUsar?.(brenoSugestao.breno_response || '');
    dispensar();
  }, [brenoSugestao, onUsar, dispensar]);

  return { brenoSugestao, usarSugestao, dispensar };
}
