// routes/loop-despachar.js — POST /loop/despachar
//
// REGRA ÚNICA de despacho do loop AI-First (Blueprint v2 §5/§6): cria uma tarefa
// (client_tasks, loop_state='open') despachando um especialista para uma demanda
// de cliente. Antes a regra vivia no admin-mcp (cd_despachar_especialista); agora
// mora AQUI, no Bridge, como API estável que TANTO o Hermes (via MCP) QUANTO o
// Trigger.dev chamam — uma só implementação, sem drift.
//
// Auth: requireInternalToken (x-internal-token). Caminho interno, nunca exposto a
// cliente. Validação no boundary (uuid/slug/descricao). O especialista é validado
// contra tenant_agents habilitados (cobre os 12 do org-chart, sem enum hardcoded).
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9_-]+$/;
const TARGET_SYSTEMS = new Set(['vendaerp', 'asaas', 'nenhum']);

module.exports = ({ requireInternalToken, sbFetch, supabaseInsert }) => {
  const express = require('express');
  const router = express.Router();

  router.post('/despachar', requireInternalToken, async (req, res) => {
    try {
      const { tenant_id, loja_id, especialista, descricao } = req.body || {};
      const target_system = req.body?.target_system ?? 'nenhum';

      // ── Validação no boundary ──────────────────────────────────────────────
      if (!UUID_RE.test(String(tenant_id || ''))) {
        return res.status(400).json({ error: 'tenant_id inválido (uuid)' });
      }
      if (!UUID_RE.test(String(loja_id || ''))) {
        return res.status(400).json({ error: 'loja_id inválido (uuid)' });
      }
      if (typeof especialista !== 'string' || !SLUG_RE.test(especialista)) {
        return res.status(400).json({ error: 'especialista inválido (slug)' });
      }
      if (typeof descricao !== 'string' || descricao.trim().length < 10) {
        return res.status(400).json({ error: 'descricao obrigatória (mínimo 10 caracteres)' });
      }
      if (!TARGET_SYSTEMS.has(target_system)) {
        return res.status(400).json({ error: 'target_system inválido (vendaerp|asaas|nenhum)' });
      }

      // 1. Resolver customer_id a partir da loja (FK: lojas.client_id → customers.id)
      const lojas = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(loja_id)}&select=id,nome,client_id&limit=1`
      );
      if (!lojas?.length) {
        return res.status(404).json({ error: `loja ${loja_id} não encontrada` });
      }
      const loja = lojas[0];
      if (!loja.client_id) {
        return res.status(409).json({
          error: `loja ${loja_id} (${loja.nome ?? 'sem nome'}) não tem customer vinculado (client_id=null)`,
        });
      }

      // 2. Validar especialista contra o catálogo habilitado do tenant (tenant_agents)
      const habilitado = await sbFetch(
        `tenant_agents?tenant_id=eq.${encodeURIComponent(tenant_id)}` +
          `&agent_id=eq.${encodeURIComponent(especialista)}&enabled=eq.true&select=agent_id&limit=1`
      );
      if (!habilitado?.length) {
        return res.status(409).json({
          error: `especialista '${especialista}' não habilitado para o tenant ${tenant_id} (tenant_agents.enabled)`,
        });
      }

      // 3. Inserir tarefa em client_tasks
      const created = await supabaseInsert('client_tasks', {
        tenant_id,
        customer_id: loja.client_id,
        phase_id: 'acompanhamento',
        title: `[${especialista.toUpperCase()}] ${descricao.slice(0, 80)}`,
        description: descricao,
        status: 'todo',
        priority: 'normal',
        agent_id: especialista,
        loop_state: 'open',
        target_system,
        created_at: new Date().toISOString(),
      });
      if (!created?.id) {
        return res.status(500).json({ error: 'falha ao criar tarefa (insert sem retorno)' });
      }

      return res.json({
        task_id: created.id,
        especialista,
        descricao,
        loja_id,
        loja_nome: loja.nome ?? null,
        customer_id: loja.client_id,
        target_system: created.target_system ?? 'nenhum',
        status: 'despachado',
      });
    } catch (e) {
      console.error('[loop-despachar] erro:', e.message);
      return res.status(500).json({ error: 'erro ao despachar especialista', detail: e.message });
    }
  });

  return router;
};
