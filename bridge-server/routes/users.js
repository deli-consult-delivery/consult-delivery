const express = require('express');

module.exports = function ({ requireJwt, sbFetch, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  router.post('/users/invite', requireJwt, async (req, res) => {
    const { email, role, tenant_id } = req.body;

    if (!email || !role || !tenant_id) {
      return res.status(400).json({ error: 'email, role e tenant_id são obrigatórios' });
    }

    const validRoles = ['admin', 'consultor', 'operador', 'dev'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'role inválido' });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });
    }

    const adminHeaders = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    };

    try {
      // Verifica se caller é admin/owner do tenant
      const callerRows = await sbFetch(
        `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=role&limit=1`
      );
      if (!callerRows?.length || !['admin', 'owner'].includes(callerRows[0].role)) {
        return res.status(403).json({ error: 'Apenas administradores podem convidar usuários' });
      }

      // Envia convite via Supabase Auth Admin
      const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, data: { tenant_id, role } }),
      });

      const inviteData = await inviteRes.json();
      if (!inviteRes.ok) {
        const msg = inviteData?.msg || inviteData?.message || 'Erro ao enviar convite';
        return res.status(422).json({ error: msg });
      }

      const userId = inviteData.id;

      // Verifica se já é membro
      const existing = await sbFetch(
        `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`
      );
      if (existing?.length) {
        return res.status(409).json({ error: 'Este usuário já é membro do tenant' });
      }

      // Cria registro em tenant_members
      await sbFetch('tenant_members', {
        method: 'POST',
        body: {
          tenant_id,
          user_id: userId,
          role,
          display_name: email.split('@')[0],
        },
      });

      console.log(`[api/users/invite] email=${email} role=${role} tenant=${tenant_id} user_id=${userId}`);
      return res.json({ ok: true, user_id: userId });
    } catch (err) {
      console.error('[api/users/invite]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
