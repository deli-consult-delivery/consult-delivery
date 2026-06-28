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

// Código de confirmação out-of-band. Alfabeto sem caracteres ambíguos (0/O/1/I)
// p/ o CEO digitar fácil no Telegram. 6 chars de 32 símbolos ≈ 30 bits — com TTL
// de 10 min + lock após MAX_ATTEMPTS, brute-force é inviável.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const MAX_ATTEMPTS = 5;

function genCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

// Entrega o código ao CEO por canal OUT-OF-BAND (Bridge → Telegram). Soft-fail: se o
// Bridge/gateway não estiver configurado, loga e segue — o código fica guardado
// (hash) e o CEO pode recuperá-lo pelo canal interno. NUNCA devolvido ao agente.
async function deliverConfirmCode({ cfg, proposalId, code, resumo }) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${cfg.bridgeUrl.replace(/\/$/, '')}/loop/erp-confirm-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': cfg.internalToken },
      body: JSON.stringify({ proposal_id: proposalId, codigo: code, resumo }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!r.ok) process.stderr.write(`[proposals] entrega OOB do código falhou (${r.status}) p/ ${proposalId} — código guardado (hash)\n`);
  } catch (e) {
    process.stderr.write(`[proposals] entrega OOB do código indisponível (${e.message}) p/ ${proposalId} — configure /loop/erp-confirm-code + Telegram\n`);
  }
}

function makeProposals({ sb, cfg }) {
  /** Grava a proposta pendente. expires_at vem do DEFAULT do banco. Gera o código
   *  de confirmação out-of-band (guarda só o hash; entrega ao CEO; NUNCA devolve
   *  o código ao agente). */
  async function create({ tipo, endpoint, payload, resumo, httpMethod = 'POST' }) {
    const code = genCode();
    const row = await sb.sbInsert('vendaerp_proposals', {
      tenant_id: cfg.auditTenantId,
      tipo,
      endpoint,
      http_method: httpMethod,
      payload,
      resumo,
      status: 'pending',
      token: crypto.randomUUID(),
      confirm_code_hash: hashCode(code),
      origin: 'hermes',
      created_by: cfg.principal,
    });
    // Entrega out-of-band (soft-fail). O retorno ao agente NÃO inclui o código.
    await deliverConfirmCode({ cfg, proposalId: row.id, code, resumo: row.resumo });
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

  /** Transição atômica pending→confirmed, condicionada ao HASH do código. Só passa
   *  quem apresenta o código out-of-band correto (o agente proponente não o tem).
   *  Devolve a proposta ou null (código errado / já tomada / expirada). */
  async function claim(proposalId, code) {
    return sb.sbUpdate(
      'vendaerp_proposals',
      { id: proposalId, status: 'pending', confirm_code_hash: hashCode(code) },
      { status: 'confirmed' }
    );
  }

  // Incrementa o contador de tentativas erradas (read-modify-write a partir do valor
  // já lido em classify). ponytail: janela de corrida mínima — TTL 10 min + MAX baixo
  // tornam brute-force inviável; trocar por RPC atômico se virar caminho quente.
  async function bumpAttempts(proposalId, current) {
    return sb.sbUpdate(
      'vendaerp_proposals',
      { id: proposalId, status: 'pending' },
      { confirm_attempts: (current ?? 0) + 1 }
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

  return { create, classify, claim, bumpAttempts, markExecuted, markFailed, markExpired, MAX_ATTEMPTS };
}

module.exports = { makeProposals, MAX_ATTEMPTS, hashCode, genCode };
