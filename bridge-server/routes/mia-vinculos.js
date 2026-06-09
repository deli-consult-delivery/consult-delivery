'use strict';

/**
 * MIA-01: Bridge routes para Monitor IA de Conversas
 *
 * Vínculos WhatsApp ↔ Loja:
 *   GET    /api/lojas/:loja_id/whatsapp-vinculo
 *   POST   /api/lojas/:loja_id/whatsapp-vinculo
 *   PATCH  /api/whatsapp-vinculo/:id
 *   DELETE /api/whatsapp-vinculo/:id
 *
 * Sugestões IA:
 *   GET    /api/lojas/:loja_id/sugestoes-ia
 *   POST   /api/sugestoes-ia/:id/aprovar
 *   POST   /api/sugestoes-ia/:id/rejeitar
 *
 * DOC (proxy client_facts):
 *   GET    /api/lojas/:loja_id/doc
 *   POST   /api/lojas/:loja_id/doc
 *   PATCH  /api/doc/:fact_id
 *   DELETE /api/doc/:fact_id
 *
 * Audit (read-only, admin):
 *   GET    /api/lojas/:loja_id/mia-audit
 *
 * Auth: requireJwt em todas as rotas.
 * Tenant: sempre validado via assertLojaAccess (usa tenant_members).
 * Log: [mia-vinculos/{rota} {método}] loja=X user=Y
 */

const express = require('express');

// Mapeamento de prioridade MIA → prioridade de tarefas_loja
const PRIORIDADE_MAP = {
  alta:  'quick_win',
  media: 'estrutural',
  baixa: 'estrutural',
};

