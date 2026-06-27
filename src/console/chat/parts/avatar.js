/**
 * avatar — utilitários puros de avatar (cv2 redesign / FASE 1)
 *
 * Cor determinística por hash do nome + inicial. Compartilhado por ConvItem,
 * Thread e PainelContato para não duplicar a paleta (DRY). Sem efeitos colaterais.
 */

// paleta cv2: vermelho de marca + cores de apoio (mesma de ChatAoVivo legado)
const COR = ['#B70C00', '#1f4f9c', '#1e7d43', '#9a6a10', '#6d28d9', '#0e7490', '#b45309'];

export function corAvatar(seed) {
  const s = String(seed || '?');
  const soma = [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
  return COR[soma % COR.length];
}

export function inicial(nome) {
  const n = String(nome || '?').trim();
  return (n[0] || '?').toUpperCase();
}
