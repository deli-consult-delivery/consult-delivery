'use strict';

/**
 * oracle.js — Oracle da CD: chat de construção de agentes (MVP)
 * Spec: docs/oracle-cd/SPEC-oracle-cd.md (aprovada em #313)
 *
 * Fluxo: operador conversa com o Oracle → Oracle propõe draft estruturado →
 * draft gravado em `oracle_drafts` (status pendente) → admin aprova →
 * sistema cria o agente (INSERT agents → tenant_agents → config) → aplicado.
 *
 * Nada entra em `agents` sem aprovação humana. Allow-list de tools é
 * imposta AQUI (servidor), nunca confiada ao LLM ou ao frontend.
 */

const express = require('express');

// Registry de tools permitidas (MVP). Tool fora daqui é descartada e logada.
const ALLOWED_TOOLS = ['web_search_20250305'];

const DEFAULT_AGENT_MODEL = 'claude-haiku-4-5-20251001';
const ORACLE_MODEL = process.env.ORACLE_MODEL || 'claude-sonnet-4-6';

const ORACLE_SYSTEM = `Você é o Oracle da Consult Delivery — o construtor de agentes da plataforma.
Seu trabalho: conversar com o operador (sempre em português do Brasil) para entender o agente especialista que ele precisa e, quando tiver informação suficiente, propor o agente em formato estruturado.

Regras:
1. Faça perguntas curtas e objetivas até ter clareza sobre: função do agente, área de conhecimento, tom de voz e o que ele NUNCA deve fazer. 2 a 3 trocas costumam bastar — não alongue.
2. Quando tiver informação suficiente, apresente: um resumo curto em texto + um bloco \`\`\`json com EXATAMENTE esta estrutura:
{
  "slug": "kebab-case-3-a-40-chars",
  "name": "Nome curto do agente",
  "role": "descrição de uma linha da função",
  "letter": "U",
  "color": "#B70C00",
  "default_modo": "hibrido",
  "custom_model": "${DEFAULT_AGENT_MODEL}",
  "custom_prompt": "system prompt completo do agente, em português...",
  "tools": [],
  "provider": "anthropic"
}
3. O custom_prompt deve ser completo e autossuficiente: persona, conhecimento/escopo, limites explícitos (o que não fazer) e formato de resposta. Se o operador citou documentos/skills, incorpore o conteúdo relevante como bloco de conhecimento dentro do custom_prompt.
4. tools: só inclua "web_search_20250305" se o agente realmente precisar buscar na web. Nenhuma outra tool existe no MVP.
5. Padrão da plataforma: nenhum agente envia mensagem a cliente sem aprovação humana — reflita isso no custom_prompt quando o agente lidar com clientes.
6. NUNCA afirme que o agente foi criado — a criação só acontece depois que um humano aprovar o draft.`;

// ── Validação server-side do payload do draft ───────────────────────────────
function validateDraftPayload(p) {
  const errors = [];
  const discardedTools = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['payload ausente'], value: null, discardedTools };

  const slug = String(p.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) errors.push('slug inválido (kebab-case, 3-40 chars)');

  const name = String(p.name || '').trim();
  if (name.length < 2 || name.length > 60) errors.push('name obrigatório (2-60 chars)');

  const role = String(p.role || '').trim();
  if (role.length < 3 || role.length > 200) errors.push('role obrigatório (3-200 chars)');

  let letter = String(p.letter || '').trim().toUpperCase().slice(0, 1);
  if (!letter && name) letter = name[0].toUpperCase();
  if (!letter) errors.push('letter obrigatório (1 char)');

  const color = String(p.color || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) errors.push('color inválido (#RRGGBB)');

  const default_modo = String(p.default_modo || 'hibrido').trim();
  if (!['humano', 'hibrido', 'ia'].includes(default_modo)) errors.push("default_modo deve ser humano|hibrido|ia");

  const custom_prompt = String(p.custom_prompt || '').trim();
  if (custom_prompt.length < 20) errors.push('custom_prompt obrigatório (mínimo 20 chars)');

  const custom_model = String(p.custom_model || DEFAULT_AGENT_MODEL).trim();

  const rawTools = Array.isArray(p.tools) ? p.tools : [];
  const tools = [];
  for (const t of rawTools) {
    if (ALLOWED_TOOLS.includes(t)) tools.push(t);
    else discardedTools.push(t);
  }

  return {
    ok: errors.length === 0,
    errors,
    discardedTools,
    value: errors.length === 0 ? {
      slug, name, role, letter, color, default_modo,
      custom_model, custom_prompt, tools,
      provider: 'anthropic', // único provider no MVP
    } : null,
  };
}

// ── Extrai a proposta JSON da resposta do Oracle (se houver) ────────────────
function extractProposal(text) {
  const m = /```json\s*([\s\S]*?)```/.exec(text || '');
  if (!m) return { proposal: null };
  let parsed;
  try { parsed = JSON.parse(m[1]); } catch {
    return { proposal: null, proposal_error: 'bloco json da proposta não parseou' };
  }
  const v = validateDraftPayload(parsed);
  if (!v.ok) return { proposal: null, proposal_error: v.errors.join('; ') };
  if (v.discardedTools.length) {
    console.warn('[oracle/chat] tools fora do registry descartadas:', v.discardedTools.join(', '));
  }
  return { proposal: v.value, discarded_tools: v.discardedTools };
}

