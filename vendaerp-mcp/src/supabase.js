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

  return { sbInsert };
}

module.exports = { makeSupabase };
