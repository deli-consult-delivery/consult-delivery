// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — só o INSERT em audit_log via PostgREST (molde admin-mcp).
//
// Este MCP NÃO lê dados de negócio do Supabase — quem lê é o Bridge (do ERP).
// Aqui o Supabase serve apenas p/ a trilha de auditoria. A service key bypassa
// RLS; por isso ela só é usada para escrever audit_log, nada mais.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

function makeSupabase({ supabaseUrl, supabaseServiceKey }) {
  const base = supabaseUrl.replace(/\/$/, '');

  function headers(extra) {
    return {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /**
   * INSERT via PostgREST. Aceita objeto ou array de linhas.
   * @returns {Promise<object|object[]>}
   */
  async function sbInsert(table, row) {
    const url = `${base}/rest/v1/${table}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const detail = body && body.message ? body.message : JSON.stringify(body);
      throw new Error(`[supabase] INSERT ${table} falhou (${r.status}): ${detail}`);
    }
    return Array.isArray(body) ? body[0] : body;
  }

  /**
   * SELECT 1 linha via PostgREST. filters = { coluna: valor } (igualdade).
   * @returns {Promise<object|null>}
   */
  async function sbSelectOne(table, filters, columns = '*') {
    const params = new URLSearchParams();
    params.set('select', columns);
    for (const [k, v] of Object.entries(filters || {})) params.set(k, `eq.${v}`);
    params.set('limit', '1');
    const url = `${base}/rest/v1/${table}?${params.toString()}`;
    const r = await fetch(url, { headers: headers() });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const detail = body && body.message ? body.message : JSON.stringify(body);
      throw new Error(`[supabase] SELECT ${table} falhou (${r.status}): ${detail}`);
    }
    return Array.isArray(body) ? (body[0] ?? null) : body;
  }

  /**
   * PATCH condicional via PostgREST. filters = { coluna: valor } (igualdade) —
   * todos viram cláusula eq, então é seguro para transição atômica de estado
   * (ex.: id=eq.X & status=eq.pending). Devolve a linha afetada ou null se 0 linhas.
   * @returns {Promise<object|null>}
   */
  async function sbUpdate(table, filters, patch) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters || {})) params.set(k, `eq.${v}`);
    const url = `${base}/rest/v1/${table}?${params.toString()}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const detail = body && body.message ? body.message : JSON.stringify(body);
      throw new Error(`[supabase] UPDATE ${table} falhou (${r.status}): ${detail}`);
    }
    return Array.isArray(body) ? (body[0] ?? null) : body;
  }

  return { sbInsert, sbSelectOne, sbUpdate };
}

module.exports = { makeSupabase };
