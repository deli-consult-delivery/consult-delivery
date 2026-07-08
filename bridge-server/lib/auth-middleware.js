// bridge-server/lib/auth-middleware.js
// Extraído de index.js (mesma lógica, comportamento idêntico) para ficar
// testável offline sem `require` do monólito inteiro (que faz app.listen() e
// monta ~40 rotas com side effects na importação). Env vars lidas lazy dentro
// de cada função (nunca cacheadas em const de módulo) — permite teste setar/
// limpar process.env por cenário, sem reload de módulo.
'use strict';

const { timingSafeEqual } = require('crypto');

// ── Helper: comparação de token constant-time (anti timing side-channel) ────
function safeTokenEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Middleware: internal token (FAIL-CLOSED) ─────────────────────────────────
// Sem token configurado, recusar TUDO (nunca `return next()` = fail-open).
function requireInternalToken(req, res, next) {
  const INTERNAL_BRIDGE_TOKEN = process.env.INTERNAL_BRIDGE_TOKEN;
  if (!INTERNAL_BRIDGE_TOKEN)
    return res.status(503).json({ error: 'internal auth not configured' });
  if (!safeTokenEqual(req.headers['x-internal-token'], INTERNAL_BRIDGE_TOKEN))
    return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ── Middleware: JWT Supabase ──────────────────────────────────────────────────
async function requireJwt(req, res, next) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return res.status(401).json({ error: 'missing token' });
  if (!SUPABASE_ANON_KEY) {
    req.user = { id: 'dev' };
    return next();
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${auth}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) return res.status(401).json({ error: 'invalid token' });
    req.user = await r.json();
    req.jwt = auth;
    next();
  } catch (err) {
    res.status(401).json({ error: 'auth error', detail: err.message });
  }
}

// ── Middleware: JWT or internal token (endpoints chamados por Trigger.dev) ──
async function requireJwtOrInternal(req, res, next) {
  const INTERNAL_BRIDGE_TOKEN = process.env.INTERNAL_BRIDGE_TOKEN;
  const internalToken = req.headers['x-internal-token'];
  if (internalToken) {
    if (!INTERNAL_BRIDGE_TOKEN)
      return res.status(503).json({ error: 'internal auth not configured' });
    if (!safeTokenEqual(internalToken, INTERNAL_BRIDGE_TOKEN))
      return res.status(401).json({ error: 'unauthorized' });
    return next();
  }
  return requireJwt(req, res, next);
}

// Helper: verifica se req.user é membro do tenant_id solicitado. `sbFetch`
// injetado (mesma assinatura do sbFetch de index.js) — sem depender de env
// module-scoped, testável com um stub.
//
// Membership hierárquica: se o usuário não for membro DIRETO do tenant, sobe a
// árvore `parent_tenant_id` (mesma lógica do resolveRole em src/lib/api.js:33-42)
// e checa membership em cada ancestral. Isto fecha o gap onde o switcher do
// ConsoleV2 (listTenantsWithRole, RLS hierárquica) mostra stores filhos a um
// usuário-agência que é membro só do tenant-pai — sem isto o bridge recusava
// 403 nas rotas gated (ex: card Notas iFood em cd-homolog/cd-demo).
// Fail-closed: qualquer erro ao subir a árvore vira 403, nunca abre acesso.
function makeAssertTenantMember(sbFetch) {
  return async function assertTenantMember(req, res, tenant_id) {
    // Guard: caminho interno (x-internal-token) não popula req.user. Nenhum
    // caller atual chega aqui sem req.user, mas sem isto um futuro caller
    // interno crasharia com TypeError ao ler req.user.id.
    if (!req.user?.id) {
      res.status(401).json({ error: 'Autenticação de usuário obrigatória para esta verificação' });
      return false;
    }
    const userId = req.user.id;

    // 1) membership DIRETA no tenant solicitado.
    const direct = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    if (Array.isArray(direct) && direct.length) return true;

    // 2) sem membership direta → sobe a árvore parent_tenant_id checando
    // membership em cada ancestral. `seen` protege contra ciclo (parent
    // apontando p/ ancestral já visitado) e profundidade máxima por segurança.
    const seen = new Set([tenant_id]);
    let curId = tenant_id;
    for (let depth = 0; depth < 16; depth++) {
      let tenantRow;
      try {
        const rows = await sbFetch(
          `tenants?id=eq.${encodeURIComponent(curId)}&select=parent_tenant_id&limit=1`
        );
        tenantRow = Array.isArray(rows) ? rows[0] : null;
      } catch {
        break; // falha ao ler tenant → fail-closed (cai no 403 abaixo)
      }
      const parent = tenantRow?.parent_tenant_id;
      if (!parent || seen.has(parent)) break;
      seen.add(parent);
      try {
        const ancestorRows = await sbFetch(
          `tenant_members?tenant_id=eq.${encodeURIComponent(parent)}&user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
        );
        if (Array.isArray(ancestorRows) && ancestorRows.length) return true;
      } catch {
        break; // falha ao checar membership ancestral → fail-closed
      }
      curId = parent;
    }

    res.status(403).json({ error: 'Acesso negado: usuário não é membro deste tenant' });
    return false;
  };
}

module.exports = {
  safeTokenEqual,
  requireInternalToken,
  requireJwt,
  requireJwtOrInternal,
  makeAssertTenantMember,
};
