/**
 * MIA-03: Card de 1 sugestão IA (fact ou tarefa)
 * Ações: aprovar (com edição opcional) | rejeitar
 */

import { useState } from 'react';

const CONFIANCA_COLOR = { alta: '#22C55E', media: '#F59E0B', baixa: '#EF4444' };
const TIPO_ICON = { fact: '📋', tarefa: '✅' };

export default function SugestaoCard({ sugestao, onAprovada, onRejeitada }) {
  const [editando, setEditando]   = useState(false);
  const [texto, setTexto]         = useState(sugestao.conteudo);
  const [loading, setLoading]     = useState(false);

  async function aprovar() {
    setLoading(true);
    try {
      await onAprovada(sugestao.id, editando && texto !== sugestao.conteudo ? texto : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function rejeitar() {
    setLoading(true);
    try {
      await onRejeitada(sugestao.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      {/* Cabeçalho: tipo + confiança */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12 }}>{TIPO_ICON[sugestao.tipo] || '💡'}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: CONFIANCA_COLOR[sugestao.confianca] || '#fff',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          {sugestao.confianca}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
          {sugestao.tipo === 'fact' ? 'Fato' : 'Tarefa'}
        </span>
      </div>

      {/* Conteúdo / editor */}
      {editando ? (
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 5,
            color: 'white',
            fontSize: 12,
            padding: '6px 8px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <p style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.85)',
          margin: '0 0 6px 0',
          lineHeight: 1.5,
        }}>
          {sugestao.conteudo}
        </p>
      )}

      {/* Evidência */}
      {sugestao.evidencia?.trecho && (
        <p style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
          fontStyle: 'italic',
          margin: '4px 0 8px',
          borderLeft: '2px solid rgba(255,255,255,0.12)',
          paddingLeft: 6,
        }}>
          "{sugestao.evidencia.trecho}"
        </p>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={aprovar}
          disabled={loading}
          style={{
            flex: 1,
            padding: '5px 0',
            background: loading ? 'rgba(34,197,94,0.25)' : '#22C55E',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '…' : editando ? 'Salvar e aprovar' : 'Aprovar'}
        </button>

        {!editando && (
          <button
            onClick={() => setEditando(true)}
            disabled={loading}
            style={{
              padding: '5px 10px',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✏️
          </button>
        )}

        {editando && (
          <button
            onClick={() => { setEditando(false); setTexto(sugestao.conteudo); }}
            disabled={loading}
            style={{
              padding: '5px 10px',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        )}

        <button
          onClick={rejeitar}
          disabled={loading}
          style={{
            padding: '5px 10px',
            background: 'rgba(239,68,68,0.12)',
            color: '#EF4444',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 5,
            fontSize: 11,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          ✗
        </button>
      </div>
    </div>
  );
}
