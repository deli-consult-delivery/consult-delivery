import { schedules } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { heartbeatExecute } from "./execute";

/**
 * heartbeat-runner — scheduler mestre que roda a cada minuto.
 * Verifica heartbeats habilitados com next_run_at vencido e dispara heartbeat-execute para cada um.
 */
export const heartbeatRunner = schedules.task({
  id: "heartbeat-runner",
  cron: "* * * * *", // a cada minuto
  maxDuration: 30,   // 30s max para o scheduler em si
  run: async () => {
    const sb  = getSupabase();
    const now = new Date().toISOString();

    // Busca heartbeats habilitados que estão vencidos (next_run_at null ou <= now)
    const { data: due, error } = await sb
      .from("heartbeats")
      .select("id, name, agent_slug, tenant_id, interval_seconds")
      .eq("enabled", true)
      .or(`next_run_at.is.null,next_run_at.lte.${now}`);

    if (error) {
      console.error(
        "[heartbeat-runner] erro ao buscar heartbeats:",
        error.message
      );
      return { error: error.message, ran: 0 };
    }

    // Guard: filtrar heartbeats com interval_seconds <= 0 para evitar loop infinito
    const validHeartbeats = (due ?? []).filter((hb) => hb.interval_seconds > 0);

    if (!validHeartbeats.length) {
      return { ran: 0, message: "nenhum heartbeat vencido" };
    }

    console.log(
      `[heartbeat-runner] ${validHeartbeats.length} heartbeat(s) vencido(s), disparando...`
    );

    // Dispara execute task para cada heartbeat (em paralelo, fire-and-forget)
    const triggers = await Promise.allSettled(
      validHeartbeats.map((hb) =>
        heartbeatExecute.trigger(
          { heartbeat_id: hb.id, trigger_type: "interval" },
          {
            idempotencyKey: `hb-${hb.id}-${Math.floor(Date.now() / 60000)}`,
          }
        )
      )
    );

    const ok     = triggers.filter((t) => t.status === "fulfilled").length;
    const failed = triggers.filter((t) => t.status === "rejected").length;

    return { ran: ok, failed, total: due.length };
  },
});
