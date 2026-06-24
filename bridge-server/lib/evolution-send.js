'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Helper: envio de mensagem de texto via Evolution API
//
// Busca a instância Evolution do tenant no Supabase (evolution_instances)
// e chama /message/sendText. Retorna { ok, status, message_id } ou lança.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Envia uma mensagem de texto via Evolution API para o tenant.
 *
 * @param {object} opts
 * @param {string} opts.tenantId   UUID do tenant
 * @param {string} opts.number     Número destino (dígitos, ex.: 5511999999999)
 * @param {string} opts.text       Texto da mensagem
 * @param {Function} opts.sbFetch  Helper sbFetch do bridge (URL, method, body)
 * @returns {Promise<{ok: boolean, status: number, message_id?: string, detail?: unknown}>}
 */
async function sendEvolutionText({ tenantId, number, text, sbFetch }) {
  const instances = await sbFetch(
    `evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&select=evolution_url,api_key,instance_name,status&limit=1`
  );

  const inst = Array.isArray(instances) ? instances[0] : null;
  if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
    return { ok: false, status: 0, detail: 'sem_instancia_evolution' };
  }

  const phone = String(number).replace(/\D/g, '');
  if (!phone) {
    return { ok: false, status: 0, detail: 'numero_invalido' };
  }

  let resp;
  try {
    resp = await fetch(
      `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
        body:    JSON.stringify({ number: phone, text }),
      }
    );
  } catch (fetchErr) {
    return { ok: false, status: 0, detail: fetchErr.message };
  }

  let data = {};
  try { data = await resp.json(); } catch (_) {}

  const message_id = data?.key?.id ?? data?.messageId ?? undefined;
  return { ok: resp.ok, status: resp.status, message_id, detail: data };
}

/**
 * Substitui variáveis no template de mensagem.
 * Variáveis suportadas: {nome_cliente}, {link_avaliacao}, {link_nps}, {nome_empresa}
 *
 * @param {string} template
 * @param {Record<string, string>} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendEvolutionText, renderTemplate };
