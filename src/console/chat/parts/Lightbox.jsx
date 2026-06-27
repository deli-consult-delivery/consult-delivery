/**
 * Lightbox — overlay de imagem em tela cheia (cv2 redesign / FASE 2)
 *
 * Aberto ao clicar no thumbnail de uma imagem no MsgBubble. Suporta:
 *  - zoom com a roda do mouse (scale 1..8);
 *  - arrastar a imagem quando ampliada (scale > 1);
 *  - fechar com Escape, clique fora da imagem ou no botão ×.
 *
 * Portado de ImageLightbox (src/screens/ChatScreen.jsx) — lógica já testada —
 * com classes escopadas .cv2-main .ccv-lightbox (aparência em chat-cv2.css).
 *
 * Props: { url, onClose }.
 */

import { useState, useEffect, useRef } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 8;

export default function Lightbox({ url, onClose }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const closeBtnRef = useRef(null);

  // ref síncrono p/ onClose — evita re-vincular o listener a cada render do pai
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Escape fecha; listener vinculado uma única vez (deps vazias via ref)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // foco no botão de fechar ao abrir; restaura o foco anterior ao desmontar
  useEffect(() => {
    const anterior = document.activeElement;
    closeBtnRef.current?.focus();
    return () => { if (anterior && anterior.focus) anterior.focus(); };
  }, []);

  // focus trap: mantém o Tab dentro do dialog (só há o botão de fechar focável)
  const onDialogKeyDown = (e) => {
    if (e.key === 'Tab') { e.preventDefault(); closeBtnRef.current?.focus(); }
  };

  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.001)));
  };
  const onMouseDown = (e) => {
    if (scale <= 1) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const onMouseUp = () => { dragging.current = false; };

  if (!url) return null;

  return (
    <div
      className="ccv-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Visualização de imagem"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
    >
      <img
        className="ccv-lightbox-img"
        src={url}
        alt="visualização"
        draggable={false}
        style={{
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          transition: dragging.current ? 'none' : 'transform 120ms ease',
        }}
      />
      <button
        ref={closeBtnRef}
        type="button"
        className="ccv-lightbox-close"
        onClick={onClose}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
