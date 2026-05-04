'use strict';
// bridge-server/realtime.js
// DELI — subscriptions Supabase Realtime + avaliador de triggers
//
// Escuta: whatsapp_messages (INSERT), loja_metricas (INSERT),
//         client_timeline (INSERT), agent_drafts (UPDATE status)
// Em cada evento: avalia deli_triggers → executa Verde ou cria pendência

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function supabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } },
      }
    );
  }
  return _supabase;
}

// Cache de triggers — recarrega a cada 5 min
let triggersCache = [];
let lastTriggersLoad = 0;

async function loadTriggers() {
  try {
    const { data, error } = await supabase()
      .from('deli_triggers')
      .select('*')
      .eq('enabled', true);

    if (error) throw error;
    triggersCache = data || [];
    lastTriggersLoad = Date.now();
    console.log(`[realtime] ${triggersCache.length} trigger(s) carregado(s)`);
  } catch (err) {
    console.warn('[realtime] falha ao carregar triggers:', err.message);
  }
}

async function getTriggers() {
  if (Date.now() - lastTriggersLoad > 5 * 60 * 1000) await loadTriggers();
  return triggersCache;
}

// ── Avaliador de condições ────────────────────────────────────────────────────
// condition_jsonb: { source_table, event_type, checks: [{field, op, value}] }

function conditionMatches(condition, payload) {
  const checks = condition.checks || [];
  return checks.every(check => {
    const fieldValue = payload[check.field];
    switch (check.op) {
      case 'eq':       return fieldValue === check.value;
      case 'neq':      return fieldValue !== check.value;
      case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(check.value);
      case 'truthy':   return !!fieldValue;
      case 'in':       return Array.isArray(check.value) && check.value.includes(fieldValue);
      default:         return false;
    }
  });
}

// ── Verde: executa imediatamente ─────────────────────────────────────────────

async function executeVerde(trigger, payload) {
  const action   = trigger.proposed_action_jsonb;
  const tenantId = payload.tenant_id;
  let result     = 'success';

  try {
    switch (action.type) {
      case 'timeline_update': {
        const lojaId = await resolveLojaId(payload);
        if (lojaId) {
          await supabase().from('client_timeline').insert({
            tenant_id:   tenantId,
            loja_id:     lojaId,
            event_type:  action.event_type || 'deli_auto',
            agent_name:  'deli',
            title:       action.title       || trigger.name,
            description: action.description || JSON.stringify(payload).slice(0, 200),
            payload,
          });
        } else {
          result = 'loja_id_not_resolved';
        }
        break;
      }
      case 'log_only':
        break;
      default:
        result = `unknown_action: ${action.type}`;
    }
  } catch (err) {
    result = `error: ${err.message}`;
    console.error('[realtime] executeVerde erro:', err.message);
  }

  try {
    await supabase().from('deli_actions_log').insert({
      tenant_id:          tenantId,
      trigger_id:         trigger.id,
      context_jsonb:      payload,
      action_taken_jsonb: action,
      autonomy_level:     'verde',
      result,
    });
  } catch (logErr) {
    console.warn('[realtime] deli_actions_log insert falhou:', logErr.message);
  }

  console.log(`[realtime] Verde: trigger="${trigger.name}" result=${result}`);
}

// ── Amarelo/Vermelho: cria aprovação pendente ─────────────────────────────────

async function createPendingApproval(trigger, payload) {
  try {
    const { data, error } = await supabase()
      .from('deli_pending_approvals')
      .insert({
        tenant_id:             payload.tenant_id,
        trigger_id:            trigger.id,
        context_jsonb:         payload,
        proposed_action_jsonb: trigger.proposed_action_jsonb,
        reasoning:             trigger.proposed_action_jsonb.reasoning || trigger.name,
        autonomy_level:        trigger.autonomy_level,
        status:                'waiting',
      })
      .select('id')
      .single();

    if (error) throw error;
    console.log(`[realtime] ${trigger.autonomy_level} pendente: id=${data.id} trigger="${trigger.name}"`);
    return data.id;
  } catch (err) {
    console.error('[realtime] createPendingApproval erro:', err.message);
    return null;
  }
}

// ── Resolve loja_id a partir do payload ──────────────────────────────────────

async function resolveLojaId(payload) {
  if (payload.loja_id) return payload.loja_id;

  if (payload.group_id) {
    const { data } = await supabase()
      .from('whatsapp_groups')
      .select('loja_id')
      .eq('id', payload.group_id)
      .maybeSingle();
    return data?.loja_id || null;
  }

  return null;
}

// ── Handler principal por tabela/evento ──────────────────────────────────────

async function handleEvent(sourceTable, eventType, payload) {
  if (!payload) return;

  const triggers = await getTriggers();
  const matching = triggers.filter(t => {
    const cond = t.condition_jsonb || {};
    if (cond.source_table && cond.source_table !== sourceTable) return false;
    if (cond.event_type   && cond.event_type   !== eventType)   return false;
    return conditionMatches(cond, payload);
  });

  for (const trigger of matching) {
    if (trigger.autonomy_level === 'verde') {
      await executeVerde(trigger, payload);
    } else {
      await createPendingApproval(trigger, payload);
    }
  }
}

