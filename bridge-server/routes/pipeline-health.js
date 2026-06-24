'use strict';

// GET /api/pipeline/health?days=7
// Agrega dados de agent_runs: total, taxa de sucesso, avg duração, agentes mais ativos.
// Auth: requireJwt (tenant isolado pelo JWT).

const express = require('express');

module.exports = function buildPipelineHealthRouter({ requireJwt, sbFetch, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  router.get('/pipeline/health', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const days = Math.min(Math.max(parseInt(req.query.days || '7', 10), 1), 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      if (!SUPABASE_SERVICE_KEY) {
        return res.status(503).json({ error: 'service key ausente' });
      }

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_runs?tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(since)}&select=id,agent_id,status,duration_ms&limit=2000`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (!r.ok) throw new Error(`agent_runs query ${r.status}: ${await r.text()}`);

      const runs = await r.json();

      const total = runs.length;
      const successCount = runs.filter(r => r.status === 'success').length;
      const failedCount  = runs.filter(r => r.status === 'failed').length;

      const withDuration = runs.filter(r => r.duration_ms != null);
      const avgDuration  = withDuration.length > 0
        ? Math.round(withDuration.reduce((acc, r) => acc + r.duration_ms, 0) / withDuration.length)
        : null;

      // Agentes mais ativos
      const agentCounts = {};
      for (const r of runs) {
        if (!r.agent_id) continue;
        agentCounts[r.agent_id] = (agentCounts[r.agent_id] || 0) + 1;
      }
      const topAgents = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([agentId, count]) => ({ agent_id: agentId, count }));

      res.json({
        period_days: days,
        total_runs:    total,
        success_count: successCount,
        failed_count:  failedCount,
        success_rate:  total > 0 ? Math.round((successCount / total) * 100) : null,
        avg_duration_ms: avgDuration,
        top_agents: topAgents,
      });
    } catch (err) {
      console.error('[pipeline-health]', err.message);
      res.status(500).json({ error: 'Erro interno ao calcular saúde do pipeline' });
    }
  });

  return router;
};
