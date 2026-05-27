import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { getAnthropic } from "../_shared/claude";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  heartbeat_id: z.string().uuid(),
  trigger_type: z.enum(["interval", "manual"]).default("interval"),
});

const OutputSchema = z.object({
  heartbeat_id:   z.string(),
  status:         z.enum(["success", "skipped", "failed"]),
  action_taken:   z.boolean(),
  output_preview: z.string().optional(),
  tokens_used:    z.number().optional(),
  duration_ms:    z.number(),
});

export const heartbeatExecute = task({
  id: "heartbeat-execute",
  retry: { maxAttempts: 1 },
  run: async (payload: z.infer<typeof InputSchema>, { ctx }) => {
    const { heartbeat_id, trigger_type } = InputSchema.parse(payload);
    const sb        = getSupabase();
    const startTime = Date.now();
    let runId: string | null = null;

    // ── 1. Carregar heartbeat ─────────────────────────────────────────────
    const { data: hb, error: hbErr } = await sb
      .from("heartbeats")
      .select("*")
      .eq("id", heartbeat_id)
      .single();

    if (hbErr || !hb) {
      console.error("[heartbeat-execute] heartbeat não encontrado:", heartbeat_id);
      return OutputSchema.parse({
        heartbeat_id,
        status:       "failed",
        action_taken: false,
        duration_ms:  0,
      });
    }

    // Se foi desabilitado entre o schedule e a execução, pular
    if (!hb.enabled && trigger_type === "interval") {
      return OutputSchema.parse({
        heartbeat_id,
        status:       "skipped",
        action_taken: false,
        duration_ms:  0,
      });
    }

    // ── 2. Criar registro de run ──────────────────────────────────────────
    const { data: run } = await sb
      .from("heartbeat_runs")
      .insert({
        heartbeat_id,
        tenant_id:      hb.tenant_id,
        status:         "running",
        trigger_type,
        prompt_used:    hb.prompt,
        execution_mode: hb.execution_mode,
      })
      .select("id")
      .single();

    runId = run?.id ?? null;

    // ── 3. Construir prompt com contexto ──────────────────────────────────
    const systemPrompt = `Você é o agente ${hb.agent_slug} da plataforma Consult Delivery.
Tenant ID: ${hb.tenant_id}
Data/hora atual: ${new Date().toISOString()}

${
  hb.decision_prompt
    ? `PROTOCOLO DE DECISÃO:\nAvalie se há necessidade real de ação. Se não houver, responda com a palavra SKIP na primeira linha.\n\nCondição:\n${hb.decision_prompt}\n`
    : ""
}
Responda de forma concisa e acionável. Se tomou alguma ação, descreva brevemente o que foi feito.`;

    // ── 4. Executar via Anthropic API ─────────────────────────────────────
    let output     = "";
    let tokensUsed = 0;
    let costUsd    = 0;
    let status: "success" | "skipped" | "failed" = "success";

    try {
      const anthropic = getAnthropic();
      const response  = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: hb.max_tokens || 2048,
        system:     systemPrompt,
        messages:   [{ role: "user", content: hb.prompt }],
      });

      output = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      tokensUsed =
        (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0);
      costUsd =
        (response.usage?.input_tokens ?? 0) * 0.00000025 +
        (response.usage?.output_tokens ?? 0) * 0.00000125;

      // Verificar se foi skipped via decision_prompt
      if (
        hb.decision_prompt &&
        output.trimStart().toUpperCase().startsWith("SKIP")
      ) {
        status = "skipped";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      output = msg;
      status = "failed";
      console.error("[heartbeat-execute] erro na execução:", msg);
    }

    const duration   = Date.now() - startTime;
    const actionTaken = status === "success" && output.length > 0;

    // ── 5. Atualizar run ──────────────────────────────────────────────────
    if (runId) {
      await sb
        .from("heartbeat_runs")
        .update({
          status,
          output,
          action_taken:   actionTaken,
          action_summary: output.slice(0, 500),
          tokens_used:    tokensUsed || null,
          cost_usd:       costUsd || null,
          duration_ms:    duration,
          finished_at:    new Date().toISOString(),
          ...(status === "failed" ? { error_message: output } : {}),
        })
        .eq("id", runId);
    }

    // ── 6. Atualizar heartbeat (last_run, next_run, run_count) ────────────
    await sb
      .from("heartbeats")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(
          Date.now() + (hb.interval_seconds || 3600) * 1000
        ).toISOString(),
        run_count:  (hb.run_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", heartbeat_id);

    // ── 7. Audit log ──────────────────────────────────────────────────────
    await logAgentRun({
      runId:      ctx.run.id,
      agentSlug:  `heartbeat-${hb.agent_slug}`,
      tenantId:   hb.tenant_id,
      input:      { heartbeat_id, trigger_type },
      output:     { status, action_taken: actionTaken, tokens: tokensUsed },
      durationMs: duration,
      costUsd:    costUsd || undefined,
      status:     status === "failed" ? "failed" : "success",
    });

    return OutputSchema.parse({
      heartbeat_id,
      status,
      action_taken:   actionTaken,
      output_preview: output.slice(0, 200),
      tokens_used:    tokensUsed || undefined,
      duration_ms:    duration,
    });
  },
});
