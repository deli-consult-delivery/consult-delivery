/**
 * MIA-03: Hook — busca a loja vinculada a um remote_jid (whatsapp_chat_id)
 *
 * Usa Supabase diretamente (RLS garante tenant isolation).
 * Retorna null se não houver vínculo ou se o remote_jid for nulo.
 *
 * Exemplo:
 *   const loja = useLojaPorRemoteJid(active?.whatsapp_chat_id);
 *   if (loja) { // loja.id, loja.loja_id disponíveis }
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export function useLojaPorRemoteJid(remoteJid) {
  const [vinculo, setVinculo] = useState(null);

  useEffect(() => {
    if (!remoteJid) {
      setVinculo(null);
      return;
    }

    let cancelled = false;

    supabase
      .from('loja_whatsapp_vinculo')
      .select('id, loja_id, tipo, monitorar')
      .eq('remote_jid', remoteJid)
      .eq('monitorar', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setVinculo(data || null);
      })
      .catch(() => {
        if (!cancelled) setVinculo(null);
      });

    return () => { cancelled = true; };
  }, [remoteJid]);

  return vinculo;
}
