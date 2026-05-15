import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const STALE_MS = 60_000; // revalida após 1 min sem recarregar

/**
 * Busca todos os dados reais do dashboard em paralelo.
 *
 * Fontes:
 *  - conversations         → convs ativas + não lidas
 *  - vera_anomalias        → alertas críticos (SLA proxy)
 *  - cora_cobrancas        → inadimplência e valor recuperado hoje
 *  - vera_metricas_snapshot → KPIs consolidados (pedidos, ticket, chart 7d, etc.)
 *  - agent_runs            → status "working" de agentes (últimas 24h)
 *  - tasks / tarefas       → tarefas pendentes + urgentes
 *  - prospects             → prospects novos
 *
 * Retorna { data, loading, error, reload }.
 * `data` tem shape estável mesmo quando vazio — o componente não precisa de guards.
 */
export function useDashboardData(tenantDbId) {
  const [state, setState] = useState({
    data: buildEmpty(),
    loading: true,
    error: null,
  });
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const yesterday = new Date(todayStart);
      yesterday.setDate(yesterday.getDate() - 1);

      const sevenDaysAgo = new Date(todayStart);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [
        convsRes,
        anomaliasRes,
        cobrancasRes,
        cobrancasPagasHojeRes,
        snapshotsRes,
        agentRunsRes,
        tasksRes,
        prospectsHojeRes,
      ] = await Promise.all([
        // Conversas ativas do tenant (excluindo fechadas/arquivadas)
        supabase
          .from('conversations')
          .select('id, unread_count, status, updated_at')
          .eq('tenant_id', tenantDbId)
          .not('status', 'in', '("fechado","finalizado","arquivado","archived","closed")'),

        // Anomalias críticas abertas (proxy para SLA)
        supabase
          .from('vera_anomalias')
          .select('id, severidade, resolvida')
          .eq('tenant_id', tenantDbId)
          .eq('resolvida', false),

        // Cobranças abertas (inadimplência)
        supabase
          .from('cora_cobrancas')
          .select('id, valor_atual, status')
          .eq('tenant_id', tenantDbId)
          .in('status', ['aberto', 'negociando', 'escalonado']),

        // Cobranças pagas hoje (valor recuperado)
        supabase
          .from('cora_cobrancas')
          .select('valor_atual')
          .eq('tenant_id', tenantDbId)
          .eq('status', 'pago')
          .gte('updated_at', todayIso),

        // Snapshots VERA dos últimos 7 dias
        supabase
          .from('vera_metricas_snapshot')
          .select('data, metricas')
          .eq('tenant_id', tenantDbId)
          .gte('data', sevenDaysAgo.toISOString().slice(0, 10))
          .order('data', { ascending: true })
          .limit(7),

        // Runs de agentes nas últimas 24h para indicar status
        supabase
          .from('agent_runs')
          .select('agent_id, status, created_at, completed_at')
          .eq('tenant_id', tenantDbId)
          .gte('created_at', yesterday.toISOString())
          .order('created_at', { ascending: false })
          .limit(100),

        // Tarefas de análise não-concluídas (tarefas_analise via RLS de tenant)
        supabase
          .from('tarefas_analise')
          .select('id, titulo, descricao, urgencia, status, created_at')
          .neq('status', 'concluida')
          .limit(50),

        // Prospects criados hoje
        supabase
          .from('prospects')
          .select('id')
          .eq('tenant_id', tenantDbId)
          .gte('created_at', todayIso),
      ]);

      // Lança o primeiro erro encontrado (se houver)
      const firstError = [
        convsRes, anomaliasRes, cobrancasRes, cobrancasPagasHojeRes,
        snapshotsRes, agentRunsRes, tasksRes, prospectsHojeRes,
      ].find(r => r.error)?.error;
      if (firstError) throw firstError;

      const data = buildData({
        convs: convsRes.data ?? [],
        anomalias: anomaliasRes.data ?? [],
        cobrancas: cobrancasRes.data ?? [],
        cobrancasPagasHoje: cobrancasPagasHojeRes.data ?? [],
        snapshots: snapshotsRes.data ?? [],
        agentRuns: agentRunsRes.data ?? [],
        tasks: tasksRes.data ?? [],
        prospectsHoje: prospectsHojeRes.data ?? [],
      });

      setState({ data, loading: false, error: null });
      setLastFetch(Date.now());
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.message ?? 'Erro ao carregar dashboard' }));
    }
  }, [tenantDbId]);

  // Carrega na montagem e quando tenantDbId muda
  useEffect(() => {
    load();
  }, [load]);

  // Revalida silenciosamente após STALE_MS
  useEffect(() => {
    if (!tenantDbId) return;
    const interval = setInterval(() => {
      if (Date.now() - lastFetch >= STALE_MS) load();
    }, STALE_MS);
    return () => clearInterval(interval);
  }, [tenantDbId, lastFetch, load]);

  return { ...state, reload: load };
}

