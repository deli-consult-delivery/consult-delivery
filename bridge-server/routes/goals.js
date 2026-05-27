'use strict';

const express = require('express');

module.exports = function buildGoalsRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── Helper: PATCH via service role ───────────────────────────────────────
  async function sbPatch(table, id, tenantId, updates) {
    if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY ausente');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          apikey:          SUPABASE_SERVICE_KEY,
          Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer:          'return=representation',
        },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      }
    );
    if (!r.ok) throw new Error(`${table} PATCH ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  // ── Helper: DELETE via service role ──────────────────────────────────────
  async function sbDelete(table, id, tenantId) {
    if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY ausente');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: 'DELETE',
        headers: {
          apikey:        SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!r.ok) throw new Error(`${table} DELETE ${r.status}: ${await r.text()}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MISSIONS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/goals/missions
  router.get('/goals/missions', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const rows = await sbFetch(
        `missions?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error('[goals/missions GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/goals/missions
  router.post('/goals/missions', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { title, description, due_date, status } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

      const row = await supabaseInsert('missions', {
        tenant_id:   tenantId,
        title:       title.trim(),
        description: description?.trim() || null,
        due_date:    due_date || null,
        status:      status || 'active',
        created_by:  req.user.id,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[goals/missions POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/goals/missions/:id
  router.patch('/goals/missions/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const allowed = ['title', 'description', 'due_date', 'status'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await sbPatch('missions', req.params.id, tenantId, updates);
      if (!row) return res.status(404).json({ error: 'mission não encontrada' });
      res.json(row);
    } catch (err) {
      console.error('[goals/missions PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/goals/missions/:id
  router.delete('/goals/missions/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      // Verifica se há projetos vinculados
      const projects = await sbFetch(
        `projects?mission_id=eq.${req.params.id}&tenant_id=eq.${tenantId}&select=id&limit=1`
      );
      if (projects?.length) {
        return res.status(409).json({ error: 'mission possui projetos vinculados — remova-os primeiro' });
      }

      await sbDelete('missions', req.params.id, tenantId);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[goals/missions DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/goals/projects
  router.get('/goals/projects', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      let qs = `projects?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`;
      if (req.query.mission_id) qs += `&mission_id=eq.${encodeURIComponent(req.query.mission_id)}`;

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[goals/projects GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/goals/projects
  router.post('/goals/projects', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { mission_id, title, description, status } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

      const row = await supabaseInsert('projects', {
        tenant_id:   tenantId,
        mission_id:  mission_id || null,
        title:       title.trim(),
        description: description?.trim() || null,
        status:      status || 'active',
        created_by:  req.user.id,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[goals/projects POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/goals/projects/:id
  router.patch('/goals/projects/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const allowed = ['mission_id', 'title', 'description', 'status'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await sbPatch('projects', req.params.id, tenantId, updates);
      if (!row) return res.status(404).json({ error: 'project não encontrado' });
      res.json(row);
    } catch (err) {
      console.error('[goals/projects PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/goals/projects/:id
  router.delete('/goals/projects/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      await sbDelete('projects', req.params.id, tenantId);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[goals/projects DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GOALS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/goals/goals
  router.get('/goals/goals', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      let qs = `goals?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`;
      if (req.query.project_id) qs += `&project_id=eq.${encodeURIComponent(req.query.project_id)}`;

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[goals/goals GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/goals/goals
  router.post('/goals/goals', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { project_id, title, description, metric_type, target_value, due_date, status } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

      const row = await supabaseInsert('goals', {
        tenant_id:     tenantId,
        project_id:    project_id || null,
        title:         title.trim(),
        description:   description?.trim() || null,
        metric_type:   metric_type || 'count',
        target_value:  target_value ?? 1,
        current_value: 0,
        due_date:      due_date || null,
        status:        status || 'active',
        created_by:    req.user.id,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[goals/goals POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/goals/goals/:id
  router.patch('/goals/goals/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const allowed = ['project_id', 'title', 'description', 'metric_type', 'target_value', 'current_value', 'due_date', 'status'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await sbPatch('goals', req.params.id, tenantId, updates);
      if (!row) return res.status(404).json({ error: 'goal não encontrado' });
      res.json(row);
    } catch (err) {
      console.error('[goals/goals PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/goals/goals/:id
  router.delete('/goals/goals/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      await sbDelete('goals', req.params.id, tenantId);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[goals/goals DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/goals/tasks
  router.get('/goals/tasks', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      let qs = `goal_tasks?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`;
      if (req.query.goal_id) qs += `&goal_id=eq.${encodeURIComponent(req.query.goal_id)}`;

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[goals/tasks GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/goals/tasks
  router.post('/goals/tasks', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { goal_id, title, description, status, priority, assignee_agent, due_date } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

      const row = await supabaseInsert('goal_tasks', {
        tenant_id:      tenantId,
        goal_id:        goal_id || null,
        title:          title.trim(),
        description:    description?.trim() || null,
        status:         status || 'todo',
        priority:       priority || 'medium',
        assignee_agent: assignee_agent?.trim() || null,
        due_date:       due_date || null,
        created_by:     req.user.id,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[goals/tasks POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/goals/tasks/:id
  // Note: status transitions to 'done' auto-increment goal progress via DB trigger
  router.patch('/goals/tasks/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const allowed = ['goal_id', 'title', 'description', 'status', 'priority', 'assignee_agent', 'due_date', 'completed_at'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      // Auto-set completed_at when marking done
      if (updates.status === 'done' && !updates.completed_at) {
        updates.completed_at = new Date().toISOString();
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await sbPatch('goal_tasks', req.params.id, tenantId, updates);
      if (!row) return res.status(404).json({ error: 'task não encontrada' });
      res.json(row);
    } catch (err) {
      console.error('[goals/tasks PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/goals/tasks/:id
  router.delete('/goals/tasks/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      await sbDelete('goal_tasks', req.params.id, tenantId);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[goals/tasks DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY — full cascade for tenant
  // GET /api/goals/summary
  // Returns: { missions: [{ ...mission, progress_pct, projects: [{ ...project, goals: [{ ...goal, tasks_done, tasks_total }] }] }] }
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/goals/summary', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      // Fetch all data in parallel
      const [missions, projects, goals, tasks] = await Promise.all([
        sbFetch(`missions?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`),
        sbFetch(`projects?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`),
        sbFetch(`goals?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`),
        sbFetch(`goal_tasks?tenant_id=eq.${tenantId}&select=id,goal_id,status`),
      ]);

      const missionsArr  = missions  || [];
      const projectsArr  = projects  || [];
      const goalsArr     = goals     || [];
      const tasksArr     = tasks     || [];

      // Build goals with task counts
      const goalsWithTasks = goalsArr.map(goal => {
        const goalTasks   = tasksArr.filter(t => t.goal_id === goal.id);
        const tasks_total = goalTasks.length;
        const tasks_done  = goalTasks.filter(t => t.status === 'done').length;
        const progress_pct = goal.target_value > 0
          ? Math.min(100, (Number(goal.current_value) / Number(goal.target_value)) * 100)
          : 0;
        return { ...goal, tasks_done, tasks_total, progress_pct };
      });

      // Build projects with goals
      const projectsWithGoals = projectsArr.map(project => {
        const projectGoals = goalsWithTasks.filter(g => g.project_id === project.id);
        return { ...project, goals: projectGoals };
      });

      // Build missions with projects (and orphan projects under null mission)
      const result = missionsArr.map(mission => {
        const missionProjects = projectsWithGoals.filter(p => p.mission_id === mission.id);

        // Calculate mission-level progress: average of all goal progress_pcts
        const allGoals = missionProjects.flatMap(p => p.goals);
        const progress_pct = allGoals.length > 0
          ? allGoals.reduce((sum, g) => sum + (g.progress_pct || 0), 0) / allGoals.length
          : 0;

        return { ...mission, progress_pct: Math.round(progress_pct * 10) / 10, projects: missionProjects };
      });

      res.json({ missions: result });
    } catch (err) {
      console.error('[goals/summary GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
