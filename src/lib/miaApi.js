/**
 * MIA-03: Wrappers para as rotas do Monitor IA no bridge
 *
 * Todas as chamadas exigem JWT do usuário logado.
 * Base URL via VITE_BRIDGE_URL (fallback bridge.consultdelivery.com.br).
 */

import { supabase } from './supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

async function apiFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const res = await fetch(`${BRIDGE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
    ...opts,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`miaApi ${path} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.status === 204 ? null : res.json();
}

// ── Vínculos WhatsApp ────────────────────────────────────────────────────────

export const getVinculos = (lojaId) =>
  apiFetch(`/lojas/${lojaId}/whatsapp-vinculo`);

export const createVinculo = (lojaId, body) =>
  apiFetch(`/lojas/${lojaId}/whatsapp-vinculo`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const patchVinculo = (id, body) =>
  apiFetch(`/whatsapp-vinculo/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteVinculo = (id) =>
  apiFetch(`/whatsapp-vinculo/${id}`, { method: 'DELETE' });

// ── Sugestões IA ─────────────────────────────────────────────────────────────

export const getSugestoes = (lojaId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/lojas/${lojaId}/sugestoes-ia${qs ? `?${qs}` : ''}`);
};

export const aprovarSugestao = (id, textoEditado) =>
  apiFetch(`/sugestoes-ia/${id}/aprovar`, {
    method: 'POST',
    body: JSON.stringify(textoEditado ? { texto_editado: textoEditado } : {}),
  });

export const rejeitarSugestao = (id, motivo) =>
  apiFetch(`/sugestoes-ia/${id}/rejeitar`, {
    method: 'POST',
    body: JSON.stringify(motivo ? { motivo } : {}),
  });

// ── DOC (client_facts) ────────────────────────────────────────────────────────

export const getDoc = (lojaId) =>
  apiFetch(`/lojas/${lojaId}/doc`);

export const createFact = (lojaId, body) =>
  apiFetch(`/lojas/${lojaId}/doc`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const patchFact = (factId, body) =>
  apiFetch(`/doc/${factId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteFact = (factId) =>
  apiFetch(`/doc/${factId}`, { method: 'DELETE' });

// ── Audit ─────────────────────────────────────────────────────────────────────

export const getMiaAudit = (lojaId, limit = 50) =>
  apiFetch(`/lojas/${lojaId}/mia-audit?limit=${limit}`);
