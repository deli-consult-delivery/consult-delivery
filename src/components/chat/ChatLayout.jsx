import { useState } from 'react';

/**
 * Layout 3-colunas do Chat Ao Vivo.
 * - Coluna esquerda: lista de conversas (min 260px, padrão 300px)
 * - Coluna centro:   janela de conversa (flex-grow)
 * - Coluna direita:  painel do lead (min 280px, padrão 320px) — colapsável
 *
 * Em mobile (<768px): coluna direita oculta automaticamente.
 */
export default function ChatLayout({
  conversationList,
  conversationWindow,
  leadPanel,
  isLeadPanelOpen = true,
  onToggleLeadPanel,
}) {
  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--g-50)',
    }}>
      {/* Coluna esquerda — lista de conversas */}
      <div style={{
        width: 300,
        minWidth: 260,
        maxWidth: 380,
        borderRight: '1px solid var(--g-200)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--white)',
      }}>
        {conversationList}
      </div>

      {/* Coluna centro — janela de conversa */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {conversationWindow}

        {/* Botão toggle painel lead (canto sup direito) */}
        {onToggleLeadPanel && (
          <button
            onClick={onToggleLeadPanel}
            title={isLeadPanelOpen ? 'Ocultar painel' : 'Mostrar painel'}
            style={{
              position: 'absolute',
              top: 12,
              right: isLeadPanelOpen ? 328 : 12,
              zIndex: 10,
              background: 'var(--white)',
              border: '1px solid var(--g-200)',
              borderRadius: 'var(--r-sm)',
              width: 28,
              height: 28,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'right 200ms ease',
              color: 'var(--g-600)',
              fontSize: 12,
            }}
          >
            {isLeadPanelOpen ? '›' : '‹'}
          </button>
        )}
      </div>

      {/* Coluna direita — painel do lead */}
      <div
        className="chat-lead-panel-col"
        style={{
          width: isLeadPanelOpen ? 320 : 0,
          minWidth: 0,
          overflow: 'hidden',
          borderLeft: isLeadPanelOpen ? '1px solid var(--g-200)' : 'none',
          transition: 'width 200ms ease',
          flexShrink: 0,
          background: 'var(--white)',
        }}
      >
        <div style={{ width: 320 }}>
          {leadPanel}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .chat-lead-panel-col {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
