/**
 * ForwardModal — modal de encaminhamento de mensagem (cv2 redesign / FASE 3)
 *
 * Overlay com a lista de conversas do tenant para escolher 1+ destinos:
 *  - busca client-side (nome / telefone);
 *  - multi-seleção via checkbox (estado local, imutável);
 *  - botão Encaminhar → onConfirmar(convIds); botão fechar / clique no overlay.
 *
 * Não toca o banco: o INSERT/Evolution é responsabilidade de useAcoesMsg
 * (chamado pelo container via onConfirmar). Aqui é só seleção de destinos.
 *
 * Props:
 *  - msg: msgShape         (mensagem a encaminhar — para o preview do header)
 *  - convs: convShape[]    (conversas candidatas a destino)
 *  - onConfirmar: (convIds: string[]) => void
 *  - onClose: () => void
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-fwd-*).
 */

import { useState, useMemo, useEffect } from 'react';
import { corAvatar, inicial } from './avatar.js';

// preview curto da mensagem encaminhada (texto ou rótulo de mídia)
const previewMsg = (m) => m?.txt || (m?.mtype ? '📎 mídia' : '(mensagem)');

export default function ForwardModal({ msg, convs, onConfirmar, onClose }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(() => new Set());

  // Escape fecha o modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // candidatos: exclui canais internos (não encaminhar p/ chat interno) + busca
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (convs || [])
      .filter((c) => !c.isChan)
      .filter((c) => {
        if (!q) return true;
        return c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q);
      });
  }, [convs, busca]);

  const toggle = (id) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmar = () => {
    const ids = [...sel];
    if (!ids.length) return;
    onConfirmar?.(ids);
  };

  return (
    <div className="ccv-fwd-overlay" onClick={onClose}>
      <div className="ccv-fwd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ccv-fwd-head">
          <div className="ccv-fwd-title">Encaminhar mensagem</div>
          <button
            type="button"
            className="ccv-cbtn"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
          </button>
        </div>

        <div className="ccv-fwd-preview">{previewMsg(msg)}</div>

        <input
          className="ccv-fwd-search"
          placeholder="Buscar conversa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar conversa"
        />

        <div className="ccv-fwd-list">
          {lista.length === 0 && (
            <div className="ccv-empty">Nenhuma conversa encontrada.</div>
          )}
          {lista.map((c) => {
            const on = sel.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`ccv-fwd-item${on ? ' sel' : ''}`}
                onClick={() => toggle(c.id)}
              >
                <span className="ccv-av sm" style={{ background: corAvatar(c.nome) }}>
                  {inicial(c.nome)}
                </span>
                <span className="ccv-fwd-item-nm">{c.nome}</span>
                <span className={`ccv-fwd-check${on ? ' on' : ''}`} aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ccv-fwd-foot">
          <button type="button" className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button type="button" className="cv2-btn" onClick={confirmar} disabled={sel.size === 0}>
            Encaminhar{sel.size > 0 ? ` (${sel.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
