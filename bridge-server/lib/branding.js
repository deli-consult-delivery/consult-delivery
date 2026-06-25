'use strict';

// Só aceita logo via https:// — bloqueia javascript: / data: / http inseguro
function safeLogoUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Busca branding público do tenant (nome, cores, logo).
// Retorna null em falha — branding é cosmético, não derruba a tela.
async function getBrandByTenant(sbFetch, tenantId) {
  try {
    const rows = await sbFetch(
      `tenants?id=eq.${encodeURIComponent(tenantId)}&select=name,color,theme_color,logo_url&limit=1`
    );
    const t = rows?.[0];
    if (!t) return null;
    return {
      name:        t.name        ?? null,
      color:       t.color       ?? null,
      theme_color: t.theme_color ?? null,
      logo_url:    safeLogoUrl(t.logo_url),
    };
  } catch (err) {
    console.error('[branding getBrandByTenant]', err.message);
    return null;
  }
}

// Busca configuração de avaliação do tenant (campos de texto customizáveis).
// Retorna null se não existir.
async function getAvaliacaoConfig(sbFetch, tenantId) {
  try {
    const rows = await sbFetch(
      `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&select=csat_titulo,csat_subtitulo,csat_agradecimento,nps_titulo,nps_subtitulo,nps_agradecimento` +
      `&limit=1`
    );
    return rows?.[0] ?? null;
  } catch (err) {
    console.error('[branding getAvaliacaoConfig]', err.message);
    return null;
  }
}

module.exports = { safeLogoUrl, getBrandByTenant, getAvaliacaoConfig };
