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
 * FASE 3 — interações de mensagem:
 *  - barra de ações no hover (.ccv-acts): responder (↩), reagir (😊 abre
 *    mini-picker), encaminhar (↪) e apagar (🗑️ só em saída);
 *  - mini emoji picker (.ccv-emoji-bar) com ~6 emojis;
 *  - reações agrupadas abaixo do balão (.ccv-reactions / .ccv-reaction).
 *
 * Props:
 *  - msg: msgShape { id, out, txt, mtype, murl, who, tm, ts, quoted, ds, del, reactions, waId }
 *  - prevMsg: msgShape|null  (msg imediatamente anterior, p/ separador de dia)
 *  - onAbrirImagem: (url) => void  (abre o lightbox; FASE 2)
 *  - onReply: (msg) => void        (ativa a barra de resposta; FASE 3)
 *  - onReagir: (msg, emoji) => void
 *  - onApagar: (msg) => void
 *  - onEncaminhar: (msg) => void   (abre o ForwardModal; FASE 3)
 *
 * FASE 4 (IA) — transcrição de áudio + tradução por mensagem:
 *  - onTranscrever: (msg) => void  (dispara Whisper; só em áudio/vídeo inbound)
 *  - transcription: { loading, text, error }|undefined
 *  - onTraduzir: (msg) => void     (tradução da DELI; só em texto inbound)
 *  - translation: { loading, text, lang, error }|undefined
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState, useEffect, useRef } from 'react';
import { formatWA } from './formatWA.jsx';

// remetentes considerados "automação" (badge roxo + estilo sys)
const RE_AUTO = /(deli|lara|vera|breno|cora|sofia|max|bot|autom)/i;
const ehAutomacao = (who) => !!who && RE_AUTO.test(who);

