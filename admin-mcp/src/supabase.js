// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — acesso PostgREST via fetch com a service key.
//
// Mesma abordagem do bridge (bridge-server/routes/inadimplentes.js): fetch direto
// no REST, sem @supabase/supabase-js. A service key bypassa RLS — daí TODA leitura
// deste MCP ser auditada na camada de cima (audit.js). Este módulo só lê/escreve;
// quem decide o que pode é o registry de tools + o audit.
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
   * SELECT via PostgREST. `qs` é a querystring já montada (select, filtros, order…).
   * @returns {Promise<Array<object>>}
   */
  async function sbGet(table, qs) {
    const url = `${base}/rest/v1/${table}?${qs}`;
    const r = await fetch(url, { headers: headers() });
    const body = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(body)) {
      const detail = body && body.message ? body.message : JSON.stringify(body);
      throw new Error(`[supabase] GET ${table} falhou (${r.status}): ${detail}`);
    }
    return body;
  }

  /**
   * INSERT via PostgREST com `Prefer: return=representation` (devolve a linha criada).
   * @returns {Promise<object>} a linha inserida
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

  return { sbGet, sbInsert };
}

module.exports = { makeSupabase };
