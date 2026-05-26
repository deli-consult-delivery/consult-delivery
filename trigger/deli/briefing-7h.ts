import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { executeAgent } from "../../src/agents/shared/runtime";

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

function getWandsonJid(): string {
  return process.env.DELI_BRIEFING_JID ?? process.env.WANDSON_JID ?? "";
}

export const briefingTask = schedules.task({
  id: "deli-briefing-7h",
  cron: "0 0 29 2 1", // PAUSED — spam emergency 2026-05-26 (Feb 29 on Monday = never)
  retry: { maxAttempts: 3, minTimeoutInMs: 60_000, maxTimeoutInMs: 180_000, factor: 2 },

  run: async (payload, { ctx }) => {
    logger.info("deli-briefing-7h: iniciando briefing matinal");

    const sb = getSupabase();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. agent_runs das últimas 24h
    let agentRuns: { agent_id: string; status: string; created_at: string }[] = [];
    try {
      const { data } = await sb
        .from("agent_runs")
        .select("agent_id, status, created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(50);
      agentRuns = (data ?? []) as typeof agentRuns;
    } catch {
      logger.warn("deli-briefing-7h: agent_runs indisponível");
    }

    // 2. contratos vencendo em ≤30 dias (tabela pode não existir)
    let contratosUrgentes: { id: string; vigencia_fim: string }[] = [];
    try {
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from("contratos")
        .select("id, vigencia_fim")
        .lte("vigencia_fim", em30dias)
        .gt("vigencia_fim", new Date().toISOString());
      contratosUrgentes = (data ?? []) as typeof contratosUrgentes;
    } catch {
      logger.warn("deli-briefing-7h: tabela contratos não existe, ignorando");
    }

    const failedRuns = agentRuns.filter((r) => r.status === "failed");
    const totalRuns = agentRuns.length;

    const briefingPayload = {
      tipo: "briefing_matinal",
      data: new Date().toISOString().slice(0, 10),
      resumo_agent_runs: {
        total_24h: totalRuns,
        falhas: failedRuns.length,
        agentes_com_falha: [...new Set(failedRuns.map((r) => r.agent_id))],
      },
      contratos_urgentes: contratosUrgentes.length,
    };

    // 3. executeAgent via runtime
    const result = await executeAgent("deli", briefingPayload, {
      runId: ctx.run.id,
    });

    // 4. Enviar via Bridge → WhatsApp do Wandson
    const jid = getWandsonJid();
    if (jid) {
      try {
        await fetch(`${getBridgeUrl()}/agents/deli/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getBridgeToken()}`,
          },
          body: JSON.stringify({ jid, message: String(result.output) }),
        });
      } catch (err) {
        logger.warn("deli-briefing-7h: Bridge send-whatsapp falhou", {
          error: (err as Error).message,
        });
      }
    } else {
      logger.warn("deli-briefing-7h: DELI_BRIEFING_JID/WANDSON_JID não configurado, pulando envio");
    }

    // 5. logAgentRun
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      input: briefingPayload,
      output: result,
      status: "success",
    });

    logger.info("deli-briefing-7h: concluído", { tokens: result.tokens });
    return { ok: true, tokens: result.tokens };
  },
});
