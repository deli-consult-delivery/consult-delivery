'use strict';

const express = require('express');

module.exports = function buildNotificationsRouter({ requireJwt, sbFetch }) {
  const router = express.Router();

  // GET /api/notifications?tenant_id=...&unread=true&limit=50
  router.get('/notifications', requireJwt, async (req, res) => {
    try {
      const { tenant_id, unread, limit = 50 } = req.query;
      if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });
      const userId = req.user.id;
      let path = `internal_notifications?tenant_id=eq.${encodeURIComponent(tenant_id)}`
        + `&or=(recipient_user_id.is.null,recipient_user_id.eq.${encodeURIComponent(userId)})`
        + `&order=created_at.desc&limit=${Number(limit)}`;
      if (unread === 'true') path += '&read_at=is.null';
      const rows = await sbFetch(path);
      res.json(rows ?? []);
    } catch (err) {
      console.error('[notifications] GET', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/notifications/:id/read
  router.patch('/notifications/:id/read', requireJwt, async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await sbFetch(`internal_notifications?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body:   { read_at: new Date().toISOString() },
      });
      res.json(rows?.[0] ?? { ok: true });
    } catch (err) {
      console.error('[notifications] PATCH read', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/notifications/mark-all-read  { tenant_id }
  router.post('/notifications/mark-all-read', requireJwt, async (req, res) => {
    try {
      const { tenant_id } = req.body ?? {};
      if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });
      const userId = req.user.id;
      await sbFetch(
        `internal_notifications?tenant_id=eq.${encodeURIComponent(tenant_id)}&read_at=is.null`
          + `&or=(recipient_user_id.is.null,recipient_user_id.eq.${encodeURIComponent(userId)})`,
        { method: 'PATCH', body: { read_at: new Date().toISOString() } }
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[notifications] mark-all-read', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/notifications/:id
  router.delete('/notifications/:id', requireJwt, async (req, res) => {
    try {
      const { id } = req.params;
      await sbFetch(`internal_notifications?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[notifications] DELETE', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