module.exports = function buildOracleRouter({ requireJwt, sbFetch, supabaseInsert }) {
  const router = express.Router();

  async function getMembership(userId) {
    if (!userId) return null;
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id,role&limit=1`
    );
    return rows?.[0] ?? null;
  }

  async function audit(tenantId, userId, action, resource, metadata) {
    await supabaseInsert('audit_log', {
      tenant_id: tenantId,
      user_id: userId,
      action,
      resource,
      metadata: metadata || {},
    }).catch(e => console.warn(`[oracle] audit ${action} falhou:`, e.message));
  }

  // ── POST /api/oracle/chat — conversa multi-turn com o Oracle ──────────────
  router.post('/oracle/chat', requireJwt, async (req, res) => {
    try {
      const member = await getMembership(req.user?.id);
      if (!member) return res.status(403).json({ error: 'tenant não encontrado' });

      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
        return res.status(400).json({ error: 'messages deve ser array de 1 a 40 itens' });
      }
      for (const m of messages) {
        if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000) {
          return res.status(400).json({ error: 'mensagem inválida (role user|assistant, content string até 8000 chars)' });
        }
      }
      if (messages[messages.length - 1].role !== 'user') {
        return res.status(400).json({ error: 'última mensagem deve ser do usuário' });
      }

      const Anthropic = require('@anthropic-ai/sdk');
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });

      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: ORACLE_MODEL,
        max_tokens: 2048,
        system: ORACLE_SYSTEM,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const { proposal, proposal_error, discarded_tools } = extractProposal(reply);

      res.json({
        reply,
        proposal,
        ...(proposal_error && { proposal_error }),
        ...(discarded_tools?.length && { discarded_tools }),
        tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      });
    } catch (err) {
      console.error('[oracle POST /chat]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/oracle/drafts — lista drafts do tenant ───────────────────────
  router.get('/oracle/drafts', requireJwt, async (req, res) => {
    try {
      const member = await getMembership(req.user?.id);
      if (!member) return res.status(403).json({ error: 'tenant não encontrado' });

      const status = req.query.status;
      let q = `oracle_drafts?tenant_id=eq.${member.tenant_id}&order=created_at.desc&limit=50&select=*`;
      if (status && ['pendente', 'aprovado', 'rejeitado', 'aplicado'].includes(status)) {
        q += `&status=eq.${status}`;
      }
      const rows = await sbFetch(q);
      res.json({ drafts: rows || [], is_admin: ['admin', 'owner'].includes(member.role) });
    } catch (err) {
      console.error('[oracle GET /drafts]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/oracle/drafts — grava draft pendente ────────────────────────
  router.post('/oracle/drafts', requireJwt, async (req, res) => {
    try {
      const member = await getMembership(req.user?.id);
      if (!member) return res.status(403).json({ error: 'tenant não encontrado' });

      const v = validateDraftPayload(req.body?.payload);
      if (!v.ok) return res.status(400).json({ error: 'payload inválido', detalhes: v.errors });
      if (v.discardedTools.length) {
        console.warn('[oracle/drafts] tools descartadas no draft:', v.discardedTools.join(', '));
      }

      // colisão de slug com agente existente → avisa já na criação do draft
      const existing = await sbFetch(`agents?id=eq.${encodeURIComponent(v.value.slug)}&select=id&limit=1`);
      if (existing?.length) {
        return res.status(409).json({ error: `já existe um agente com o slug "${v.value.slug}" — peça outro slug ao Oracle` });
      }

      const sourceChat = Array.isArray(req.body?.source_chat) ? req.body.source_chat.slice(0, 40) : null;

      const row = await supabaseInsert('oracle_drafts', {
        tenant_id: member.tenant_id,
        status: 'pendente',
        proposed_slug: v.value.slug,
        payload: v.value,
        source_chat: sourceChat,
        created_by: req.user.id,
      });

      await audit(member.tenant_id, req.user.id, 'oracle.draft_criado', `oracle_drafts:${row?.id || v.value.slug}`, {
        proposed_slug: v.value.slug,
        discarded_tools: v.discardedTools,
      });

      res.status(201).json(row);
    } catch (err) {
      console.error('[oracle POST /drafts]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/oracle/drafts/:id/approve — SÓ admin: aprova e aplica ───────
  router.post('/oracle/drafts/:id/approve', requireJwt, async (req, res) => {
    const draftId = req.params.id;
    try {
      const member = await getMembership(req.user?.id);
      if (!member) return res.status(403).json({ error: 'tenant não encontrado' });
      if (!['admin', 'owner'].includes(member.role)) {
        return res.status(403).json({ error: 'só admin/owner do tenant aprova drafts do Oracle' });
      }

      const rows = await sbFetch(
        `oracle_drafts?id=eq.${encodeURIComponent(draftId)}&tenant_id=eq.${member.tenant_id}&select=*&limit=1`
      );
      const draft = rows?.[0];
      if (!draft) return res.status(404).json({ error: 'draft não encontrado' });
      if (draft.status !== 'pendente') return res.status(409).json({ error: `draft já está ${draft.status}` });

      // re-valida o payload no momento da aprovação (guard-rail da spec)
      const v = validateDraftPayload(draft.payload);
      if (!v.ok) return res.status(422).json({ error: 'payload do draft inválido', detalhes: v.errors });
      const agente = v.value;

      // colisão de slug
      const existing = await sbFetch(`agents?id=eq.${encodeURIComponent(agente.slug)}&select=id&limit=1`);
      if (existing?.length) {
        return res.status(409).json({ error: `já existe um agente com o slug "${agente.slug}"` });
      }

      const now = new Date().toISOString();

      // 1) pendente → aprovado
      await sbFetch(`oracle_drafts?id=eq.${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        body: { status: 'aprovado', reviewed_by: req.user.id, reviewed_at: now, review_note: req.body?.note || null },
      });
      await audit(member.tenant_id, req.user.id, 'oracle.draft_aprovado', `oracle_drafts:${draftId}`, {
        proposed_slug: agente.slug,
      });

      try {
        // 2) INSERT agents (ordem da spec: agents → tenant_agents → config)
        await supabaseInsert('agents', {
          id: agente.slug,
          name: agente.name,
          role: agente.role,
          letter: agente.letter,
          color: agente.color,
          default_modo: agente.default_modo,
          custom_model: agente.custom_model,
          custom_prompt: agente.custom_prompt,
          custom_max_tokens: 4096,
          is_custom: true,
          is_active: true,
          tenant_id: member.tenant_id,
        });

        // 3) INSERT tenant_agents (habilita pro tenant)
        await supabaseInsert('tenant_agents', {
          tenant_id: member.tenant_id,
          agent_id: agente.slug,
          enabled: true,
        });

        // 4) allow-list de tools em tenant_agent_config.config (zero migration)
        await sbFetch('tenant_agent_config', {
          method: 'POST',
          prefer: 'return=representation,resolution=merge-duplicates',
          body: { tenant_id: member.tenant_id, agent_id: agente.slug, config: { allowed_tools: agente.tools } },
        });

        // 5) aprovado → aplicado
        await sbFetch(`oracle_drafts?id=eq.${encodeURIComponent(draftId)}`, {
          method: 'PATCH',
          body: { status: 'aplicado', agent_id: agente.slug },
        });
        await audit(member.tenant_id, req.user.id, 'oracle.agente_aplicado', `agents:${agente.slug}`, {
          draft_id: draftId, tools: agente.tools,
        });

        console.log(`[oracle/approve] draft=${draftId} → agente=${agente.slug} tenant=${member.tenant_id}`);
        res.json({ ok: true, agent_id: agente.slug, status: 'aplicado' });
      } catch (applyErr) {
        // falhou no meio: volta o draft pra pendente com a causa registrada
        await sbFetch(`oracle_drafts?id=eq.${encodeURIComponent(draftId)}`, {
          method: 'PATCH',
          body: { status: 'pendente', review_note: `falha ao aplicar: ${applyErr.message}`.slice(0, 500) },
        }).catch(() => {});
        throw applyErr;
      }
    } catch (err) {
      console.error('[oracle POST /drafts/:id/approve]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/oracle/drafts/:id/reject — SÓ admin: rejeita ────────────────
  router.post('/oracle/drafts/:id/reject', requireJwt, async (req, res) => {
    const draftId = req.params.id;
    try {
      const member = await getMembership(req.user?.id);
      if (!member) return res.status(403).json({ error: 'tenant não encontrado' });
      if (!['admin', 'owner'].includes(member.role)) {
        return res.status(403).json({ error: 'só admin/owner do tenant rejeita drafts do Oracle' });
      }

      const rows = await sbFetch(
        `oracle_drafts?id=eq.${encodeURIComponent(draftId)}&tenant_id=eq.${member.tenant_id}&select=id,status&limit=1`
      );
      const draft = rows?.[0];
      if (!draft) return res.status(404).json({ error: 'draft não encontrado' });
      if (draft.status !== 'pendente') return res.status(409).json({ error: `draft já está ${draft.status}` });

      await sbFetch(`oracle_drafts?id=eq.${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        body: {
          status: 'rejeitado',
          reviewed_by: req.user.id,
          reviewed_at: new Date().toISOString(),
          review_note: req.body?.note || null,
        },
      });

      await audit(member.tenant_id, req.user.id, 'oracle.draft_rejeitado', `oracle_drafts:${draftId}`, {
        note: req.body?.note || null,
      });

      res.json({ ok: true, status: 'rejeitado' });
    } catch (err) {
      console.error('[oracle POST /drafts/:id/reject]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
