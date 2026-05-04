import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW } from '../lib/conversationStatus.js';

export default function ConversationStatusBar({
  status,
  loading,
  onChangeStatus,
  onFinish,
  onReopen,
  onStart,
  internalNotes,
  onSaveNotes,
}) {
  const [open, setOpen]         = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(internalNotes || '');
  const popoverRef = useRef(null);

  const colors = STATUS_COLORS[status] || STATUS_COLORS.aguardando;
  const label  = STATUS_LABELS[status]  || status;
  const isFinished = status === 'finalizado';

  useEffect(() => {
    setDraftNotes(internalNotes || '');
  }, [internalNotes]);

  useEffect(() => {
    function onClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleAction = (action) => {
    setOpen(false);
    if (action === 'finalizado') {
      onFinish?.();
    } else if (action === 'reabrir') {
      onReopen?.();
    } else if (action === 'em_atendimento') {
      onStart?.();
    } else {
      onChangeStatus?.(action);
    }
  };

  const availableActions = STATUS_FLOW[status] || [];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 16px',
      background: 'var(--white)',
      borderBottom: '1px solid var(--g-200)',
      flexWrap: 'wrap',
    }}>
      {/* Badge de status com dropdown */}
      <div style={{ position: 'relative' }} ref={popoverRef}>
        <button
          onClick={() => setOpen(v => !v)}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            border: '1px solid transparent',
            background: colors.bg,
            color: colors.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            userSelect: 'none',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: colors.dot, flexShrink: 0,
            animation: isFinished ? 'none' : 'pulse 2s infinite',
          }} />
          {label}
          <Icon name="chevdown" size={12} />
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            background: 'var(--white)',
            border: '1px solid var(--g-200)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--sh-dropdown)',
            minWidth: 220,
            padding: '6px 0',
          }}>
            {availableActions.map(action => {
              const key = action === 'reabrir' ? 'aguardando' : action;
              const c = STATUS_COLORS[key] || STATUS_COLORS.aguardando;
              const lbl = action === 'reabrir' ? 'Reabrir atendimento' : STATUS_LABELS[key];
              return (
                <button
                  key={action}
                  onClick={() => handleAction(action)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--g-800)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--g-50)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: c.dot, flexShrink: 0,
                  }} />
                  {lbl}
                </button>
              );
            })}
            <hr style={{ border: 'none', borderTop: '1px solid var(--g-200)', margin: '6px 0' }} />
            <button
              onClick={() => { setOpen(false); setShowNotes(v => !v); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 14px', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: 13,
                color: 'var(--g-600)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--g-50)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name="edit" size={13} />
              Nota interna
            </button>
          </div>
        )}
      </div>

      {/* Botão rápido Finalizar / Reabrir */}
      {isFinished ? (
        <button
          onClick={onReopen}
          disabled={loading}
          className="btn-secondary"
          style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="refresh" size={13} />
          Reabrir
        </button>
      ) : (
        <button
          onClick={onFinish}
          disabled={loading}
          className="btn-secondary"
          style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)' }}
        >
          <Icon name="checkcircle" size={13} />
          Finalizar
        </button>
      )}

      {/* Painel de nota interna */}
      {showNotes && (
        <div style={{
          width: '100%',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          paddingTop: 4,
        }}>
          <textarea
            value={draftNotes}
            onChange={e => setDraftNotes(e.target.value)}
            placeholder="Nota interna (visível só para a equipe)..."
            rows={2}
            className="input"
            style={{ flex: 1, fontSize: 12, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="btn-primary"
              style={{ fontSize: 11, padding: '6px 10px' }}
              onClick={() => { onSaveNotes?.(draftNotes); setShowNotes(false); }}
            >
              Salvar
            </button>
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: '6px 10px' }}
              onClick={() => setShowNotes(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
