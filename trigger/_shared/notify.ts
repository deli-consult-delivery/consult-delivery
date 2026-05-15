import { getSupabase } from "./supabase";

type NotifKind =
  | "agent_invoked"
  | "agent_completed"
  | "agent_failed"
  | "draft_pending"
  | "draft_approved"
  | "draft_rejected"
  | "deli_proposal"
  | "deli_alert"
  | "system";

interface NotifyParams {
  tenantId: string;
  kind: NotifKind;
  agent?: string;
  title: string;
  body?: string;
  link?: string;
  recipientUserId?: string | null; // null = broadcast para todos do tenant
  metadata?: Record<string, unknown>;
}

/**
 * Insere uma notificação em internal_notifications.
 * Aparece no sino (bell) do Topbar em tempo real via Supabase Realtime.
 * Soft-fail: nunca quebra a task pai.
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    await getSupabase().from("internal_notifications").insert({
      tenant_id:         params.tenantId,
      recipient_user_id: params.recipientUserId ?? null,
      kind:              params.kind,
      agent:             params.agent ?? null,
      title:             params.title,
      body:              params.body ?? null,
      link:              params.link ?? null,
      metadata:          params.metadata ?? {},
    });
  } catch (err) {
    console.warn("[notify] falhou:", (err as Error).message);
  }
}