// ─── Builders ────────────────────────────────────────────────────────────────

function buildEmpty() {
  return {
    convs: {
      total: 0,
      unread: 0,
    },
    slaCount: 0,
    cobrancas: {
      totalAberto: 0,
      valorAberto: 0,
      recuperadoHoje: 0,
    },
    kpis: {
      pedidos:      { value: '–',  delta: '–', trend: 'neutral' },
      ticket:       { value: '–',  delta: '–', trend: 'neutral' },
      tarefas:      { value: 0,   delta: '0 urgentes', trend: 'neutral' },
      inadimplencia:{ value: '–',  delta: '–', trend: 'neutral' },
    },
    chart7d: [0, 0, 0, 0, 0, 0, 0],
    agentStatus: buildDefaultAgentStatus(),
    tasks: {
      total: 0,
      urgentes: [],
      overdue: 0,
    },
    prospectsHoje: 0,
    deliSummary: buildDeliSummary({ convs: [], cobrancasPagasHoje: [], tasks: [], prospectsHoje: 0 }),
    hasRealData: false,
  };
}

function buildData({ convs, anomalias, cobrancas, cobrancasPagasHoje, snapshots, agentRuns, tasks, prospectsHoje }) {
  // ── Conversas ──
  const convsData = {
    total: convs.length,
    unread: convs.filter(c => (c.unread_count ?? 0) > 0).length,
  };

  // ── SLA proxy: anomalias críticas abertas ──
  const slaCount = anomalias.filter(a => a.severidade === 'critical').length;

  // ── Cobranças ──
  const valorAberto = cobrancas.reduce((sum, c) => sum + Number(c.valor_atual ?? 0), 0);
  const recuperadoHoje = cobrancasPagasHoje.reduce((sum, c) => sum + Number(c.valor_atual ?? 0), 0);

  // ── Snapshots VERA → KPIs + chart ──
  const latestSnap = snapshots[snapshots.length - 1]?.metricas ?? {};
  const prevSnap   = snapshots[snapshots.length - 2]?.metricas ?? {};

  const pedidosHoje  = latestSnap.pedidos_hoje   ?? latestSnap.num_pedidos      ?? null;
  const pedidOntem   = prevSnap.pedidos_hoje      ?? prevSnap.num_pedidos        ?? null;
  const ticketMedio  = latestSnap.ticket_medio    ?? null;
  const ticketOntem  = prevSnap.ticket_medio      ?? null;

  // Derivar delta de pedidos
  const pedidosDelta = deriveDelta(pedidosHoje, pedidOntem);
  const ticketDelta  = deriveDelta(ticketMedio, ticketOntem);

  // chart7d: tenta extrair do campo pedidos_por_dia ou dos snapshots diários
  const chart7d = buildChart7d(snapshots, latestSnap);

  // ── Tarefas (tarefas_analise: urgencia='alta', mapeado para o shape do DashboardScreen) ──
  const urgentes = tasks
    .filter(t => t.urgencia === 'alta')
    .slice(0, 3)
    .map(t => ({
      id: t.id,
      title: t.titulo,
      desc: t.descricao ?? '',
      col: t.status === 'concluida' ? 'done' : 'todo',
      priority: 'high',
      due: null,
      assignee: null,
      agent: null,
      comments: 0,
      attachments: 0,
    }));
  const overdue = 0; // tarefas_analise não tem due_date

  // ── Status de agentes baseado em runs recentes ──
  const agentStatus = buildAgentStatus(agentRuns);

  // ── Inadimplência ──
  const inadimplFmt = cobrancas.length > 0
    ? `${cobrancas.length} em aberto`
    : '0 em aberto';
  const inadimplDelta = valorAberto > 0
    ? `R$ ${fmtBrl(valorAberto)} a receber`
    : 'tudo em dia';

  const kpis = {
    pedidos: {
      value: pedidosHoje !== null ? String(pedidosHoje) : '–',
      delta: pedidosDelta.label,
      trend: pedidosDelta.trend,
    },
    ticket: {
      value: ticketMedio !== null ? `R$ ${fmtBrl(ticketMedio)}` : '–',
      delta: ticketDelta.label,
      trend: ticketDelta.trend,
    },
    tarefas: {
      value: tasks.length,
      delta: `${urgentes.length} urgente${urgentes.length !== 1 ? 's' : ''}`,
      trend: urgentes.length > 0 ? 'down' : 'neutral',
    },
    inadimplencia: {
      value: inadimplFmt,
      delta: inadimplDelta,
      trend: cobrancas.length > 0 ? 'down' : 'up',
    },
  };

  return {
    convs: convsData,
    slaCount,
    cobrancas: { totalAberto: cobrancas.length, valorAberto, recuperadoHoje },
    kpis,
    chart7d,
    agentStatus,
    tasks: { total: tasks.length, urgentes, overdue },
    prospectsHoje: prospectsHoje.length,
    deliSummary: buildDeliSummary({
      convs,
      cobrancasPagasHoje,
      tasks: urgentes,
      prospectsHoje: prospectsHoje.length,
    }),
    hasRealData: snapshots.length > 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildChart7d(snapshots, latestSnap) {
  // Opção 1: campo pedidos_por_dia no snapshot mais recente (array de 7 valores)
  if (Array.isArray(latestSnap.pedidos_por_dia) && latestSnap.pedidos_por_dia.length === 7) {
    return latestSnap.pedidos_por_dia;
  }
  // Opção 2: um valor por snapshot (um ponto = um dia)
  if (snapshots.length > 0) {
    const vals = snapshots.map(s => s.metricas?.pedidos_hoje ?? s.metricas?.num_pedidos ?? 0);
    while (vals.length < 7) vals.unshift(0);
    return vals.slice(-7);
  }
  return [0, 0, 0, 0, 0, 0, 0];
}

const AGENT_IDS = ['deli', 'cora', 'lara', 'sofia', 'breno', 'max', 'vera'];

function buildDefaultAgentStatus() {
  return AGENT_IDS.map(id => ({ id, status: 'idle', task: null, lastRun: null }));
}

function buildAgentStatus(runs) {
  // Agrupa último run por agente
  const byAgent = {};
  for (const run of runs) {
    const id = run.agent_id;
    if (!byAgent[id]) byAgent[id] = run;
  }

  return AGENT_IDS.map(id => {
    const lastRun = byAgent[id] ?? null;
    const isWorking = lastRun && lastRun.status === 'running';
    return {
      id,
      status: isWorking ? 'working' : 'idle',
      task: isWorking ? 'Executando tarefa…' : null,
      lastRun: lastRun?.created_at ?? null,
    };
  });
}

function buildDeliSummary({ convs, cobrancasPagasHoje, tasks, prospectsHoje }) {
  const recuperado = Array.isArray(cobrancasPagasHoje)
    ? cobrancasPagasHoje.reduce((s, c) => s + Number(c.valor_atual ?? 0), 0)
    : 0;
  const criticas = Array.isArray(convs) ? convs.filter(c => (c.unread_count ?? 0) > 3).length : 0;

  return {
    recuperadoHoje: recuperado,
    conversas: Array.isArray(convs) ? convs.length : 0,
    criticas,
    tarefasUrgentes: Array.isArray(tasks) ? tasks.length : 0,
    prospectsHoje: typeof prospectsHoje === 'number' ? prospectsHoje : 0,
  };
}

function deriveDelta(current, previous) {
  if (current === null) return { label: '–', trend: 'neutral' };
  if (previous === null || previous === 0) return { label: 'sem comparativo', trend: 'neutral' };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const sign = pct >= 0 ? '+' : '';
  return {
    label: `${sign}${pct}% vs ontem`,
    trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
  };
}


function fmtBrl(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '–';
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return n.toFixed(2).replace('.', ',');
}