// emojis do mini-picker de reação (mesmo conjunto do legado)
const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// agrupa as reações por emoji → [[emoji, contagem], ...] (imutável)
function agruparReacoes(reactions) {
  const g = {};
  (reactions || []).forEach((r) => { if (r.emoji) g[r.emoji] = (g[r.emoji] || 0) + 1; });
  return Object.entries(g);
}

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
    const ctrl = new AbortController();
    import('heic2any')
      .then(async ({ default: h2a }) => {
        let blob;
        if (src.startsWith('data:')) {
          const b64 = src.split(',')[1] || '';
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          blob = new Blob([bytes], { type: 'image/heic' });
        } else {
          blob = await (await fetch(src, { signal: ctrl.signal })).blob();
        }
        const out = await h2a({ blob, toType: 'image/jpeg', quality: 0.85 });
        const jpeg = Array.isArray(out) ? out[0] : out;
        const url = URL.createObjectURL(jpeg);
        blobUrlRef.current = url;
        if (!cancelado) setDisplaySrc(url);
      })
      .catch((e) => { if (!cancelado && e?.name !== 'AbortError') setDisplaySrc(src); });
    return () => {
      cancelado = true;
      ctrl.abort();
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

// ── barra de ações no hover (reply / reagir / encaminhar / apagar) ──────────
// `lado` posiciona a barra do lado oposto ao balão (out → esquerda; in → direita).
function Acts({ msg, lado, onReply, onAbrirPicker, onEncaminhar, onApagar }) {
  return (
    <div className="ccv-acts" style={{ [lado]: 6 }}>
      {onReply && (
        <button type="button" title="Responder" aria-label="Responder" onClick={() => onReply(msg)}>↩</button>
      )}
      {onAbrirPicker && (
        <button type="button" title="Reagir" aria-label="Reagir" onClick={onAbrirPicker}>😊</button>
      )}
      {onEncaminhar && (
        <button type="button" title="Encaminhar" aria-label="Encaminhar" onClick={() => onEncaminhar(msg)}>↪</button>
      )}
      {msg.out && onApagar && (
        <button
          type="button"
          className="del"
          title="Apagar para todos"
          aria-label="Apagar mensagem"
          onClick={() => onApagar(msg)}
        >
          🗑️
        </button>
      )}
    </div>
  );
}

// ── reações agrupadas abaixo do balão ───────────────────────────────────────
function Reactions({ reactions }) {
  const entries = agruparReacoes(reactions);
  if (!entries.length) return null;
  return (
    <div className="ccv-reactions">
      {entries.map(([emoji, n]) => (
        <span key={emoji} className="ccv-reaction">
          {emoji}{n > 1 && <b>{n}</b>}
        </span>
      ))}
    </div>
  );
}

// ── transcrição (áudio/vídeo) e tradução (texto) abaixo do balão de entrada ──
function IaExtras({ msg, transcription, translation, onTranscrever, onTraduzir }) {
  const ehAudioVideo = msg.mtype && (msg.mtype.includes('audio') || msg.mtype === 'video');
  // só faz sentido em mensagens de entrada (do cliente)
  if (msg.out || msg.del) return null;

  return (
    <>
      {/* transcrição de áudio/vídeo */}
      {ehAudioVideo && (
        <div className="ccv-transcricao">
          {!transcription && onTranscrever && (
            <button type="button" className="ccv-ia-link" onClick={() => onTranscrever(msg)}>
              ✍️ Transcrever áudio
            </button>
          )}
          {transcription?.loading && <span className="ccv-ia-load">Transcrevendo…</span>}
          {transcription?.error && <span className="ccv-ia-err">Transcrição indisponível</span>}
          {transcription?.text && <div className="ccv-ia-text">{transcription.text}</div>}
        </div>
      )}

      {/* tradução de texto */}
      {!!msg.txt && (
        <div className="ccv-traducao">
          {!translation && onTraduzir && (
            <button type="button" className="ccv-ia-link" onClick={() => onTraduzir(msg)}>
              🌐 Traduzir
            </button>
          )}
          {translation?.loading && <span className="ccv-ia-load">Traduzindo…</span>}
          {translation?.error && <span className="ccv-ia-err">Tradução indisponível</span>}
          {translation?.text && (
            <div className="ccv-ia-text">
              {translation.text}
              {translation.lang && <sub className="ccv-ia-lang">{translation.lang}</sub>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function MsgBubble({
  msg,
  prevMsg,
  onAbrirImagem,
  onReply,
  onReagir,
  onApagar,
  onEncaminhar,
  transcription,
  translation,
  onTranscrever,
  onTraduzir,
}) {
  const auto = ehAutomacao(msg.who);
  const sep = mudouDia(msg.ts, prevMsg?.ts);
  const [picker, setPicker] = useState(false);

  // fecha o mini-picker ao sair do balão (evita ficar aberto após o hover)
  const fecharPicker = () => setPicker(false);
  const temAcoes = !msg.del && (onReply || onReagir || onApagar || onEncaminhar);
  const lado = msg.out ? 'left' : 'right';

  const reagir = (emoji) => { setPicker(false); onReagir?.(msg, emoji); };

  // mensagem de automação → balão central de sistema
  if (auto && !msg.out) {
    return (
      <>
        {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
        <div className="ccv-msg sys" onMouseLeave={fecharPicker}>
          <span className="ccv-autobadge">Automação</span>{' '}
          {msg.del ? (
            '🚫 mensagem apagada'
          ) : (
            <>
              {msg.mtype && (
                <Media mtype={msg.mtype} murl={msg.murl} txt={msg.txt} onAbrirImagem={onAbrirImagem} />
              )}
              {formatWA(msg.txt)}
              <Reactions reactions={msg.reactions} />
            </>
          )}

          {temAcoes && onReagir && (
            <Acts
              msg={msg}
              lado={lado}
              onReply={onReply}
              onAbrirPicker={() => setPicker((v) => !v)}
              onEncaminhar={onEncaminhar}
              onApagar={onApagar}
            />
          )}
          {picker && (
            <div className="ccv-emoji-bar" style={{ [lado]: 6 }}>
              {REACOES.map((e) => (
                <button key={e} type="button" onClick={() => reagir(e)}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  const cls = msg.out ? 'out' : 'in';

  return (
    <>
      {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
      <div className={`ccv-msg ${cls}`} onMouseLeave={fecharPicker}>
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
            <Reactions reactions={msg.reactions} />
          </>
        )}

        <div className="ccv-mtime">
          {msg.tm}
          {msg.out && !msg.del && <Tick s={msg.ds} />}
        </div>

        <IaExtras
          msg={msg}
          transcription={transcription}
          translation={translation}
          onTranscrever={onTranscrever}
          onTraduzir={onTraduzir}
        />

        {temAcoes && (
          <Acts
            msg={msg}
            lado={lado}
            onReply={onReply}
            onAbrirPicker={onReagir ? () => setPicker((v) => !v) : null}
            onEncaminhar={onEncaminhar}
            onApagar={onApagar}
          />
        )}
        {picker && (
          <div className="ccv-emoji-bar" style={{ [lado]: 6 }}>
            {REACOES.map((e) => (
              <button key={e} type="button" onClick={() => reagir(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
