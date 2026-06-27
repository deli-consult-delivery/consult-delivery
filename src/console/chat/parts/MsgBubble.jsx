/**
 * MsgBubble — balão de mensagem da thread (cv2 redesign / FASE 1)
 *
 * Renderiza:
 *  - separador de dia (.ccv-day) quando a data muda em relação à msg anterior;
 *  - balão entrada (.ccv-msg.in, esquerda) / saída (.ccv-msg.out, direita) /
 *    sistema-automação (.ccv-msg.sys);
 *  - nome do remetente (.ccv-who) só em mensagens de entrada;
 *  - badge "Automação" (.ccv-autobadge) quando o remetente é automação;
 *  - citação/reply (.ccv-quoted) em texto;
 *  - mídia como placeholder "📎 mídia" nesta fase;
 *  - hora + tick de entrega (saída).
 *
 * FASE 2 — renderiza mídia real (image / video / audio / document):
 *  - image: thumbnail clicável → onAbrirImagem(url) (lightbox); HEIC→JPEG via heic2any;
 *  - video: <video controls>; audio: <audio controls>;
 *  - document: botão de download com o nome do arquivo.
 *
 * Props:
 *  - msg: msgShape { id, out, txt, mtype, murl, who, tm, ts, quoted, ds, del }
 *  - prevMsg: msgShape|null  (msg imediatamente anterior, p/ separador de dia)
 *  - onAbrirImagem: (url) => void  (abre o lightbox; FASE 2)
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState, useEffect, useRef } from 'react';
import { formatWA } from './formatWA.jsx';

// remetentes considerados "automação" (badge roxo + estilo sys)
const RE_AUTO = /(deli|lara|vera|breno|cora|sofia|max|bot|autom)/i;
const ehAutomacao = (who) => !!who && RE_AUTO.test(who);

// rótulo do separador de dia: "Hoje" / "Ontem" / DD/MM/AAAA
function rotuloDia(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mudouDia(ts, prevTs) {
  if (!ts) return false;
  if (!prevTs) return true; // primeira do bloco → mostra a data
  return new Date(ts).toDateString() !== new Date(prevTs).toDateString();
}

// tick de entrega (delivery_status): mesma semântica do legado
function Tick({ s }) {
  if (s === 0) {
    return <span title="erro ao enviar" style={{ color: 'var(--red)', fontWeight: 700 }}>!</span>;
  }
  const cor = s >= 4 ? '#53BDEB' : 'var(--tx2)';
  if (s === null || s === undefined || s === 1) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
      </svg>
    );
  }
  if (s === 2) {
    return (
      <svg width="14" height="12" viewBox="0 0 20 16" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 8 8 12 16 4" />
      </svg>
    );
  }
  return (
    <svg width="16" height="12" viewBox="0 0 24 16" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 15 4" /><polyline points="9 12 13 16 21 8" />
    </svg>
  );
}

// texto da citação (quoted pode ser string ou objeto { text })
const quotedTexto = (q) =>
  (typeof q === 'string' ? q : q?.text) || '📎 Mídia';

// ── imagem com conversão HEIC→JPEG sob demanda (portado do legado SmartImage) ─
function SmartImage({ src, alt, onAbrir }) {
  const [displaySrc, setDisplaySrc] = useState(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!src) { setDisplaySrc(null); return undefined; }
    const isHeic = /(^data:image\/(heic|heif)|\.(heic|heif)(\?|$))/i.test(src);
    if (!isHeic) { setDisplaySrc(src); return undefined; }
    let cancelado = false;
    import('heic2any')
      .then(async ({ default: h2a }) => {
        let blob;
        if (src.startsWith('data:')) {
          const b64 = src.split(',')[1] || '';
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          blob = new Blob([bytes], { type: 'image/heic' });
        } else {
          blob = await (await fetch(src)).blob();
        }
        const out = await h2a({ blob, toType: 'image/jpeg', quality: 0.85 });
        const jpeg = Array.isArray(out) ? out[0] : out;
        const url = URL.createObjectURL(jpeg);
        blobUrlRef.current = url;
        if (!cancelado) setDisplaySrc(url);
      })
      .catch(() => { if (!cancelado) setDisplaySrc(src); });
    return () => {
      cancelado = true;
      // zera o src antes de revogar p/ o <img> não renderizar URL já revogada
      if (blobUrlRef.current) {
        setDisplaySrc(null);
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src]);

  if (!displaySrc) {
    return <span className="ccv-media-loading">{src ? 'Convertendo imagem…' : '🖼️ carregando…'}</span>;
  }
  return (
    <img
      className="ccv-media-img"
      src={displaySrc}
      alt={alt || 'imagem'}
      onClick={() => onAbrir?.(displaySrc)}
    />
  );
}

// ── render de mídia real conforme media_type ────────────────────────────────
function Media({ mtype, murl, txt, onAbrirImagem }) {
  if (!mtype) return null;

  if (mtype === 'image') {
    return <SmartImage src={murl} alt={txt} onAbrir={onAbrirImagem} />;
  }
  if (mtype === 'video') {
    return murl
      ? <video className="ccv-media-video" src={murl} controls />
      : <span className="ccv-media-loading">🎬 carregando…</span>;
  }
  if (mtype === 'audio') {
    return murl
      ? <audio className="ccv-audio" src={murl} controls />
      : <span className="ccv-media-loading">🎙️ carregando…</span>;
  }
  // document (ou desconhecido)
  return (
    <a
      className="ccv-doc"
      href={murl || undefined}
      download={txt || 'arquivo'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (!murl) e.preventDefault(); }}
    >
      <span className="ccv-doc-ico" aria-hidden="true">📄</span>
      <span className="ccv-doc-name">{txt || 'Documento'}</span>
      {murl && <span className="ccv-doc-dl" aria-hidden="true">⬇</span>}
    </a>
  );
}

export default function MsgBubble({ msg, prevMsg, onAbrirImagem }) {
  const auto = ehAutomacao(msg.who);
  const sep = mudouDia(msg.ts, prevMsg?.ts);

  // mensagem de automação → balão central de sistema
  if (auto && !msg.out) {
    return (
      <>
        {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
        <div className="ccv-msg sys">
          <span className="ccv-autobadge">Automação</span>{' '}
          {msg.del ? (
            '🚫 mensagem apagada'
          ) : (
            <>
              {msg.mtype && (
                <Media mtype={msg.mtype} murl={msg.murl} txt={msg.txt} onAbrirImagem={onAbrirImagem} />
              )}
              {formatWA(msg.txt)}
            </>
          )}
        </div>
      </>
    );
  }

  const cls = msg.out ? 'out' : 'in';

  return (
    <>
      {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
      <div className={`ccv-msg ${cls}`}>
        {!msg.out && msg.who && <div className="ccv-who">{msg.who}</div>}

        {msg.quoted && !msg.del && (
          <div className="ccv-quoted">
            <div className="ccv-quoted-who">{msg.out ? 'Você' : (msg.who || 'Cliente')}</div>
            <div className="ccv-quoted-txt">{quotedTexto(msg.quoted)}</div>
          </div>
        )}

        {msg.del ? (
          <span style={{ fontStyle: 'italic', color: 'var(--tx2)' }}>🚫 mensagem apagada</span>
        ) : (
          <>
            {msg.mtype && (
              <Media mtype={msg.mtype} murl={msg.murl} txt={msg.txt} onAbrirImagem={onAbrirImagem} />
            )}
            {/* o nome do arquivo já aparece no balão do documento — não duplicar como texto */}
            {msg.txt && msg.mtype !== 'document' && msg.mtype !== 'audio' && (
              <div style={{ wordBreak: 'break-word', marginTop: msg.mtype ? 4 : 0 }}>
                {formatWA(msg.txt)}
              </div>
            )}
          </>
        )}

        <div className="ccv-mtime">
          {msg.tm}
          {msg.out && !msg.del && <Tick s={msg.ds} />}
        </div>
      </div>
    </>
  );
}
