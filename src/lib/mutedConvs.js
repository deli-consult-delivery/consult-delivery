const KEY = 'cd_muted_convs';

export function getMuted() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { return new Set(); }
}

export function isMuted(convId) { return getMuted().has(convId); }

export function toggleMute(convId) {
  const s = getMuted();
  s.has(convId) ? s.delete(convId) : s.add(convId);
  localStorage.setItem(KEY, JSON.stringify([...s]));
  return s.has(convId);
}
