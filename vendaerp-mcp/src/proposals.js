// ─────────────────────────────────────────────────────────────────────────────
// proposals.js — ciclo de vida de uma proposta de escrita (vendaerp_proposals).
//
// create()   : grava status='pending' e devolve {proposal_id, resumo, expires_at}.
// classify() : lê e diz em que estado a proposta está (p/ mensagem ao usuário).
// claim()    : transição ATÔMICA pending→confirmed (uso único real). Devolve a
//              proposta se ganhou a corrida, ou null se já tomada/expirada/inexistente.
// markExecuted()/markFailed()/markExpired(): estados terminais pós-claim.
//
// O token existe por fidelidade à spec e auditoria; o uso-único é garantido pelo
// claim() atômico, não pelo token (PostgREST PATCH condicional ?status=eq.pending).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('node:crypto');

function makeProposals({ sb, cfg }) {
  /** Grava a proposta pendente. expires_at vem do DEFAULT do banco. */
  async function create({ tipo, endpoint, payload, resumo, httpMethod = 'POST' }) {
    const row = await sb.sbInsert('vendaerp_proposals', {
      tenant_id: cfg.auditTenantId,
      tipo,
      endpoint,
      http_method: httpMethod,
      payload,
      resumo,
      status: 'pending',
      token: crypto.randomUUID(),
      origin: 'hermes',
      created_by: cfg.principal,
    });
    return { proposal_id: row.id, resumo: row.resumo, expires_at: row.expires_at };
  }

  /** Lê e classifica: not_found | expired | already | pending. */
  async function classify(proposalId) {
    const row = await sb.sbSelectOne('vendaerp_proposals', { id: proposalId });
    if (!row) return { state: 'not_found', row: null };
    if (row.status !== 'pending') return { state: 'already', row };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { state: 'expired', row };
    return { state: 'pending', row };
  }

  /** Transição atômica pending→confirmed. Devolve a proposta ou null. */
  async function claim(proposalId) {
    return sb.sbUpdate(
      'vendaerp_proposals',
      { id: proposalId, status: 'pending' },
      { status: 'confirmed' }
    );
  }

  // Só o vencedor do claim (status='confirmed') transiciona para executed/failed.
  // Filtro condicional espelha o claim(): PATCH só afeta a linha se ainda confirmed,
  // evitando sobrescrever um estado mudado por corrida (devolve null se 0 linhas).
  async function markExecuted(proposalId, resultado) {
    return sb.sbUpdate('vendaerp_proposals', { id: proposalId, status: 'confirmed' }, {
      status: 'executed',
      executed_at: new Date().toISOString(),
      resultado,
    });
  }

  async function markFailed(proposalId, erro) {
    return sb.sbUpdate('vendaerp_proposals', { id: proposalId, status: 'confirmed' }, { status: 'failed', erro });
  }

  async function markExpired(proposalId) {
    return sb.sbUpdate('vendaerp_proposals', { id: proposalId, status: 'pending' }, { status: 'expired' });
  }

  return { create, classify, claim, markExecuted, markFailed, markExpired };
}

module.exports = { makeProposals };
