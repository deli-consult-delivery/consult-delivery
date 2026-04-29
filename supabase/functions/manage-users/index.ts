// Supabase Edge Function — User Management (Admin only)
// Actions: create | update | delete
// Never expose service role key to the frontend — all admin ops happen here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Verify caller JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const { data: { user: caller }, error: authErr } =
    await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { action, tenant_id } = body;
  if (!action || !tenant_id) return json({ error: 'action and tenant_id are required' }, 400);

  // Verify caller is admin/owner of this tenant
  const { data: callerMembership } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant_id)
    .eq('user_id', caller.id)
    .single();

  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return json({ error: 'Forbidden: admin role required' }, 403);
  }

  // ── CREATE ────────────────────────────────────────────────
  if (action === 'create') {
    const { email, password, name, role, semaforo } = body;
    if (!email || !password) return json({ error: 'email and password are required' }, 400);

    // Create Supabase Auth user (auto-confirm email, no invite email)
    const { data: { user }, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || email },
      });

    if (createErr || !user) {
      return json({ error: createErr?.message || 'Failed to create auth user' }, 500);
    }

    // Upsert profile record
    await supabaseAdmin.from('profiles').upsert({
      id:        user.id,
      full_name: name || email,
      email,
    });

    // Insert tenant membership
    const { error: memberErr } = await supabaseAdmin.from('tenant_members').insert({
      tenant_id,
      user_id:      user.id,
      role:         role      || 'operador',
      semaforo:     semaforo  || 'verde',
      display_name: name      || null,
    });

    if (memberErr) {
      // Rollback auth user so we don't orphan it
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      return json({ error: memberErr.message }, 500);
    }

    console.log('[manage-users] created user', user.id, email, role);
    return json({ user_id: user.id });
  }

  // ── UPDATE ────────────────────────────────────────────────
  if (action === 'update') {
    const { user_id, role, semaforo, name } = body;
    if (!user_id) return json({ error: 'user_id required' }, 400);

    const memberUpdates: Record<string, string> = {};
    if (role)     memberUpdates.role     = role;
    if (semaforo) memberUpdates.semaforo = semaforo;
    if (name)     memberUpdates.display_name = name;

    if (Object.keys(memberUpdates).length) {
      await supabaseAdmin.from('tenant_members')
        .update(memberUpdates)
        .eq('tenant_id', tenant_id)
        .eq('user_id', user_id);
    }

    if (name) {
      await supabaseAdmin.from('profiles')
        .update({ full_name: name })
        .eq('id', user_id);
    }

    console.log('[manage-users] updated user', user_id, memberUpdates);
    return json({ ok: true });
  }

  // ── DELETE ────────────────────────────────────────────────
  if (action === 'delete') {
    const { user_id } = body;
    if (!user_id) return json({ error: 'user_id required' }, 400);

    if (user_id === caller.id) {
      return json({ error: 'Cannot delete your own account' }, 400);
    }

    // Remove from this tenant
    await supabaseAdmin.from('tenant_members')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('user_id', user_id);

    // Only delete auth user if they have no other tenant memberships
    const { data: remaining } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user_id);

    if (!remaining?.length) {
      await supabaseAdmin.auth.admin.deleteUser(user_id);
      console.log('[manage-users] deleted auth user', user_id);
    } else {
      console.log('[manage-users] removed from tenant, user has other memberships', user_id);
    }

    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
