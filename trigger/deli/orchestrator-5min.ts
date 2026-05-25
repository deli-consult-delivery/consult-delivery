import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

function getBridgeUrl(): string {
  const url = process.env.BRIDGE_URL;
  if (!url) throw new Error("BRIDGE_URL não configurada");
  return url;
}

function getBridgeToken(): string {
  const token = process.env.INTERNAL_BRIDGE_TOKEN;
  if (!token) throw new Error("INTERNAL_BRIDGE_TOKEN não configurada");
  return token;
}

type Semaforo = "Verde" | "Amarelo" | "Vermelho";

export const deliOrchestrator5min = schedules.task({
  id: "deli-orchestrator-5min",
  cron: "*/5 * * * *",
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 60_000 },

  run: async (_payload, { ctx }) => {
    const sb = getSupabase();
    const since5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // 1. agent_runs com status='failed' nas últimas 5 min
    let failedCount = 0;
    const motivos: string[] = [];

    try {
      const { data } = await sb
        .from("agent_runs")
        .select("agent_id, status, created_at")
        .eq("status", "failed")
        .gte("created_at", since5min);
      failedCount = (data ?? []).length;
      if (failedCount > 0) {
        const agentes = [...new Set((data ?? []).map((r: { agent_id: string }) => r.agent_id))];
        motivos.push(`${failedCount} falha(s) em: ${agentes.join(", ")}`);
      }
    } catch {
      logger.warn("deli-orchestrator-5min: agent_runs indisponível");
    }

    // 2. contratos com vigencia_fim ≤ 7 dias
    let contratosUrgentes = 0;
    try {
      const em7dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from("contratos")
        .select("id, vigencia_fim")
        .lte("vigencia_fim", em7dias)
        .gt("vigencia_fim", new Date().toISOString());
      contratosUrgentes = (data ?? []).length;
      if (contratosUrgentes > 0) {
        motivos.push(`${contratosUrgentes} contrato(s) expirando em ≤7 dias`);
      }
    } catch {
      logger.warn("deli-orchestrator-5min: tabela contratos não existe, ignorando");
    }

    // 3. Calcular semáforo
    let semaforo: Semaforo = "Verde";
    if (failedCount >= 3 || contratosUrgentes > 0) {
      semaforo = "Vermelho";
    } else if (failedCount >= 1 || failedCount > 0) {
      semaforo = "Amarelo";
    }

    logger.info("deli-orchestrator-5min: semáforo calculado", {
      semaforo,
      failedCount,
      contratosUrgentes,
      motivos,
    });

    // 4. Notificar via Bridge se não Verde
    if (semaforo !== "Verde") {
      try {
        await fetch(`${getBridgeUrl()}/agents/deli/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getBridgeToken()}`,
          },
          body: JSON.stringify({
            channel: "telegram_interno",
            semaforo,
            motivos,
            run_id: ctx.run.id,
          }),
        });
      } catch (err) {
        logger.warn("deli-orchestrator-5min: Bridge notify falhou", {
          error: (err as Error).message,
        });
      }
    }

    // 5. logAgentRun
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      input: { check_at: since5min },
      output: { semaforo, motivos, failedCount, contratosUrgentes },
      status: "success",
    });

    return { semaforo, motivos };
  },
});
