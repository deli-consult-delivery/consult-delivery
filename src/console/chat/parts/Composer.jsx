/**
 * Composer — barra de redação da thread (cv2 redesign / FASE 1 + FASE 2)
 *
 * FASE 1: input pill "Mensagem…" + envio de TEXTO (Enter / clique no enviar).
 * FASE 2 (este arquivo): tornar funcionais os acessórios de mídia/áudio:
 *  - Anexar: file input oculto (imagem/vídeo/pdf/doc) → onEnviarMidia(file);
 *  - Colar imagem: onPaste captura a imagem do clipboard → onEnviarMidia;
 *  - Gravação PTT: toggle (inicia / para+envia) com timer e botão cancelar.
 *
 * FASE 3 — barra de reply ativa no topo (.ccv-reply-bar): quando `replyTo` está
 * setado, mostra a citação + botão cancelar; o envio é feito normalmente (o
 * container inclui o quoted_content e limpa replyTo após o envio).
 *
 * FASE 4 (EQUIPE):
 *  - Menu de respostas rápidas (.ccv-qr): lista as quick_replies; clicar insere
 *    o conteúdo no draft. Digitar um atalho ("/ola") + Enter expande p/ o texto.
 *  - Banner do BRENO (.ccv-breno) acima do composer: usar (preenche o draft) /
 *    dispensar (some).
 *
 * Props:
 *  - onEnviar: (texto) => void
 *  - onEnviarMidia: (file) => void
 *  - disabled: boolean
 *  - gravando: boolean
 *  - segundos: number
 *  - iniciarGravacao: () => void
 *  - pararEnviar: () => void   (para a gravação e envia o áudio)
 *  - cancelar: () => void       (descarta a gravação)
 *  - enviandoMidia: boolean
 *  - replyTo: msgShape|null     (mensagem sendo respondida; FASE 3)
 *  - onCancelReply: () => void  (limpa a barra de resposta; FASE 3)
 *  - quickReplies: QuickReply[] (FASE 4) [{ id, title, shortcut, content }]
 *  - buscarPorShortcut: (txt) => QuickReply|null (FASE 4)
 *  - breno: { sugestao, onUsar:()=>string|undefined, onDispensar:()=>void } (FASE 4)
 *
 * Estado local: rascunho do input + abertura do menu de QR. Imutável.
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState, useRef, useEffect } from 'react';
import { Ico } from '../../CvIcons.jsx';

const ACCEPT = 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*';

// detecção de toque: pointer:coarse = celular/tablet. No touch o Enter quebra linha
// (teclado virtual não tem Shift à mão); envio só pelo botão.
const detectTouch = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

// formata segundos → mm:ss
const fmtTempo = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// texto da citação na barra de reply (replyTo pode ter txt e/ou mídia)
const previewReply = (m) => m?.txt || (m?.mtype ? '📎 mídia' : '');

export default function Composer({
  onEnviar,
  onEnviarMidia,
  disabled,
  gravando = false,
  segundos = 0,
  iniciarGravacao,
  pararEnviar,
  cancelar,
  enviandoMidia = false,
  replyTo = null,
  onCancelReply,
  quickReplies = [],
  buscarPorShortcut,
  breno = null,
  mediaDisabled = false,
}) {
  // mídia/áudio indisponível em canal interno (mediaDisabled) ou composer desabilitado
  const midiaOff = disabled || mediaDisabled;
  // lazy: avalia no 1º render (não no module load) — seguro p/ SSR-import e mock de matchMedia em teste
  const [isTouch] = useState(detectTouch);
  const [draft, setDraft] = useState('');
  const [qrAberto, setQrAberto] = useState(false);
  const fileRef = useRef(null);
  const qrRef = useRef(null);
  const taRef = useRef(null);

  // auto-resize do textarea: cresce até 160px e depois rola (portado de ChatScreen.jsx:3858-3866)
  const autoResize = () => {
    const el = taRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
  };

  // fecha o menu de quick replies ao clicar fora
  useEffect(() => {
    if (!qrAberto) return;
    const onDoc = (e) => { if (qrRef.current && !qrRef.current.contains(e.target)) setQrAberto(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [qrAberto]);

  const enviar = () => {
    let texto = draft.trim();
    if (!texto || disabled) return;
    // expande atalho de quick reply (ex.: "/ola") se casar exatamente
    const qr = buscarPorShortcut?.(texto);
    if (qr?.content) texto = qr.content;
    onEnviar(texto);
    setDraft('');
    if (taRef.current) taRef.current.style.height = 'auto'; // reseta altura após enviar
  };

  const onKeyDown = (e) => {
    // touch: nunca interceptar Enter — deixa quebrar linha; envio é só pelo botão vermelho.
    if (isTouch) return;
    // desktop/mouse: Enter envia, Shift+Enter quebra linha (nativo).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  // insere o conteúdo de uma quick reply no draft (não envia — permite editar)
  const inserirQR = (qr) => {
    setQrAberto(false);
    if (qr?.content) setDraft(qr.content);
  };

  // BRENO: usar → preenche o draft com a sugestão retornada
  const usarBreno = () => {
    const texto = breno?.onUsar?.();
    if (texto) setDraft(texto);
  };

  const brenoBanner = breno?.sugestao ? (
    <div className="ccv-breno">
      <span className="ccv-breno-ic" aria-hidden="true"><Ico name="i-bot" size={14} /></span>
      <div className="ccv-breno-body">
        <div className="ccv-breno-tit">Sugestão do BRENO</div>
        <div className="ccv-breno-txt">{breno.sugestao.breno_response || ''}</div>
      </div>
      <div className="ccv-breno-acts">
        <button type="button" className="ccv-breno-use" onClick={usarBreno} disabled={disabled}>Usar</button>
        <button type="button" className="ccv-breno-dis" onClick={() => breno?.onDispensar?.()} title="Dispensar" aria-label="Dispensar sugestão">✕</button>
      </div>
    </div>
  ) : null;

  // menu de respostas rápidas (lista as quick_replies do tenant)
  const qrMenu = qrAberto ? (
    <div className="ccv-qr-menu" role="menu">
      {quickReplies.length === 0 && <div className="ccv-qr-empty">Nenhuma resposta rápida.</div>}
      {quickReplies.map((qr) => (
        <button key={qr.id} type="button" className="ccv-qr-item" role="menuitem" onClick={() => inserirQR(qr)}>
          <span className="ccv-qr-tit">{qr.title || qr.shortcut || 'Resposta'}</span>
          {qr.shortcut && <span className="ccv-qr-sc">{qr.shortcut}</span>}
        </button>
      ))}
    </div>
  ) : null;

  // anexar via file input
  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && !disabled) onEnviarMidia?.(f);
  };

  // colar do clipboard: imagem → mídia; texto → preserva quebras de linha
  const onPaste = (e) => {
    // 1) imagem colada (só quando mídia habilitada) → envia como anexo
    if (!midiaOff) {
      const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (img) {
        const f = img.getAsFile();
        if (f) { e.preventDefault(); onEnviarMidia?.(f); return; }
      }
    }
    // 2) texto: só intercepta quando a normalização REALMENTE muda o conteúdo
    // (HTML rico ou \r\n). Texto puro segue o paste nativo — preserva o undo.
    if (disabled) return;
    const plain = e.clipboardData?.getData('text/plain') || '';
    const types = e.clipboardData?.types || [];
    let text = plain;
    if (!text.includes('\n') && types.includes('text/html')) {
      const html = e.clipboardData.getData('text/html');
      text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    }
    // U+2028 (line sep) e U+2029 (paragraph sep) chegam do iOS/Safari — viram \n
    const normLineBreaks = (s) => s
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u2028\u2029]/g, '\n');
    const normalized = normLineBreaks(text);
    // só intercepta quando o conteúdo difere ALÉM da normalização de quebra de linha
    // (i.e. HTML rico foi stripado). CRLF/CR/U+2028 puro o <textarea> já normaliza no
    // paste nativo → deixa o browser colar e preserva o undo.
    if (normalized === normLineBreaks(plain)) return;
    e.preventDefault();
    const el = taRef.current;
    if (!el) { setDraft((d) => d + normalized); return; }
    // usa el.value (valor atual do DOM) em vez de draft p/ evitar stale closure
    const current = el.value;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = current.slice(0, start) + normalized + current.slice(end);
    setDraft(next);
    // reposiciona o cursor após o texto colado e redimensiona
    const pos = start + normalized.length;
    setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); autoResize(); }, 0);
  };

  const podeEnviarTexto = !disabled && draft.trim().length > 0;

  // barra de reply (FASE 3) — citação ativa + botão cancelar, acima do composer
  const replyBar = replyTo ? (
    <div className="ccv-reply-bar">
      <div className="ccv-reply-content">
        <div className="ccv-reply-who">Respondendo {replyTo.out ? 'você' : (replyTo.who || 'cliente')}</div>
        <div className="ccv-reply-txt">{previewReply(replyTo)}</div>
      </div>
      <button
        type="button"
        className="ccv-cbtn"
        title="Cancelar resposta"
        aria-label="Cancelar resposta"
        onClick={() => onCancelReply?.()}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>✕</span>
      </button>
    </div>
  ) : null;

  // ── modo gravação: substitui a linha do composer pelos controles de áudio ───
  if (gravando) {
    return (
      <>
        {brenoBanner}
        {replyBar}
        <div className="ccv-composer ccv-rec">
          <span className="ccv-rec-dot" aria-hidden="true" />
          <span className="ccv-rec-time">{fmtTempo(segundos)}</span>
          <span className="ccv-rec-hint">Gravando áudio…</span>
          <div className="ccv-rec-actions">
            <button
              type="button"
              className="ccv-cbtn"
              title="Cancelar gravação"
              onClick={() => cancelar?.()}
              aria-label="Cancelar gravação"
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>✕</span>
            </button>
            <button
              type="button"
              className="ccv-cbtn send"
              title="Parar e enviar áudio"
              onClick={() => pararEnviar?.()}
              aria-label="Enviar áudio"
            >
              <Ico name="i-check" size={16} />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {brenoBanner}
      {replyBar}
      <div className="ccv-composer">
      <input ref={fileRef} type="file" hidden accept={ACCEPT} onChange={onPickFile} />

      {/* anexar — funcional (FASE 2) */}
      <button
        type="button"
        className="ccv-cbtn"
        title="Anexar arquivo"
        onClick={() => fileRef.current?.click()}
        disabled={midiaOff || enviandoMidia}
        aria-label="Anexar arquivo"
      >
        <Ico name="i-clip" size={16} />
      </button>

      {/* respostas rápidas (FASE 4) — menu de quick_replies */}
      <div className="ccv-qr" ref={qrRef}>
        <button
          type="button"
          className={`ccv-cbtn${qrAberto ? ' on' : ''}`}
          title="Respostas rápidas"
          onClick={() => setQrAberto((v) => !v)}
          disabled={disabled}
          aria-label="Respostas rápidas"
          aria-expanded={qrAberto}
        >
          <Ico name="i-zap" size={16} />
        </button>
        {qrMenu}
      </div>

      <textarea
        ref={taRef}
        className="ccv-input"
        rows={1}
        placeholder={disabled ? 'Selecione uma conversa para responder' : (enviandoMidia ? 'Enviando mídia…' : 'Mensagem…')}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autoResize(); }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        aria-label="Mensagem"
      />

      {podeEnviarTexto ? (
        <button
          type="button"
          className="ccv-cbtn send"
          title="Enviar"
          onClick={enviar}
          aria-label="Enviar mensagem"
        >
          <Ico name="i-reply" size={16} />
        </button>
      ) : (
        <button
          type="button"
          className="ccv-cbtn mic"
          title="Gravar áudio"
          onClick={() => iniciarGravacao?.()}
          disabled={midiaOff || enviandoMidia}
          aria-label="Gravar áudio"
        >
          <Ico name="i-mic" size={16} />
        </button>
      )}
      </div>
    </>
  );
}
