'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Configuração de avaliação e branding por tenant — endpoints autenticados JWT
//
// Endpoints:
//   GET  /api/tenant/avaliacao-config?tenant_id=<uuid>
//     Retorna avaliacao_config do tenant (campos de texto e templates)
//   PATCH /api/tenant/avaliacao-config
//     Atualiza campos de texto CSAT/NPS — somente admin/dev
//   PATCH /api/tenant/branding
//     Atualiza tenants.color, theme_color, logo_url — somente admin/dev
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { z }   = require('zod');
const { safeLogoUrl } = require('../lib/branding');

const AvaliacaoConfigPatchSchema = z.object({
  tenant_id:         z.string().uuid(),
  csat_titulo:        z.string().max(200).nullable().optional(),
  csat_subtitulo:     z.string().max(300).nullable().optional(),
  csat_agradecimento: z.string().max(300).nullable().optional(),
  csat_mensagem_template: z.string().max(1000).nullable().optional(),
  nps_titulo:         z.string().max(200).nullable().optional(),
  nps_subtitulo:      z.string().max(300).nullable().optional(),
  nps_agradecimento:  z.string().max(300).nullable().optional(),
  nps_mensagem_template: z.string().max(1000).nullable().optional(),
});

const BrandingPatchSchema = z.object({
  tenant_id:   z.string().uuid(),
  logo_url:    z.string().url().nullable().optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

module.exports = function buildTenantAvaliacaoConfigRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // Verifica se o usuário é admin/dev do tenant
  async function assertTenantAdmin(req, res, tenantId) {
    const rows = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}&user_id=eq.${encodeURIComponent(req.user.id)}` +
      `&select=role&limit=1`
    );
    if (!rows?.length) {
      res.status(403).json({ error: 'Acesso negado: usuário não é membro deste tenant' });
      return false;
    }
    const role = rows[0]?.role;
    if (!['admin', 'dev', 'owner'].includes(role)) {
      res.status(403).json({ error: 'Acesso negado: apenas admin/dev pode alterar configurações' });
      return false;
    }
    return true;
  }

  // ── GET /api/tenant/branding ─────────────────────────────────────────────
  router.get('/tenant/branding', requireJwt, async (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      if (!await assertTenantMember(req, res, tenant_id)) return;

      const rows = await sbFetch(
        `tenants?id=eq.${encodeURIComponent(tenant_id)}&select=name,color,theme_color,logo_url&limit=1`
      );
      const t = rows?.[0];
      if (!t) return res.status(404).json({ error: 'tenant_nao_encontrado' });
      return res.json({
        name:        t.name        ?? null,
        color:       t.color       ?? null,
        theme_color: t.theme_color ?? null,
        logo_url:    safeLogoUrl(t.logo_url),
      });
    } catch (err) {
      console.error('[tenant/branding GET]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  // ── GET /api/tenant/avaliacao-config ─────────────────────────────────────
  router.get('/tenant/avaliacao-config', requireJwt, async (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      if (!await assertTenantMember(req, res, tenant_id)) return;

      const rows = await sbFetch(
        `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenant_id)}` +
        `&select=csat_auto_envio,csat_mensagem_template,csat_titulo,csat_subtitulo,csat_agradecimento` +
        `,nps_auto_envio,nps_mensagem_template,nps_cooldown_dias,nps_titulo,nps_subtitulo,nps_agradecimento` +
        `&limit=1`
      );
      return res.json(rows?.[0] ?? null);
    } catch (err) {
      console.error('[tenant/avaliacao-config GET]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  // ── PATCH /api/tenant/avaliacao-config ────────────────────────────────────
  router.patch('/tenant/avaliacao-config', requireJwt, async (req, res) => {
    const parsed = AvaliacaoConfigPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { tenant_id, ...fields } = parsed.data;

    try {
      if (!await assertTenantAdmin(req, res, tenant_id)) return;

      // Upsert: cria se não existe, atualiza se já existe
      const result = await sbFetch(
        `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body:   { ...fields, updated_at: new Date().toISOString() },
          prefer: 'return=representation',
        }
      );

      // Se nenhuma linha foi atualizada, inserir
      if (!result?.length) {
        const inserted = await sbFetch('avaliacao_config', {
          method: 'POST',
          body:   { tenant_id, ...fields },
          prefer: 'return=representation',
        });
        return res.json(inserted?.[0] ?? { ok: true });
      }

      return res.json(result[0]);
    } catch (err) {
      console.error('[tenant/avaliacao-config PATCH]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  // ── PATCH /api/tenant/branding ────────────────────────────────────────────
  router.patch('/tenant/branding', requireJwt, async (req, res) => {
    const parsed = BrandingPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { tenant_id, logo_url, color, theme_color } = parsed.data;

    try {
      if (!await assertTenantAdmin(req, res, tenant_id)) return;

      const patch = {};
      if (color       !== undefined) patch.color       = color;
      if (theme_color !== undefined) patch.theme_color = theme_color;
      if (logo_url    !== undefined) patch.logo_url    = logo_url ? safeLogoUrl(logo_url) : null;

      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'nenhum campo para atualizar' });
      }

      const result = await sbFetch(
        `tenants?id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body:   patch,
          prefer: 'return=representation',
        }
      );

      return res.json(result?.[0] ?? { ok: true });
    } catch (err) {
      console.error('[tenant/branding PATCH]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  return router;
};
