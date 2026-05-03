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

const corsJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });

const corsText = (text: string, status = 200) =>
  new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') return corsText('Method Not Allowed', 405);

  // Verify caller JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return corsJson({ error: 'Unauthorized' }, 401);

  const { data: { user: caller }, error: authErr } =
    await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) return corsJson({ error: 'Unauthorized' }, 401);

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return corsJson({ error: 'Invalid JSON' }, 400); }

  const { action, tenant_id } = body;
  if (!action || !tenant_id) return corsJson({ error: 'action and tenant_id are required' }, 400);

  // Verify caller is admin/owner of this tenant
  const { data: callerMembership } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant_id)
    .eq('user_id', caller.id)
    .single();

  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return corsJson({ error: 'Forbidden: admin role required' }, 403);
  }

  // ── CREATE ────────────────────────────────────────────────
  if (action === 'create') {
    const { email, password, name, role, semaforo } = body;
    if (!email || !password) return corsJson({ error: 'email and password are required' }, 400);

    // Try to create Supabase Auth user (auto-confirm email, no invite email)
    let { data: { user }, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || email },
      });

    // Detect "user already exists" across common Supabase error variants
    const errMsg = (createErr?.message || '').toLowerCase();
    const isAlreadyRegistered =
      createErr?.code === 'email_address_in_use' ||
      createErr?.code === 'user_already_exists' ||
      errMsg.includes('already registered') ||
      errMsg.includes('already exists') ||
      errMsg.includes('already been registered') ||
      errMsg.includes('duplicate') ||
      errMsg.includes('já existe');

    // If user already exists, fetch them and reuse
    if (isAlreadyRegistered) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) return corsJson({ error: listErr.message }, 500);
      user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      if (!user) return corsJson({ error: 'User exists but could not be found' }, 500);
    } else if (createErr || !user) {
      return corsJson({ error: createErr?.message || 'Failed to create auth user' }, 500);
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
      // Rollback auth user only if we created it (not reused)
      if (!isAlreadyRegistered) {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
      }
      return corsJson({ error: memberErr.message }, 500);
    }

    console.log('[manage-users] created/reused user', user.id, email, role);
    return corsJson({ user_id: user.id });
  }

  // ── ADOPT (add existing auth user to tenant) ─────────────
  if (action === 'adopt') {
    const { email, name, role, semaforo } = body;
    if (!email) return corsJson({ error: 'email is required' }, 400);

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return corsJson({ error: listErr.message }, 500);

    const user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
    if (!user) return corsJson({ error: 'Usuário não encontrado no Supabase Auth' }, 404);

    // Upsert profile record
    await supabaseAdmin.from('profiles').upsert({
      id:        user.id,
      full_name: name || user.user_metadata?.full_name || email,
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
      return corsJson({ error: memberErr.message }, 500);
    }

    console.log('[manage-users] adopted user', user.id, email, role);
    return corsJson({ user_id: user.id });
  }

  // ── UPDATE ────────────────────────────────────────────────
  if (action === 'update') {
    const { user_id, role, semaforo, name } = body;
    if (!user_id) return corsJson({ error: 'user_id required' }, 400);

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
    return corsJson({ ok: true });
  }

  // ── DELETE ────────────────────────────────────────────────
  if (action === 'delete') {
    const { user_id } = body;
    if (!user_id) return corsJson({ error: 'user_id required' }, 400);

    if (user_id === caller.id) {
      return corsJson({ error: 'Cannot delete your own account' }, 400);
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

    return corsJson({ ok: true });
  }

  return corsJson({ error: 'Unknown action' }, 400);
});
