const express = require('express');

// ── Onboarding self-service: agência cria loja (tenant_type='store') filha ──
// dela mesma. Reaproveita o convite já existente (POST /api/users/invite) —
// esta rota só cria o tenant e semeia RBAC; o front chama /users/invite em
// seguida com o tenant_id retornado. Nunca expõe a service key ao front.
module.exports = function ({ requireJwt, sbFetch }) {
  const router = express.Router();

  router.post('/tenants/create-store', requireJwt, async (req, res) => {
    const { nome, slug, parent_tenant_id } = req.body || {};

    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return res.status(400).json({ error: 'nome (mín. 2 caracteres) é obrigatório' });
    }
    if (!parent_tenant_id) {
      return res.status(400).json({ error: 'parent_tenant_id é obrigatório' });
    }

    try {
      // Só admin/owner da agência pode criar uma loja filha dela.
      const callerRows = await sbFetch(
        `tenant_members?tenant_id=eq.${encodeURIComponent(parent_tenant_id)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=role&limit=1`
      );
      if (!callerRows?.length || !['admin', 'owner'].includes(callerRows[0].role)) {
        return res.status(403).json({ error: 'Apenas administradores da agência podem criar lojas' });
      }

      const slugFinal = (slug?.trim() || nome.trim())
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

      let tenantRows;
      try {
        tenantRows = await sbFetch('tenants', {
          method: 'POST',
          body: { name: nome.trim(), slug: slugFinal, tenant_type: 'store', parent_tenant_id, color: '#B70C00' },
        });
      } catch (err) {
        // validate_tenant_hierarchy (trigger) e a UNIQUE de slug já barram os
        // casos inválidos — só traduzimos a mensagem crua pro front.
        if (/nao tem pai|deve pender de/.test(err.message)) {
          return res.status(400).json({ error: 'Tenant pai inválido para criar uma loja (precisa ser uma agência).' });
        }
        if (/duplicate key|already exists/i.test(err.message)) {
          return res.status(409).json({ error: `Slug "${slugFinal}" já está em uso — tente outro nome.` });
        }
        throw err;
      }
      const tenant = tenantRows?.[0];
      if (!tenant?.id) throw new Error('Falha ao criar o tenant — resposta inesperada do Supabase');

      // RBAC: sem isso, o admin convidado cai em "Acesso negado" em toda
      // tela protegida por <RequireRole> (achado real do onboarding manual).
      await sbFetch('rpc/seed_rbac_system_roles', { method: 'POST', body: { p_tenant_id: tenant.id } });

      // BUG CRÍTICO corrigido (revisão do PR #821): sem esta linha, o caller
      // (admin da agência que acabou de criar a loja) não tem tenant_members
      // no tenant NOVO — /users/invite (routes/users.js:29-32) checa
      // tenant_members do caller no tenant_id do convite e dá 403 sempre,
      // mesmo sendo admin legítimo da agência-mãe. Mesmo padrão da RPC
      // create_workspace já existente no baseline (INSERT tenant_members
      // logo após o INSERT tenants).
      await sbFetch('tenant_members', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { tenant_id: tenant.id, user_id: req.user.id, role: 'admin' },
      });

      await sbFetch('audit_log', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          tenant_id: parent_tenant_id,
          user_id: req.user.id,
          action: 'store_tenant.create',
          resource: 'tenants',
          metadata: { novo_tenant_id: tenant.id, nome: tenant.name, slug: tenant.slug },
        },
      });

      console.log(`[api/tenants/create-store] parent=${parent_tenant_id} novo=${tenant.id} (${tenant.slug}) por user=${req.user.id}`);
      return res.json({ ok: true, tenant_id: tenant.id, slug: tenant.slug });
    } catch (err) {
      console.error('[api/tenants/create-store]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
