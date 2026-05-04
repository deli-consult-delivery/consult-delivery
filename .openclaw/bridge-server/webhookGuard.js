'use strict';
// bridge-server/webhookGuard.js
// Job que roda a cada hora verificando se o webhook de cada instância Evolution
// aponta para a Supabase Edge Function com enabled=true.
// Se não estiver correto, corrige automaticamente e loga em audit_log.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL_SUFFIX = '/functions/v1/evolution-webhook';

let _sb = null;
function sb() {
  if (!_sb) {
    _sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _sb;
}

async function checkInstance(inst) {
  const evoUrl = inst.evolution_url;
  const evoKey = inst.api_key;
  const name   = inst.instance_name;

  if (!evoUrl || !evoKey) {
    console.warn(`[webhookGuard] ${name}: sem evolution_url ou api_key, pulando`);
    return;
  }

  const targetUrl = `${SUPABASE_URL}${TARGET_URL_SUFFIX}`;
  const headers   = { 'Content-Type': 'application/json', apikey: evoKey };

  let current;
  try {
    const res = await fetch(`${evoUrl}/webhook/find/${name}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[webhookGuard] ${name}: GET /webhook/find retornou ${res.status}`);
      return;
    }
    current = await res.json();
  } catch (err) {
    console.warn(`[webhookGuard] ${name}: erro ao verificar webhook:`, err.message);
    return;
  }

  const isOk = current.enabled === true && current.url === targetUrl;
  if (isOk) {
    console.log(`[webhookGuard] ${name}: OK`);
    return;
  }

  console.log(`[webhookGuard] ${name}: incorreto (enabled=${current.enabled} url=${current.url}) — corrigindo`);

  let corrected = false;
  try {
    const setRes = await fetch(`${evoUrl}/webhook/set/${name}`, {
      method:  'POST',
      headers,
      signal:  AbortSignal.timeout(10_000),
      body: JSON.stringify({
        webhook: {
          enabled:           true,
          url:               targetUrl,
          webhook_by_events: false,
          events:            ['MESSAGES_UPSERT'],
        },
      }),
    });
    corrected = setRes.ok;
    if (!corrected) {
      const body = await setRes.text().catch(() => '');
      console.error(`[webhookGuard] ${name}: POST /webhook/set falhou ${setRes.status}: ${body}`);
    }
  } catch (err) {
    console.error(`[webhookGuard] ${name}: erro ao corrigir webhook:`, err.message);
  }

  // Registrar em audit_log (usando tenant_id da instância)
  if (inst.tenant_id) {
    const { error: logErr } = await sb().from('audit_log').insert({
      tenant_id:  inst.tenant_id,
      agent_name: 'webhookGuard',
      action:     corrected ? 'webhook_autocorrected' : 'webhook_correction_failed',
      resource:   `evolution_instances/${name}`,
      metadata: {
        was_url:     current.url,
        was_enabled: current.enabled,
        target_url:  targetUrl,
        corrected,
      },
    });
    if (logErr) console.warn(`[webhookGuard] ${name}: erro ao gravar audit_log:`, logErr.message);
  }
}

async function runGuard() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[webhookGuard] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados — pulando');
    return;
  }

  const { data: instances, error } = await sb()
    .from('evolution_instances')
    .select('instance_name, evolution_url, api_key, tenant_id');

  if (error) {
    console.error('[webhookGuard] erro ao listar instâncias:', error.message);
    return;
  }

  if (!instances?.length) {
    console.log('[webhookGuard] nenhuma instância encontrada');
    return;
  }

  console.log(`[webhookGuard] verificando ${instances.length} instância(s)`);
  for (const inst of instances) {
    await checkInstance(inst);
  }
}

function startWebhookGuard() {
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hora

  // Primeira execução após 30s (espera o servidor estabilizar)
  setTimeout(() => {
    runGuard().catch(err => console.error('[webhookGuard] erro inesperado:', err.message));
    setInterval(() => {
      runGuard().catch(err => console.error('[webhookGuard] erro inesperado:', err.message));
    }, INTERVAL_MS);
  }, 30_000);

  console.log('[webhookGuard] agendado — primeira verificação em 30s, depois a cada hora');
}

module.exports = { startWebhookGuard, runGuard };
