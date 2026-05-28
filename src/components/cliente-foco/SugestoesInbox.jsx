/**
 * MIA-03: Inbox de sugestões IA pendentes
 *
 * - Carrega sugestoes_ia?status=pendente para a loja
 * - Supabase Realtime: canal "sugestoes-ia-{tenantId}-{lojaId}-inbox"
 *   (suffix "-inbox" por componente — anti-bug PR #94)
 * - Aprovar: chama aprovarSugestao → atualiza lista localmente
 * - Rejeitar: chama rejeitarSugestao → remove da lista
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { getSugestoes, aprovarSugestao, rejeitarSugestao } from '../../lib/miaApi.js';
import SugestaoCard from './SugestaoCard.jsx';

export default function SugestoesInbox({ lojaId, tenantId, conversaId }) {
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | fact | tarefa

  const load = useCallback(async () => {
    if (!lojaId) return;
    setLoading(true);
    try {
      const data = await getSugestoes(lojaId, { status: 'pendente' });
      setSugestoes(data || []);
    } catch (err) {
      console.error('[SugestoesInbox] load:', err.message);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  // Carrega on mount e quando lojaId muda
  useEffect(() => { load(); }, [load]);

  // Supabase Realtime — suffix "-inbox" por componente (anti-bug PR #94)
  useEffect(() => {
    if (!lojaId || !tenantId) return;

    const channelName = `sugestoes-ia-${tenantId}-${lojaId}-inbox`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'sugestoes_ia',
        filter: `loja_id=eq.${lojaId}`,
      }, (payload) => {
        if (payload.new?.status === 'pendente') {
          setSugestoes(prev => [payload.new, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lojaId, tenantId]);

  async function handleAprovar(id, textoEditado) {
    await aprovarSugestao(id, textoEditado);
    setSugestoes(prev => prev.filter(s => s.id !== id));
  }

  async function handleRejeitar(id) {
    await rejeitarSugestao(id);
    setSugestoes(prev => prev.filter(s => s.id !== id));
  }

  const filtradas = filtroTipo === 'todos'
    ? sugestoes
    : sugestoes.filter(s => s.tipo === filtroTipo);

  return (
    <div>
      {/* Header + filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
          🤖 Sugestões IA
        </span>
        {sugestoes.length > 0 && (
          <span style={{
            background: '#B70C00', color: 'white',
            borderRadius: 9999, fontSize: 10, fontWeight: 700,
            padding: '1px 6px',
          }}>
            {sugestoes.length}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['todos', 'fact', 'tarefa'].map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 4,
                border: filtroTipo === t ? '1px solid #B70C00' : '1px solid rgba(255,255,255,0.1)',
                background: filtroTipo === t ? 'rgba(183,12,0,0.2)' : 'transparent',
                color: filtroTipo === t ? '#FF6B6B' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
              }}
            >
              {t === 'todos' ? 'Tudo' : t === 'fact' ? 'Fatos' : 'Tarefas'}
            </button>
          ))}
          <button
            onClick={load}
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
            }}
            title="Recarregar"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
          Carregando…
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
          {sugestoes.length === 0
            ? 'Nenhuma sugestão pendente'
            : `Nenhuma sugestão do tipo "${filtroTipo}"`}
        </div>
      ) : filtradas.map(s => (
        <SugestaoCard
          key={s.id}
          sugestao={s}
          onAprovada={handleAprovar}
          onRejeitada={handleRejeitar}
        />
      ))}
    </div>
  );
}