// ── Executa ação após aprovação do Wandson (/deli/approve) ───────────────────

async function executeApprovedAction(approvalId, vermelhoCode) {
  const { data: approval, error } = await supabase()
    .from('deli_pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('status', 'waiting')
    .single();

  if (error || !approval) {
    console.warn('[realtime] approval não encontrado ou já processado:', approvalId);
    return false;
  }

  // Semáforo Vermelho: exige código explícito "APROVADO VERMELHO apr-{id}"
  if (approval.autonomy_level === 'vermelho') {
    const expected = `APROVADO VERMELHO apr-${approvalId}`;
    if (vermelhoCode !== expected) {
      console.warn('[realtime] código vermelho inválido para id:', approvalId);
      return false;
    }
  }

  const action   = approval.proposed_action_jsonb;
  const tenantId = approval.tenant_id;
  let result     = 'success';

  try {
    switch (action.type) {
      case 'invoke_agent': {
        const bridgeUrl = `http://localhost:${process.env.PORT || 3001}`;
        const res = await fetch(`${bridgeUrl}/analise`, {
          method:  'POST',
          headers: {
            'Content-Type':    'application/json',
            'x-bridge-secret': process.env.BRIDGE_SECRET || '',
          },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            job_id:       `deli-${approvalId}`,
            cliente_nome: action.cliente_nome || '',
            drive_link:   action.drive_link   || '',
            periodo:      action.periodo      || 'semanal',
            tenant_id:    tenantId,
          }),
        });
        if (!res.ok) result = `invoke_failed:${res.status}`;
        break;
      }

      case 'approve_draft': {
        await supabase()
          .from('agent_drafts')
          .update({ status: 'approved', reviewed_at: new Date().toISOString() })
          .eq('id', action.draft_id);
        break;
      }

      default:
        result = `unknown_action: ${action.type}`;
    }
  } catch (err) {
    result = `error: ${err.message}`;
  }

  const finalStatus = result === 'success' ? 'approved' : 'failed';
  await supabase()
    .from('deli_pending_approvals')
    .update({ status: finalStatus, approved_at: new Date().toISOString() })
    .eq('id', approvalId);

  try {
    await supabase().from('deli_actions_log').insert({
      tenant_id:          tenantId,
      trigger_id:         approval.trigger_id,
      context_jsonb:      approval.context_jsonb,
      action_taken_jsonb: action,
      autonomy_level:     approval.autonomy_level,
      result,
    });
  } catch (logErr) {
    console.warn('[realtime] deli_actions_log insert falhou:', logErr.message);
  }

  console.log(`[realtime] aprovação executada: id=${approvalId} status=${finalStatus} result=${result}`);
  return result === 'success';
}

async function rejectApproval(approvalId) {
  await supabase()
    .from('deli_pending_approvals')
    .update({ status: 'rejected' })
    .eq('id', approvalId)
    .eq('status', 'waiting');
  console.log(`[realtime] aprovação rejeitada: id=${approvalId}`);
}

// ── Inicia subscriptions Realtime ─────────────────────────────────────────────

function startRealtime() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[realtime] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente — realtime DELI desabilitado');
    return;
  }

  loadTriggers();

  supabase()
    .channel('deli-whatsapp-messages')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
      async ({ new: row }) => {
        console.log('[realtime] whatsapp_messages INSERT id=', row?.id);
        await handleEvent('whatsapp_messages', 'INSERT', row);
      })
    .subscribe(s => { if (s === 'SUBSCRIBED') console.log('[realtime] ✓ whatsapp_messages'); });

  supabase()
    .channel('deli-loja-metricas')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'loja_metricas' },
      async ({ new: row }) => {
        console.log('[realtime] loja_metricas INSERT loja_id=', row?.loja_id);
        await handleEvent('loja_metricas', 'INSERT', row);
      })
    .subscribe(s => { if (s === 'SUBSCRIBED') console.log('[realtime] ✓ loja_metricas'); });

  supabase()
    .channel('deli-client-timeline')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'client_timeline' },
      async ({ new: row }) => {
        console.log('[realtime] client_timeline INSERT loja_id=', row?.loja_id);
        await handleEvent('client_timeline', 'INSERT', row);
      })
    .subscribe(s => { if (s === 'SUBSCRIBED') console.log('[realtime] ✓ client_timeline'); });

  supabase()
    .channel('deli-agent-drafts')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'agent_drafts' },
      async ({ new: row }) => {
        if (row?.status === 'approved') {
          console.log('[realtime] agent_drafts aprovado id=', row?.id);
          await handleEvent('agent_drafts', 'UPDATE', row);
        }
      })
    .subscribe(s => { if (s === 'SUBSCRIBED') console.log('[realtime] ✓ agent_drafts'); });

  console.log('[realtime] módulo DELI iniciado — 4 canais ativos');
}

module.exports = { startRealtime, executeApprovedAction, rejectApproval, loadTriggers };