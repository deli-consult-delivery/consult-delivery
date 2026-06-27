/**
 * useFavMute — favoritos + silenciados por conversa (cv2 redesign / FASE 4)
 *
 * Estado puramente local (não há coluna no banco): persistido em localStorage
 * com try/catch em toda leitura/escrita. Chaves herdadas do legado p/ continuidade:
 *  - favoritos: 'cd-fav-convs'
 *  - mudas:     'cd-muted-convs'
 *
 * Favoritos: usados para marcar (estrela) e priorizar a ordenação (fav no topo).
 * Mudas: silenciam o badge de não-lidas da conversa (não some da lista).
 *
 * Padrões CLAUDE.md:
 *  - Sem console.log: erro de localStorage engolido no catch (estado em memória persiste).
 *  - Imutabilidade: sempre novo Set no setState.
 *
 * Contrato:
 *  - useFavMute() → { favs, mutes, isFav, isMuted, toggleFav, toggleMute }
 *  - favs/mutes: Set<convId>
 */

import { useState, useCallback } from 'react';

const KEY_FAV = 'cd-fav-convs';
const KEY_MUTE = 'cd-muted-convs';

const lerSet = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
};

const salvarSet = (key, set) => {
  try { localStorage.setItem(key, JSON.stringify([...set])); }
  catch { /* localStorage indisponível: estado em memória segue válido na sessão */ }
};

// toggle imutável de um id num Set, persistindo a cópia nova
const toggleEm = (prev, id, key) => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id); else next.add(id);
  salvarSet(key, next);
  return next;
};

export function useFavMute() {
  const [favs, setFavs] = useState(() => lerSet(KEY_FAV));
  const [mutes, setMutes] = useState(() => lerSet(KEY_MUTE));

  const toggleFav = useCallback((convId) => {
    if (!convId) return;
    setFavs((prev) => toggleEm(prev, convId, KEY_FAV));
  }, []);

  const toggleMute = useCallback((convId) => {
    if (!convId) return;
    setMutes((prev) => toggleEm(prev, convId, KEY_MUTE));
  }, []);

  const isFav = useCallback((convId) => favs.has(convId), [favs]);
  const isMuted = useCallback((convId) => mutes.has(convId), [mutes]);

  return { favs, mutes, isFav, isMuted, toggleFav, toggleMute };
}
