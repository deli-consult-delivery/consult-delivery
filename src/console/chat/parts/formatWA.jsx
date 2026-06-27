/**
 * formatWA — formatação inline de texto WhatsApp → React (cv2 redesign / FASE 1)
 *
 * Converte marcação WhatsApp (*negrito*, _itálico_, ~tachado~, `mono`) e links
 * em nós React, preservando quebras de linha. Função pura; retorna array de nós
 * (ou null se vazio). Portada do ChatAoVivo legado para reuso na thread cv2.
 */

const WA_REGEX =
  /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;

export function formatWA(text) {
  if (!text) return null;
  const out = [];
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />);
    if (!line) return;
    let last = 0;
    let match;
    WA_REGEX.lastIndex = 0;
    while ((match = WA_REGEX.exec(line)) !== null) {
      if (match.index > last) out.push(line.slice(last, match.index));
      const t = match[0];
      const key = `wa${li}${match.index}`;
      if (t.startsWith('*') && t.endsWith('*')) {
        out.push(<strong key={key} style={{ fontWeight: 700 }}>{t.slice(1, -1)}</strong>);
      } else if (t.startsWith('_') && t.endsWith('_')) {
        out.push(<em key={key}>{t.slice(1, -1)}</em>);
      } else if (t.startsWith('~') && t.endsWith('~')) {
        out.push(<del key={key}>{t.slice(1, -1)}</del>);
      } else if (t.startsWith('`') && t.endsWith('`')) {
        out.push(
          <code
            key={key}
            style={{ background: 'rgba(0,0,0,.06)', borderRadius: 3, padding: '0 3px', fontFamily: 'monospace', fontSize: '.9em' }}
          >
            {t.slice(1, -1)}
          </code>,
        );
      } else {
        const href = t.startsWith('http') ? t : `https://${t}`;
        out.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--red)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {t}
          </a>,
        );
      }
      last = match.index + t.length;
    }
    if (last < line.length) out.push(line.slice(last));
  });
  return out.length ? out : null;
}
