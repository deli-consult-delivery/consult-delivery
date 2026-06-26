'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Decisão NPS × CSAT + criação do registro pendente.
//
// Fonte única do modelo de pesquisa para o caminho por EVENTO (webhook). Espelha
// a lógica de trigger/multicanal/datacrazy-nps-poller.ts (o poller TS é a rede de
// segurança e mantém sua própria cópia — as regras devem andar juntas).
//
// Regra:
//  • 1º atendimento de sempre do cliente → CSAT (NPS no 1º contato é prematuro).
//  • 2º em diante → NPS se fora do cooldown (30d); senão CSAT.
//  • Nunca os dois. Dedup por finalização (external_ref = conv.id:updatedAt, 120min).
//  • Baseline: ignora conversas finalizadas antes de nps_baseline_at.
// ════════════════════════════════════════════════════════════════════════════

const { renderTemplate } = require('./datacrazy-send');

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'https://app.consultdelivery.com.br';

// Janela curta p/ deduplicar a MESMA finalização (entrega dupla de webhook ou
// sobreposição com o poller de segurança). Re-avaliações futuras seguem o cooldown.
const DEDUP_FINALIZACAO_MIN = 120;

const enc = (v) => encodeURIComponent(v);

/**
 * @param {object} args
 * @param {Function} args.sbFetch  helper PostgREST do bridge
 * @param {string} args.tenantId
 * @param {object} args.config     linha avaliacao_config (nps_baseline_at, nps_cooldown_dias,
 *                                  csat_mensagem_template, nps_mensagem_template, nome_empresa)
 * @param {object} args.conv       { id, updatedAt, phoneNumber, name }
 * @returns {Promise<{status:'criado'|'ja_processado'|'filtrado', tipo?:'nps'|'csat',
 *                    recordId?:string, publicToken?:string, link?:string, text?:string,
 *                    contactName?:string, detalhe?:string}>}
 */
async function decidirECriarRegistro({ sbFetch, tenantId, config, conv }) {
  const contactIdentifier = conv.phoneNumber || conv.id;
  const contactName       = conv.name || null;
  const finalizacaoRef    = `${conv.id}:${conv.updatedAt || ''}`;

  // ── Baseline (anti-backlog) ───────────────────────────────────────────────
  if (config.nps_baseline_at && conv.updatedAt &&
      new Date(conv.updatedAt) <= new Date(config.nps_baseline_at)) {
    return { status: 'filtrado', detalhe: 'anterior ao baseline' };
  }

  // ── Dedup da finalização (NPS + CSAT) ─────────────────────────────────────
  // Casa por PREFIXO conv.id: (não pelo finalizacaoRef exato) para que webhook e
  // poller de segurança nunca dupliquem, mesmo que o updatedAt difira em precisão
  // entre a API de lista (poller) e a unitária (webhook). Janela de 120 min.
  const dedupCutoff = new Date(Date.now() - DEDUP_FINALIZACAO_MIN * 60 * 1000).toISOString();
  const refPrefix = `like.${enc(conv.id + ':')}*`;
  const [jaNps, jaCsat] = await Promise.all([
    sbFetch(`nps_avaliacoes?tenant_id=eq.${enc(tenantId)}&external_ref=${refPrefix}&created_at=gte.${enc(dedupCutoff)}&select=id&limit=1`),
    sbFetch(`atendimento_avaliacoes?tenant_id=eq.${enc(tenantId)}&external_ref=${refPrefix}&created_at=gte.${enc(dedupCutoff)}&select=id&limit=1`),
  ]);
  if (jaNps?.length || jaCsat?.length) {
    return { status: 'ja_processado' };
  }

  // ── Decisão NPS × CSAT ────────────────────────────────────────────────────
  const cooldownDias   = config.nps_cooldown_dias ?? 30;
  const cooldownCutoff = new Date(Date.now() - cooldownDias * 24 * 60 * 60 * 1000).toISOString();
  const [priorNps, priorCsat, npsRecente] = await Promise.all([
    sbFetch(`nps_avaliacoes?tenant_id=eq.${enc(tenantId)}&contact_identifier=eq.${enc(contactIdentifier)}&select=id&limit=1`),
    sbFetch(`atendimento_avaliacoes?tenant_id=eq.${enc(tenantId)}&contact_identifier=eq.${enc(contactIdentifier)}&select=id&limit=1`),
    sbFetch(`nps_avaliacoes?tenant_id=eq.${enc(tenantId)}&contact_identifier=eq.${enc(contactIdentifier)}&created_at=gte.${enc(cooldownCutoff)}&select=id&limit=1`),
  ]);

  const primeiroAtendimento = !(priorNps?.length) && !(priorCsat?.length);
  const npsNoCooldown        = (npsRecente?.length ?? 0) > 0;
  const enviarCsat           = primeiroAtendimento || npsNoCooldown;

  if (enviarCsat) {
    const arr = await sbFetch('atendimento_avaliacoes?select=id,public_token', {
      method: 'POST',
      body: {
        tenant_id:          tenantId,
        external_ref:       finalizacaoRef,
        contact_identifier: contactIdentifier,
        nome_cliente:       contactName,
        origem:             'crm_externo',
        status:             'pendente',
      },
      prefer: 'return=representation',
    });
    const rec = arr?.[0];
    if (!rec?.public_token) return { status: 'filtrado', detalhe: 'csat_insert_sem_token' };
    const link = `${PUBLIC_BASE}/avaliacao/${rec.public_token}`;
    const tpl  = config.csat_mensagem_template ||
      'Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Como foi? Avalie aqui: {link_avaliacao}';
    const text = renderTemplate(tpl, {
      nome_cliente:   contactName || 'cliente',
      link_avaliacao: link,
      nome_empresa:   config.nome_empresa || 'nossa empresa',
    });
    return { status: 'criado', tipo: 'csat', recordId: rec.id, publicToken: rec.public_token, link, text, contactName };
  }

  // NPS — sem snapshot de atendente (conv.id do DataCrazy não é UUID das conversations CD).
  const arr = await sbFetch('nps_avaliacoes?select=id,public_token', {
    method: 'POST',
    body: {
      tenant_id:          tenantId,
      external_ref:       finalizacaoRef,
      contact_identifier: contactIdentifier,
      contact_nome:       contactName,
      status:             'pendente',
    },
    prefer: 'return=representation',
  });
  const rec = arr?.[0];
  if (!rec?.public_token) return { status: 'filtrado', detalhe: 'nps_insert_sem_token' };
  const link = `${PUBLIC_BASE}/nps/${rec.public_token}`;
  const tpl  = config.nps_mensagem_template ||
    'Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}';
  const text = renderTemplate(tpl, {
    nome_cliente: contactName || 'cliente',
    link_nps:     link,
    nome_empresa: config.nome_empresa || 'nossa empresa',
  });
  return { status: 'criado', tipo: 'nps', recordId: rec.id, publicToken: rec.public_token, link, text, contactName };
}

module.exports = { decidirECriarRegistro, DEDUP_FINALIZACAO_MIN };
