/**
 * MIA-03: TarefasResumo — top 5 tarefas abertas da loja
 * Link "ver todas" aponta para /tarefas?loja=:id
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const STATUS_COLOR = {
  rascunho:              '#6B7280',
  aguardando_envio:      '#F59E0B',
  aguardando_aprovacao:  '#F59E0B',
  aprovada:              '#22C55E',
  em_execucao:           '#3B82F6',
  aguardando_validacao:  '#8B5CF6',
};

export default function TarefasResumo({ lojaId }) {
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lojaId) return;
    let cancelled = false;

    setLoading(true);
    supabase
      .from('tarefas_loja')
      .select('id, titulo, status, prioridade, criado_por_ia')
      .eq('loja_id', lojaId)
      .not('status', 'in', '("concluida","cancelada")')
      .order('criado_por_ia', { ascending: false }) // IA primeiro
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setTarefas(data || []);
      })
      .catch(() => { if (!cancelled) setTarefas([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [lojaId]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
          ✅ Tarefas abertas
        </span>
        <a
          href={`/tarefas?loja=${lojaId}`}
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: '#B70C00',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Ver todas →
        </a>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: 12 }}>
          Carregando…
        </div>
      ) : tarefas.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
          Nenhuma tarefa aberta
        </div>
      ) : tarefas.map(t => (
        <div key={t.id} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 7,
          padding: '6px 0',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: STATUS_COLOR[t.status] || '#6B7280',
            flexShrink: 0,
            marginTop: 3,
          }} />
          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.75)',
            flex: 1,
            lineHeight: 1.4,
          }}>
            {t.titulo}
          </span>
          {t.criado_por_ia && (
            <span style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.3)',
              fontWeight: 700,
              flexShrink: 0,
            }}>
              IA
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
