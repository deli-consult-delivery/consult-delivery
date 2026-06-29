// lib/semaforo.js — GATE de semáforo codificado no SERVIDOR (Blueprint v2 §4 / GATE 0).
//
// Fonte ÚNICA da regra de autonomia. Antes, autonomy_level era só um campo no banco
// e o envio a cliente confiava na UI. Aqui o servidor DECIDE se um draft pode ser
// enviado, dado o nível e se há aprovação humana explícita no ato:
//
//   verde   (modo ia)      → envia (humano ou automático)
//   amarelo (modo hibrido) → só com aprovação humana explícita
//   vermelho(modo humano)  → só com aprovação humana explícita
//
// Fail-closed: nível ausente/desconhecido NÃO envia. Um caminho automático (sem
// humano) só passa para 'verde' — é isto que impede auto-envio de amarelo/vermelho.
'use strict';

const MODO_TO_SEMAFORO = { ia: 'verde', hibrido: 'amarelo', humano: 'vermelho' };
const NIVEIS_VALIDOS = new Set(['verde', 'amarelo', 'vermelho']);

/** Traduz o modo do tenant (tenant_agent_config) no semáforo. */
function modoToSemaforo(modo) {
  return MODO_TO_SEMAFORO[modo] || null;
}

/**
 * Decide se um draft pode ser ENVIADO a cliente.
 * @param {{autonomyLevel?: string, viaHumano?: boolean}} p
 *   autonomyLevel: 'verde'|'amarelo'|'vermelho' (do agent_drafts)
 *   viaHumano: true se é uma aprovação humana explícita (clique no painel/comando do CEO)
 * @returns {{allowed: boolean, reason: string|null}}
 */
function decideEnvio({ autonomyLevel, viaHumano = false } = {}) {
  const nivel = String(autonomyLevel || '').toLowerCase();
  if (!NIVEIS_VALIDOS.has(nivel)) {
    return { allowed: false, reason: `autonomy_level inválido/ausente ("${autonomyLevel}") — envio bloqueado (fail-closed)` };
  }
  if (nivel === 'verde') {
    return { allowed: true, reason: null };
  }
  // amarelo / vermelho: exigem aprovação humana explícita no ato do envio.
  if (viaHumano) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: `semáforo ${nivel}: envio a cliente exige aprovação humana explícita` };
}

module.exports = { decideEnvio, modoToSemaforo, MODO_TO_SEMAFORO, NIVEIS_VALIDOS };
