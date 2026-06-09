// pgrest.js — utilitários pequenos para montar querystrings PostgREST e tratar
// resultados. Mantém as tools enxutas e consistentes.
'use strict';

/** Limita `n` ao intervalo [1, maxLimit], com fallback no defaultLimit. */
function clampLimit(cfg, n) {
  const v = Number.isFinite(n) ? Math.floor(n) : cfg.defaultLimit;
  return Math.max(1, Math.min(cfg.maxLimit, v));
}

/** Filtro de igualdade PostgREST: col=eq.<valor> (valor URL-encoded). */
function eq(col, val) {
  return `${col}=eq.${encodeURIComponent(val)}`;
}

/** Filtro IN PostgREST: col=in.(a,b,c). */
function inList(col, vals) {
  const inner = vals.map((v) => encodeURIComponent(v)).join(',');
  return `${col}=in.(${inner})`;
}

/** Junta partes não-vazias de querystring com '&'. */
function qs(...parts) {
  return parts.filter(Boolean).join('&');
}

/** Extrai os tenant_id distintos (não-nulos) de uma lista de linhas — p/ auditoria. */
function distinctTenants(rows) {
  return [...new Set(rows.map((r) => r && r.tenant_id).filter(Boolean))];
}

module.exports = { clampLimit, eq, inList, qs, distinctTenants };