module.exports = function buildMiaVinculosRouter({
  requireJwt,
  sbFetch,
  supabaseInsert,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
}) {
  const router = express.Router();

  // ── Helper: sbPatch (UPDATE via service key) ────────────────────────────────
  async function sbPatch(path, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`sbPatch ${path} HTTP ${r.status}: ${await r.text()}`);
    return r.json();
  }

  // ── Helper: sbDelete ────────────────────────────────────────────────────────
  async function sbDelete(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!r.ok) throw new Error(`sbDelete ${path} HTTP ${r.status}: ${await r.text()}`);
  }

  // ── Helper: busca tenant_id da loja e valida membership ────────────────────
  async function assertLojaAccess(req, res, lojaId) {
    const rows = await sbFetch(`lojas?id=eq.${encodeURIComponent(lojaId)}&select=tenant_id&limit=1`);
    if (!rows?.length) {
      res.status(404).json({ error: 'loja não encontrada' });
      return null;
    }
    const { tenant_id } = rows[0];

    const member = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(req.user.id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=role&limit=1`
    );
    if (!member?.length) {
      res.status(403).json({ error: 'acesso negado' });
      return null;
    }

    return { tenant_id, role: member[0].role };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VÍNCULOS WHATSAPP
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/lojas/:loja_id/whatsapp-vinculo — lista vínculos da loja
  router.get('/lojas/:loja_id/whatsapp-vinculo', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      const rows = await sbFetch(
        `loja_whatsapp_vinculo?loja_id=eq.${encodeURIComponent(loja_id)}&order=created_at.asc&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error(`[mia-vinculos/whatsapp-vinculo GET] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/lojas/:loja_id/whatsapp-vinculo — criar vínculo
  router.post('/lojas/:loja_id/whatsapp-vinculo', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    const { remote_jid, tipo, monitorar = true } = req.body;

    if (!remote_jid || !tipo) {
      return res.status(400).json({ error: 'remote_jid e tipo são obrigatórios' });
    }
    if (!['grupo', 'privado'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo deve ser "grupo" ou "privado"' });
    }

    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      const row = await supabaseInsert('loja_whatsapp_vinculo', {
        tenant_id: access.tenant_id,
        loja_id,
        remote_jid,
        tipo,
        monitorar: Boolean(monitorar),
        criado_por: req.user.id,
      });

      console.log(`[mia-vinculos/whatsapp-vinculo POST] loja=${loja_id} user=${req.user.id} jid=${remote_jid}`);
      res.status(201).json(row);
    } catch (err) {
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        return res.status(409).json({ error: 'vínculo já existe para este remote_jid neste tenant' });
      }
      console.error(`[mia-vinculos/whatsapp-vinculo POST] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/whatsapp-vinculo/:id — editar vínculo (toggle monitorar, etc.)
  router.patch('/whatsapp-vinculo/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { monitorar, remote_jid, tipo } = req.body;

    try {
      // Busca o vínculo pra validar acesso via loja_id
      const rows = await sbFetch(`loja_whatsapp_vinculo?id=eq.${encodeURIComponent(id)}&select=loja_id&limit=1`);
      if (!rows?.length) return res.status(404).json({ error: 'vínculo não encontrado' });

      const access = await assertLojaAccess(req, res, rows[0].loja_id);
      if (!access) return;

      const updates = {};
      if (monitorar !== undefined) updates.monitorar = Boolean(monitorar);
      if (remote_jid) updates.remote_jid = remote_jid;
      if (tipo && ['grupo', 'privado'].includes(tipo)) updates.tipo = tipo;

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const updated = await sbPatch(
        `loja_whatsapp_vinculo?id=eq.${encodeURIComponent(id)}`,
        updates
      );
      console.log(`[mia-vinculos/whatsapp-vinculo PATCH] id=${id} user=${req.user.id}`);
      res.json(Array.isArray(updated) ? updated[0] : updated);
    } catch (err) {
      console.error(`[mia-vinculos/whatsapp-vinculo PATCH] id=${id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/whatsapp-vinculo/:id — remover vínculo
  router.delete('/whatsapp-vinculo/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await sbFetch(`loja_whatsapp_vinculo?id=eq.${encodeURIComponent(id)}&select=loja_id&limit=1`);
      if (!rows?.length) return res.status(404).json({ error: 'vínculo não encontrado' });

      const access = await assertLojaAccess(req, res, rows[0].loja_id);
      if (!access) return;

      await sbDelete(`loja_whatsapp_vinculo?id=eq.${encodeURIComponent(id)}`);
      console.log(`[mia-vinculos/whatsapp-vinculo DELETE] id=${id} user=${req.user.id}`);
      res.status(204).end();
    } catch (err) {
      console.error(`[mia-vinculos/whatsapp-vinculo DELETE] id=${id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SUGESTÕES IA
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/lojas/:loja_id/sugestoes-ia — lista sugestões com filtros
  router.get('/lojas/:loja_id/sugestoes-ia', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    const { status = 'pendente', tipo } = req.query;

    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      let qs = `sugestoes_ia?loja_id=eq.${encodeURIComponent(loja_id)}&order=criada_em.desc&select=*`;
      if (status) qs += `&status=eq.${encodeURIComponent(status)}`;
      if (tipo && ['fact', 'tarefa'].includes(tipo)) qs += `&tipo=eq.${encodeURIComponent(tipo)}`;

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error(`[mia-vinculos/sugestoes-ia GET] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sugestoes-ia/:id/aprovar — aprovar sugestão (cria fact ou tarefa)
  router.post('/sugestoes-ia/:id/aprovar', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { texto_editado } = req.body; // opcional: texto diferente do original

    try {
      // Busca sugestão
      const rows = await sbFetch(
        `sugestoes_ia?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'sugestão não encontrada' });

      const sug = rows[0];
      if (sug.status !== 'pendente') {
        return res.status(409).json({ error: `sugestão já está com status "${sug.status}"` });
      }

      const access = await assertLojaAccess(req, res, sug.loja_id);
      if (!access) return;

      const conteudoFinal = texto_editado?.trim() || sug.conteudo;
      const foiEditada    = !!texto_editado?.trim() && texto_editado.trim() !== sug.conteudo;
      let resultado_id    = null;

      if (sug.tipo === 'fact') {
        // Insere em client_facts
        // Schema pós-006: key (identificador/texto) + value JSONB, source_agent, confidence REAL 0-1.
        // Mapeamento espelha a conversão da migration 006: key = texto, value = { text }.
        const fact = await supabaseInsert('client_facts', {
          loja_id:      sug.loja_id,
          tenant_id:    sug.tenant_id,
          source_agent: 'mia',
          category:     'mia',
          key:          conteudoFinal,
          value:        { text: conteudoFinal },
          confidence:   sug.confianca === 'alta' ? 0.9 : sug.confianca === 'media' ? 0.7 : 0.5,
        });
        resultado_id = fact?.id || null;

        // Insere em client_timeline (append-only) — agent_name mantido nesta tabela
        await supabaseInsert('client_timeline', {
          loja_id:    sug.loja_id,
          tenant_id:  sug.tenant_id,
          agent_name: 'mia',
          event_type: 'fact_added',
          title:      `MIA: fact aprovado — "${conteudoFinal.slice(0, 100)}"`,
          payload:    { sugestao_id: id, fact_id: resultado_id, editado: foiEditada },
        });
      } else if (sug.tipo === 'tarefa') {
        // Mapeia prioridade MIA → prioridade de tarefas_loja
        const prioridadeMia = sug.evidencia?.prioridade || 'media';
        const prioridade    = PRIORIDADE_MAP[prioridadeMia] || 'estrutural';

        // Insere em tarefas_loja
        const tarefa = await supabaseInsert('tarefas_loja', {
          loja_id:          sug.loja_id,
          titulo:           conteudoFinal,
          situacao:         sug.evidencia?.trecho
                              ? `Identificado via MIA: "${sug.evidencia.trecho.slice(0, 200)}"`
                              : 'Identificado via Monitor IA',
          o_que_sera_feito: conteudoFinal,
          bloco:            'operacao',
          prioridade,
          status:           'rascunho',
          criado_por_ia:    true,
          metadata:         { sugestao_id: id, evidencia: sug.evidencia },
        });
        resultado_id = tarefa?.id || null;
      }

      // Marca sugestão como aprovada/editada
      await sbPatch(
        `sugestoes_ia?id=eq.${encodeURIComponent(id)}`,
        {
          status:       foiEditada ? 'editada' : 'aprovada',
          decidida_em:  new Date().toISOString(),
          decidida_por: req.user.id,
          resultado_id,
        }
      );

      console.log(`[mia-vinculos/sugestoes-ia APROVAR] id=${id} tipo=${sug.tipo} user=${req.user.id} resultado=${resultado_id}`);
      res.json({ ok: true, tipo: sug.tipo, resultado_id, status: foiEditada ? 'editada' : 'aprovada' });
    } catch (err) {
      console.error(`[mia-vinculos/sugestoes-ia APROVAR] id=${id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sugestoes-ia/:id/rejeitar — rejeitar sugestão
  router.post('/sugestoes-ia/:id/rejeitar', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    try {
      const rows = await sbFetch(
        `sugestoes_ia?id=eq.${encodeURIComponent(id)}&select=loja_id,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'sugestão não encontrada' });
      if (rows[0].status !== 'pendente') {
        return res.status(409).json({ error: `sugestão já está com status "${rows[0].status}"` });
      }

      const access = await assertLojaAccess(req, res, rows[0].loja_id);
      if (!access) return;

      await sbPatch(
        `sugestoes_ia?id=eq.${encodeURIComponent(id)}`,
        {
          status:       'rejeitada',
          decidida_em:  new Date().toISOString(),
          decidida_por: req.user.id,
          evidencia:    motivo ? { motivo_rejeicao: motivo } : undefined,
        }
      );

      console.log(`[mia-vinculos/sugestoes-ia REJEITAR] id=${id} user=${req.user.id}`);
      res.json({ ok: true, status: 'rejeitada' });
    } catch (err) {
      console.error(`[mia-vinculos/sugestoes-ia REJEITAR] id=${id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DOC (proxy client_facts)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/lojas/:loja_id/doc — lista client_facts da loja
  router.get('/lojas/:loja_id/doc', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      const rows = await sbFetch(
        `client_facts?loja_id=eq.${encodeURIComponent(loja_id)}&order=ts.desc&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error(`[mia-vinculos/doc GET] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/lojas/:loja_id/doc — criar fact manualmente
  router.post('/lojas/:loja_id/doc', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    const { fact, category = 'manual', confidence = 100 } = req.body;

    if (!fact) return res.status(400).json({ error: '"fact" é obrigatório' });

    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      // Schema pós-006: key + value JSONB, source_agent, confidence REAL 0-1.
      // API mantém contrato confidence 0-100 (frontend não envia → default 100 → 1.0).
      const row = await supabaseInsert('client_facts', {
        loja_id,
        tenant_id:    access.tenant_id,
        source_agent: `human:${req.user.id}`,
        category,
        key:          fact,
        value:        { text: fact },
        confidence:   Math.min(1, Math.max(0, (Number(confidence) || 100) / 100)),
      });

      console.log(`[mia-vinculos/doc POST] loja=${loja_id} user=${req.user.id}`);
      res.status(201).json(row);
    } catch (err) {
      console.error(`[mia-vinculos/doc POST] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/doc/:fact_id — editar fact
  router.patch('/doc/:fact_id', requireJwt, async (req, res) => {
    const { fact_id } = req.params;
    const { fact, category, confidence } = req.body;

    try {
      const rows = await sbFetch(`client_facts?id=eq.${encodeURIComponent(fact_id)}&select=loja_id&limit=1`);
      if (!rows?.length) return res.status(404).json({ error: 'fact não encontrado' });

      const access = await assertLojaAccess(req, res, rows[0].loja_id);
      if (!access) return;

      // Schema pós-006: edição de texto atualiza key + value; confidence 0-100 → REAL 0-1.
      const updates = {};
      if (fact)       { updates.key = fact; updates.value = { text: fact }; }
      if (category)   updates.category = category;
      if (confidence !== undefined) updates.confidence = Math.min(1, Math.max(0, Number(confidence) / 100));

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }
      updates.updated_at = new Date().toISOString();

      const updated = await sbPatch(`client_facts?id=eq.${encodeURIComponent(fact_id)}`, updates);
      res.json(Array.isArray(updated) ? updated[0] : updated);
    } catch (err) {
      console.error(`[mia-vinculos/doc PATCH] fact=${fact_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/doc/:fact_id — remover fact (admin)
  router.delete('/doc/:fact_id', requireJwt, async (req, res) => {
    const { fact_id } = req.params;
    try {
      const rows = await sbFetch(`client_facts?id=eq.${encodeURIComponent(fact_id)}&select=loja_id&limit=1`);
      if (!rows?.length) return res.status(404).json({ error: 'fact não encontrado' });

      const access = await assertLojaAccess(req, res, rows[0].loja_id);
      if (!access) return;

      if (!['admin', 'dev'].includes(access.role)) {
        return res.status(403).json({ error: 'apenas admin pode excluir facts' });
      }

      await sbDelete(`client_facts?id=eq.${encodeURIComponent(fact_id)}`);
      res.status(204).end();
    } catch (err) {
      console.error(`[mia-vinculos/doc DELETE] fact=${fact_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT (read-only)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/lojas/:loja_id/mia-audit — últimos runs do worker para esta loja
  router.get('/lojas/:loja_id/mia-audit', requireJwt, async (req, res) => {
    const { loja_id } = req.params;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    try {
      const access = await assertLojaAccess(req, res, loja_id);
      if (!access) return;

      if (!['admin', 'dev'].includes(access.role)) {
        return res.status(403).json({ error: 'apenas admin pode ver o audit do MIA' });
      }

      const rows = await sbFetch(
        `mia_audit_log?loja_id=eq.${encodeURIComponent(loja_id)}&order=created_at.desc&limit=${limit}&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error(`[mia-vinculos/mia-audit GET] loja=${loja_id}`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
