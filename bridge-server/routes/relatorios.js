'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Relatórios — Dashboard consolidado por tenant
//
// Endpoints:
//   GET /api/relatorios/dashboard — métricas + chart tarefas por dia
//
// Query params:
//   tenant_id (required) — UUID do tenant
//   periodo   (optional) — 7 | 30 | 90, default 30 (dias para filtro geral)
//   loja_id   (optional) — filtra métricas de tarefas/analises a 1 loja
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

function buildRelatoriosRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ── helpers ────────────────────────────────────────────────────────────────

  function diasAtras(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  }

  // PostgREST aggregate: select=count() retorna [{ count: "N" }]
  function parseCount(rows) {
    return parseInt((Array.isArray(rows) ? rows[0]?.count : rows?.count) || '0') || 0;
  }

  // ── GET /api/relatorios/dashboard ──────────────────────────────────────────

  router.get('/relatorios/dashboard', requireJwt, async (req, res) => {
    const { tenant_id, periodo = '30', loja_id } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id obrigatório' });
    }

    try {
      if (!await assertTenantMember(req, res, tenant_id)) return;

      const dias   = Math.max(1, parseInt(periodo) || 30);
      const d7     = diasAtras(7);
      const d30    = diasAtras(30);
      const dPer   = diasAtras(dias);

      // 1. Busca IDs de lojas ativas do tenant (para filtrar tarefas / analises)
      let lojasQs = `tenant_id=eq.${tenant_id}&is_active=eq.true&select=id`;
      if (loja_id) lojasQs += `&id=eq.${encodeURIComponent(loja_id)}`;

      const lojasRows = await sbFetch(`lojas?${lojasQs}`);
      const lojaIds   = (lojasRows || []).map(r => r.id);
      const idsStr    = lojaIds.length ? lojaIds.join(',') : '';

      // 2. Queries paralelas
      const noLojas = !lojaIds.length;

      const [
        lojasAtivasRows,
        concluidas7dRows,
        concluidas30dRows,
        todasPeriodoRows,
        conclPeriodoRows,
        analises30dRows,
        contratos30dRows,
        onboardingRows,
        tarefasDiasRows,
      ] = await Promise.all([
        // lojas_ativas — total do tenant (sem filtro de loja_id)
        sbFetch(`lojas?tenant_id=eq.${tenant_id}&is_active=eq.true&select=count()`),

        // tarefas_concluidas_7d
        noLojas ? Promise.resolve([{ count: '0' }]) :
          sbFetch(`tarefas_loja?loja_id=in.(${idsStr})&status=eq.concluida&concluida_em=gte.${d7}&select=count()`),

        // tarefas_concluidas_30d
        noLojas ? Promise.resolve([{ count: '0' }]) :
          sbFetch(`tarefas_loja?loja_id=in.(${idsStr})&status=eq.concluida&concluida_em=gte.${d30}&select=count()`),

        // total tarefas do período (não rascunho) — para taxa_conclusao
        noLojas ? Promise.resolve([{ count: '0' }]) :
          sbFetch(`tarefas_loja?loja_id=in.(${idsStr})&status=neq.rascunho&created_at=gte.${dPer}&select=count()`),

        // concluídas no período — para taxa_conclusao
        noLojas ? Promise.resolve([{ count: '0' }]) :
          sbFetch(`tarefas_loja?loja_id=in.(${idsStr})&status=eq.concluida&created_at=gte.${dPer}&select=count()`),

        // analises_processadas_30d
        sbFetch(`analises?tenant_id=eq.${tenant_id}&status=in.(processada,done)&created_at=gte.${d30}&select=count()`),

        // contratos_assinados_30d
        sbFetch(`contratos?tenant_id=eq.${tenant_id}&status=eq.assinado&assinado_em=gte.${d30}&select=count()`),

        // onboarding_em_andamento — customer_ids únicos com checklist ativo
        sbFetch(`onboarding_checklists?tenant_id=eq.${tenant_id}&status=in.(pendente,em_andamento)&select=customer_id`),

        // tarefas por dia (30d) para o chart — retorna concluida_em de cada row
        noLojas ? Promise.resolve([]) :
          sbFetch(`tarefas_loja?loja_id=in.(${idsStr})&status=eq.concluida&concluida_em=gte.${d30}&select=concluida_em&order=concluida_em.asc&limit=1000`),
      ]);

      // 3. Calcula métricas
      const totalPeriodo = parseCount(todasPeriodoRows);
      const conclPeriodo = parseCount(conclPeriodoRows);
      const taxa_conclusao = totalPeriodo > 0
        ? Math.round((conclPeriodo / totalPeriodo) * 100)
        : 0;

      const uniqueOnboarding = new Set(
        (onboardingRows || []).map(r => r.customer_id).filter(Boolean)
      ).size;

      // 4. Monta chart: tarefas concluídas por dia (últimos 30d)
      const chartMap = {};
      for (const t of (tarefasDiasRows || [])) {
        if (!t.concluida_em) continue;
        const dia = t.concluida_em.slice(0, 10);
        chartMap[dia] = (chartMap[dia] || 0) + 1;
      }
      const tarefasPorDia = [];
      for (let i = 29; i >= 0; i--) {
        const dia = diasAtras(i).slice(0, 10);
        tarefasPorDia.push({ dia, concluidas: chartMap[dia] || 0 });
      }

      res.json({
        metrics: {
          tarefas_concluidas_7d:    parseCount(concluidas7dRows),
          tarefas_concluidas_30d:   parseCount(concluidas30dRows),
          taxa_conclusao,
          analises_processadas_30d: parseCount(analises30dRows),
          lojas_ativas:             parseCount(lojasAtivasRows),
          contratos_assinados_30d:  parseCount(contratos30dRows),
          onboarding_em_andamento:  uniqueOnboarding,
        },
        charts: [
          {
            id:    'tarefas_por_dia',
            label: 'Tarefas concluídas por dia (30d)',
            data:  tarefasPorDia,
          },
        ],
        periodo: dias,
        gerado_em: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[relatorios/dashboard]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = buildRelatoriosRouter;
