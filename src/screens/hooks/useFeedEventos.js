import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const AGENT_LABELS = {
  'deli-conversa':           'DELI respondeu uma pergunta',
  'deli-revisao-matinal':    'DELI gerou revisão matinal',
  'deli-supervisionar':      'DELI supervisionou agentes',
  'lara-pesquisar-loja':     'LARA pesquisou loja iFood',
  'lara-gerar-conteudo':     'LARA gerou conteúdo',
  'lara-analisar-tendencia': 'LARA analisou tendências',
  'cora-analisar-devedor':   'CORA analisou devedor',
  'cora-gerar-mensagem':     'CORA gerou mensagem de cobrança',
  'cora-criar-cobranca':     'CORA criou cobrança no Asaas',
  'sofia-pesquisar-prospect':'SOFIA pesquisou prospect',
  'sofia-qualificar':        'SOFIA qualificou prospect',
  'sofia-gerar-abordagem':   'SOFIA gerou abordagem',
  'vera-snapshot-diario':    'VERA coletou métricas do dia',
  'vera-relatorio-diario':   'VERA gerou relatório diário',
  'vera-detectar-anomalia':  'VERA detectou anomalia',
  'vera-responder-pergunta': 'VERA respondeu análise',
  'breno-responder':         'BRENO respondeu cliente',
  'breno-resumir-conversa':  'BRENO resumiu conversa',
  'max-diagnostico':         'MAX diagnosticou problema',
  'max-tutorial':            'MAX gerou tutorial',
  'analise-ifood-run':       'Análise iFood executada',
};

// Extrai o prefixo do agente para uso no AgentAvatar e na lista AGENTS
// 'deli-conversa' → 'deli', 'vera-snapshot-diario' → 'vera', etc.
function agentPrefix(agentId) {
  if (!agentId) return 'deli';
  if (agentId === 'analise-ifood-run') return 'deli';
  return agentId.split('-')[0];
}

function relativeTime(isoString) {
  if (!isoString) return '';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60)    return 'agora';
  if (diffSec < 3600)  return `há ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
  return `há ${Math.floor(diffSec / 86400)}d`;
}

function buildCta(run) {
  if (run.agent_id === 'vera-detectar-anomalia' && run.status === 'failed') {
    return { text: 'Ver anomalia', screen: 'vera' };
  }
  if (run.agent_id === 'cora-criar-cobranca' && run.output?.cobranca_id) {
    return { text: 'Ver cobrança', screen: 'cora' };
  }
  if (run.agent_id === 'breno-responder' && run.output?.conversation_id) {
    return { text: 'Ver conversa', screen: 'chat' };
  }
  return null;
}

function mapRunToEvent(run) {
  return {
    id:     run.id,
    label:  AGENT_LABELS[run.agent_id] ?? run.agent_id,
    agente: agentPrefix(run.agent_id),
    status: run.status,
    ts:     relativeTime(run.created_at),
    cta:    buildCta(run),
  };
}

/**
 * Busca as últimas 20 runs do tenant e mantém o feed atualizado via Realtime.
 *
 * Retorna { events, loading }.
 * Cada event: { id, label, agente, status, ts, cta? }
 */
export function useFeedEventos(tenantDbId) {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent_id, status, created_at, output')
        .eq('tenant_id', tenantDbId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setEvents((data ?? []).map(mapRunToEvent));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: prepend cada INSERT novo ao feed (mantém máximo de 20 itens)
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase
      .channel(`feed-eventos-${tenantDbId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_runs',
          filter: `tenant_id=eq.${tenantDbId}` },
        (p) => {
          setEvents(prev => [mapRunToEvent(p.new), ...prev].slice(0, 20));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId]);

  return { events, loading };
}
