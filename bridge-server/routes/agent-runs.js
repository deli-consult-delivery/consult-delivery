'use strict';

const express = require('express');

module.exports = function buildAgentRunsRouter({ requireJwt, sbFetch, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── GET /api/agent-runs/stats — estatísticas agregadas ───────────────────
  // Deve vir ANTES de /agent-runs/:id para evitar conflito de rota
  router.get('/agent-runs/stats', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      // Busca todos os runs do tenant para computar stats (limit alto)
      const rows = await sbFetch(
        `agent_runs?tenant_id=eq.${tenantId}&select=id,agent_id,status,cost_usd,created_at&order=created_at.desc&limit=1000`
      );
      const runs = rows || [];

      const total_runs    = runs.length;
      const succeeded     = runs.filter(r => r.status === 'success').length;
      const success_rate  = total_runs > 0 ? Math.round((succeeded / total_runs) * 100) : 0;
      const total_cost    = runs.reduce((acc, r) => acc + (parseFloat(r.cost_usd) || 0), 0);
      const avg_cost      = total_runs > 0 ? total_cost / total_runs : 0;

      // Runs hoje (UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const runs_today = runs.filter(r => r.created_at && new Date(r.created_at) >= todayStart).length;

      // Top agentes por contagem
      const agentCounts = {};
      for (const r of runs) {
        const slug = r.agent_id || 'desconhecido';
        agentCounts[slug] = (agentCounts[slug] || 0) + 1;
      }
      const top_agents = Object.entries(agentCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([agent_slug, count]) => ({ agent_slug, count }));

      res.json({
        total_runs,
        success_rate,
        avg_cost_usd: parseFloat(avg_cost.toFixed(6)),
        total_cost_usd: parseFloat(total_cost.toFixed(6)),
        runs_today,
        top_agents,
      });
    } catch (err) {
      console.error('[agent-runs/stats GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/agent-runs — listar runs com filtros ─────────────────────────
  router.get('/agent-runs', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const limit  = Math.min(parseInt(req.query.limit  || '50',  10), 200);
      const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);

      let qs = `agent_runs?tenant_id=eq.${tenantId}&order=created_at.desc&limit=${limit}&offset=${offset}`;
      qs += '&select=id,agent_id,status,input,output,cost_usd,duration_ms,created_at,completed_at';

      if (req.query.agent_slug) {
        qs += `&agent_id=eq.${encodeURIComponent(req.query.agent_slug)}`;
      }
      if (req.query.status) {
        const validStatuses = ['queued', 'running', 'success', 'failed'];
        if (!validStatuses.includes(req.query.status)) {
          return res.status(400).json({ error: `status inválido. Use: ${validStatuses.join(', ')}` });
        }
        qs += `&status=eq.${encodeURIComponent(req.query.status)}`;
      }

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[agent-runs GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
