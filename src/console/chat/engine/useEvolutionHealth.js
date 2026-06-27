/**
 * useEvolutionHealth — detecção discreta de Evolution offline (cv2 redesign / FASE 4)
 *
 * Heurística (sem novo endpoint; usa o que já existe):
 *  1) Instância: se o status NÃO casa conn/open → considerada desconectada.
 *  2) Sinal vivo: idade da última mensagem inbound do tenant. Se não há instância
 *     conectada E não houve inbound recente (> THRESHOLD), sinaliza offline.
 *
 * Conservador de propósito: só acende quando a instância não está conectada — uma
 * caixa naturalmente sem inbound recente (madrugada) com instância OPEN não acende.
 * O aviso é discreto (banner na Thread), nunca bloqueia o envio.
 *
 * Padrões CLAUDE.md:
 *  - Toda query: .eq('tenant_id', tenantDbId).
 *  - Sem console.log: erro tratado via early-return.
 *  - Cleanup do timer/flag no return do effect.
 *
 * Contrato:
 *  - useEvolutionHealth(tenantDbId, instance) → { evolutionOffline }
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';

// janela sem inbound que, combinada a instância não-conectada, sinaliza offline
const INBOUND_STALE_MS = 30 * 60 * 1000; // 30 min
const RECHECK_MS = 60 * 1000;            // re-checa a cada 1 min

const instanciaConectada = (inst) => !!inst && /conn|open/i.test(inst.status || '');

export function useEvolutionHealth(tenantDbId, instance) {
  const [evolutionOffline, setEvolutionOffline] = useState(false);

  useEffect(() => {
    if (!tenantDbId) { setEvolutionOffline(false); return; }

    // instância conectada → online de imediato, sem custo de query
    if (instanciaConectada(instance)) { setEvolutionOffline(false); return; }

    let vivo = true;
    let timer = null;

    const checar = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('created_at')
        .eq('tenant_id', tenantDbId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!vivo) return;
      if (error) { setEvolutionOffline(false); return; } // sem dado confiável → não alarmar
      const ultimoTs = data?.created_at ? new Date(data.created_at).getTime() : 0;
      const semInboundRecente = !ultimoTs || (Date.now() - ultimoTs > INBOUND_STALE_MS);
      // instância não-conectada (já filtrada acima) + sem inbound recente = offline
      setEvolutionOffline(semInboundRecente);
    };

    checar();
    timer = setInterval(checar, RECHECK_MS);
    return () => { vivo = false; if (timer) clearInterval(timer); };
  }, [tenantDbId, instance]);

  return { evolutionOffline };
}
