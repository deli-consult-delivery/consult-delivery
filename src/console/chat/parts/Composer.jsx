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
  const [draft, setDraft] = useState('');
  const [qrAberto, setQrAberto] = useState(false);
  const fileRef = useRef(null);
  const qrRef = useRef(null);

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
  };

  const onKeyDown = (e) => {
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

  // colar imagem do clipboard
  const onPaste = (e) => {
    if (midiaOff) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) { e.preventDefault(); onEnviarMidia?.(f); }
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

      <input
        className="ccv-input"
        placeholder={disabled ? 'Selecione uma conversa para responder' : (enviandoMidia ? 'Enviando mídia…' : 'Mensagem…')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
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
