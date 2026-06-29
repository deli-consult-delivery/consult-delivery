import { getSupabase } from "./supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LoopTargetSystem = "vendaerp" | "asaas" | "nenhum";
export type LoopState = "open" | "executing" | "done" | "aguardando_autorizacao_ceo";
export type LoopStatus = "attending" | "task_pending" | "replied";

export interface CreateLoopTaskParams {
  tenantId: string;
  conversationId: string;
  customerId: string;
  agentId: string;
  titulo: string;
  descricao: string;
  prioridade: "urgent" | "high" | "normal" | "low";
  sistemaAlvo: LoopTargetSystem;
  operacao?: string | null;
  parametros?: Record<string, unknown> | null;
}

export interface CreateLoopTaskResult {
  taskId: string;
  conversationUpdated: boolean;
  /** true se a tarefa exige autorização do CEO antes de executar (Fluxo C). */
  requerAutorizacao: boolean;
}

// ─── Helper: cria tarefa + atualiza conversa atomicamente ────────────────────

/**
 * Cria uma client_task vinculada ao loop AI-First e atualiza a conversa
 * com loop_status='task_pending' + active_task_id.
 *
 * Throws se a inserção da tarefa falhar (não silencia — o chamador decide).
 */
export async function createLoopTask(
  params: CreateLoopTaskParams
): Promise<CreateLoopTaskResult> {
  const sb = getSupabase();

  // Fluxo C (Blueprint v2 §5C): demanda que executa em sistema externo (vendaerp/asaas)
  // NÃO abre direto — nasce em 'aguardando_autorizacao_ceo' e só executa após o `ok` do
  // CEO (via POST /loop/autorizar → loop_state='open'). 'nenhum' (só responder com
  // contexto) abre normal. executar-tarefa já ignora tudo que não é loop_state='open'.
  const requerAutorizacao = params.sistemaAlvo !== "nenhum";
  const loopStateInicial: LoopState = requerAutorizacao ? "aguardando_autorizacao_ceo" : "open";

  const { data: task, error: taskErr } = await sb
    .from("client_tasks")
    .insert({
      tenant_id:        params.tenantId,
      customer_id:      params.customerId,
      title:            params.titulo,
      description:      params.descricao,
      priority:         params.prioridade,
      status:           "doing",
      agent_id:         params.agentId,
      position:         0,
      conversation_id:  params.conversationId,
      loop_state:       loopStateInicial satisfies LoopState,
      target_system:    params.sistemaAlvo satisfies LoopTargetSystem,
      execution_result: params.operacao
        ? { operacao: params.operacao, parametros: params.parametros ?? null }
        : null,
    })
    .select("id")
    .single();

  if (taskErr || !task) {
    throw new Error(
      `createLoopTask: falha ao criar client_task: ${taskErr?.message ?? "sem retorno"}`
    );
  }

  const { error: convErr } = await sb
    .from("conversations")
    .update({
      loop_status:        "task_pending" satisfies LoopStatus,
      active_task_id:     task.id,
      attending_agent_id: params.agentId,
    })
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

  if (convErr) {
    console.warn(
      `[loop-tasks] falha ao atualizar conversa ${params.conversationId}:`,
      convErr.message
    );
  }

  // Fluxo C: tarefa nasceu em aguardando_autorizacao_ceo → avisar o CEO (push),
  // senão ele teria que descobrir a pendência por conta. Soft-fail: nunca quebra
  // a criação da tarefa.
  if (requerAutorizacao) {
    await notificarCeoAutorizacao(sb, task.id, params);
  }

  return { taskId: task.id, conversationUpdated: !convErr, requerAutorizacao };
}

// ─── Notificação ao CEO (Fluxo C) ────────────────────────────────────────────
// Reusa o padrão de bridge-server/routes/deli-notify.js: sino interno
// (internal_notifications) + Telegram Bot API direto, ambos soft-fail.

async function notificarCeoAutorizacao(
  sb: ReturnType<typeof getSupabase>,
  taskId: string,
  params: CreateLoopTaskParams,
): Promise<void> {
  const texto =
    `🔐 <b>Autorização necessária</b>\n\n` +
    `📋 ${params.titulo}\n` +
    `💬 Pedido: ${params.descricao}\n` +
    `⚙️ Ação proposta: ${params.operacao ?? "—"} em <b>${params.sistemaAlvo}</b>\n\n` +
    `Responda autorizando para executar. 🔗 task: ${taskId}`;

  // Sino interno
  try {
    const { error } = await sb.from("internal_notifications").insert({
      tenant_id: params.tenantId,
      kind:      "ceo_authorization",
      agent:     params.agentId,
      title:     "CEO · Autorização necessária",
      body:      texto.replace(/<\/?b>/g, ""),
      metadata:  {
        task_id:       taskId,
        target_system: params.sistemaAlvo,
        operacao:      params.operacao ?? null,
        conversation_id: params.conversationId,
      },
    });
    if (error) console.warn("[loop-tasks] sino ceo_authorization falhou (soft):", error.message);
  } catch (err) {
    console.warn("[loop-tasks] sino ceo_authorization erro (soft):", (err as Error).message);
  }

  // Telegram Bot API direto (soft-fail)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.CEO_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn("[loop-tasks] CEO Telegram não configurado (TELEGRAM_BOT_TOKEN/CEO_TELEGRAM_CHAT_ID) — só sino");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[loop-tasks] Telegram CEO ${res.status} (soft):`, body.slice(0, 200));
    }
  } catch (err) {
    console.warn("[loop-tasks] Telegram CEO falhou (soft):", (err as Error).message);
  }
}
