/**
 * Composer — barra de redação da thread (cv2 redesign / FASE 1)
 *
 * Linha de ícones (anexar / agendar / citar / mic — VISUAIS nesta fase) + input
 * pill "Mensagem…" + botão enviar vermelho. Só o envio de TEXTO é funcional;
 * os ícones acessórios são placeholders (disabled) reservados às próximas fases.
 *
 * Props:
 *  - onEnviar: (texto) => void   (chamado no Enter / clique em enviar)
 *  - disabled: boolean           (sem conversa ativa, sem instância, enviando…)
 *
 * Estado local: apenas o rascunho do input (controlado). Imutável.
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState } from 'react';
import { Ico } from '../../CvIcons.jsx';

export default function Composer({ onEnviar, disabled }) {
  const [draft, setDraft] = useState('');

  const enviar = () => {
    const texto = draft.trim();
    if (!texto || disabled) return;
    onEnviar(texto);
    setDraft('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const podeEnviar = !disabled && draft.trim().length > 0;

  return (
    <div className="ccv-composer">
      {/* ícones acessórios — placeholders visuais nesta fase */}
      <button type="button" className="ccv-cbtn" title="Anexar (em breve)" disabled aria-label="Anexar arquivo">
        <Ico name="i-clip" size={16} />
      </button>
      <button type="button" className="ccv-cbtn" title="Agendar (em breve)" disabled aria-label="Agendar envio">
        <Ico name="i-clock" size={16} />
      </button>
      <button type="button" className="ccv-cbtn" title="Citar (em breve)" disabled aria-label="Citar mensagem">
        <Ico name="i-reply" size={16} />
      </button>

      <input
        className="ccv-input"
        placeholder={disabled ? 'Selecione uma conversa para responder' : 'Mensagem…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label="Mensagem"
      />

      <button type="button" className="ccv-cbtn" title="Gravar áudio (em breve)" disabled aria-label="Gravar áudio">
        <Ico name="i-mic" size={16} />
      </button>

      <button
        type="button"
        className="ccv-cbtn send"
        title="Enviar"
        onClick={enviar}
        disabled={!podeEnviar}
        aria-label="Enviar mensagem"
      >
        <Ico name="i-reply" size={16} />
      </button>
    </div>
  );
}
