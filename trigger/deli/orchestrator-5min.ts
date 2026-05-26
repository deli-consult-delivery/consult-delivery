import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notifyDeli } from "../_shared/notify-deli";

const TENANT_ID = "9079bd4d-4df7-4023-90fb-d79c8ba7e900";

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
type AutonomyLevel = "verde" | "amarelo" | "vermelho";

interface DeliTrigger {
  id: string;
  name: string;
  descricao: string;
  event_type: string;
  autonomy_level: AutonomyLevel;
  condition_jsonb: Record<string, unknown>;
  proposed_action_jsonb: Record<string, unknown>;
}

interface TriggerResult {
  fired: boolean;
  items: Array<{ id: string; label: string; detail?: string }>;
  summary: string;
}

async function evaluateTrigger(
  sb: ReturnType<typeof getSupabase>,
  trigger: DeliTrigger,
  since5min: string
): Promise<TriggerResult> {
  const empty: TriggerResult = { fired: false, items: [], summary: "" };

  try {
    switch (trigger.name) {
      case "cliente_sumiu_7d": {
        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: lojas } = await sb
          .from("lojas")
          .select("id, nome")
          .eq("tenant_id", TENANT_ID)
          .eq("status", "ativo");

        if (!lojas?.length) return empty;

        const sumiram: Array<{ id: string; label: string }> = [];
        for (const loja of lojas) {
          const { data: recentes } = await sb
            .from("client_timeline")
            .select("id")
            .eq("loja_id", loja.id)
            .gte("ts", since7d)
            .limit(1);

          if (!recentes?.length) {
            sumiram.push({ id: loja.id, label: (loja as { id: string; nome: string }).nome || loja.id });
          }
        }

        if (!sumiram.length) return empty;
        return {
          fired: true,
          items: sumiram,
          summary: `${sumiram.length} loja(s) sem atividade há 7+ dias: ${sumiram.map((l) => l.label).join(", ")}`,
        };
      }

      case "mensagem_recebida": {
        // mensagens inbound via WhatsApp (tabela pode não existir em dev — soft-fail)
        try {
          const { data } = await sb
            .from("mensagens")
            .select("id, loja_id")
            .eq("tenant_id", TENANT_ID)
            .eq("direction", "inbound")
            .gte("created_at", since5min)
            .limit(20);

          if (!data?.length) return empty;
          return {
            fired: true,
            items: data.map((m: { id: string; loja_id: string }) => ({ id: m.id, label: m.loja_id })),
            summary: `${data.length} mensagem(ns) inbound nos últimos 5 min`,
          };
        } catch {
          return empty;
        }
      }

      case "metrica_caiu_20pct": {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const { data: lojas } = await sb
          .from("lojas")
          .select("id, nome")
          .eq("tenant_id", TENANT_ID)
          .eq("status", "ativo");

        if (!lojas?.length) return empty;

        const alertas: Array<{ id: string; label: string; detail?: string }> = [];
        for (const loja of lojas) {
          const { data: snapshots } = await sb
            .from("loja_metricas_snapshot")
            .select("nota_media, pedidos_30d, data, created_at")
            .eq("loja_id", loja.id)
            .gte("data", since30d)
            .order("created_at", { ascending: false })
            .limit(2);

          const lojaLabel = (loja as { id: string; nome: string }).nome || loja.id;

          if (!snapshots?.length) {
            alertas.push({ id: loja.id, label: lojaLabel, detail: "sem dados de métricas recentes" });
            continue;
          }

          if (snapshots.length >= 2) {
            const [novo, antigo] = snapshots as unknown as [
              { nota_media: number | null },
              { nota_media: number | null },
            ];
            const notaAtual = Number(novo.nota_media ?? 0);
            const notaAnterior = Number(antigo.nota_media ?? 0);
            if (notaAnterior > 0) {
              const variacao = ((notaAtual - notaAnterior) / notaAnterior) * 100;
              if (variacao <= -20) {
                alertas.push({
                  id: loja.id,
                  label: lojaLabel,
                  detail: `nota caiu ${variacao.toFixed(1)}% (${notaAnterior.toFixed(1)} → ${notaAtual.toFixed(1)})`,
                });
              }
            }
          }
        }

        if (!alertas.length) return empty;
        return {
          fired: true,
          items: alertas,
          summary: `${alertas.length} alerta(s) de métrica: ${alertas.map((a) => `${a.label} (${a.detail})`).join("; ")}`,
        };
      }

      case "config_critical_change": {
        const { data } = await sb
          .from("audit_log")
          .select("id, action, resource, created_at")
          .eq("tenant_id", TENANT_ID)
          .gte("created_at", since5min)
          .ilike("resource", "%config%")
          .in("action", ["UPDATE", "DELETE"])
          .limit(10);

        if (!data?.length) return empty;
        return {
          fired: true,
          items: data.map((r: { id: string; action: string; resource: string; created_at: string }) => ({
            id: r.id,
            label: `${r.action} em ${r.resource}`,
          })),
          summary: `${data.length} mudança(s) crítica(s) de configuração nos últimos 5 min`,
        };
      }

      default:
        return empty;
    }
  } catch (err) {
    logger.warn(`evaluateTrigger error for ${trigger.name}`, { error: (err as Error).message });
    return empty;
  }
}

async function createPendingApproval(
  sb: ReturnType<typeof getSupabase>,
  trigger: DeliTrigger,
  result: TriggerResult
): Promise<string | null> {
  try {
    const horasExpiry = trigger.autonomy_level === "vermelho" ? 2 : 24;
    const expiresAt = new Date(Date.now() + horasExpiry * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb
      .from("deli_pending_approvals")
      .insert({
        tenant_id: TENANT_ID,
        trigger_id: trigger.id,
        autonomy_level: trigger.autonomy_level,
        summary: result.summary,
        context_jsonb: { items: result.items, trigger_name: trigger.name },
        proposed_action_jsonb: trigger.proposed_action_jsonb,
        reasoning: trigger.descricao,
        status: "waiting",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      logger.warn("createPendingApproval: insert falhou", { error: error.message });
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    logger.warn("createPendingApproval: exception", { error: (err as Error).message });
    return null;
  }
}

async function notifyBridge(semaforo: Semaforo, motivos: string[], runId: string): Promise<void> {
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
        run_id: runId,
        urgente: semaforo === "Vermelho",
      }),
    });
  } catch (err) {
    logger.warn("notifyBridge falhou", { error: (err as Error).message });
  }
}

export const deliOrchestrator5min = schedules.task({
  id: "deli-orchestrator-5min",
  cron: "0 0 29 2 1", // PAUSED — spam emergency 2026-05-26 (Feb 29 on Monday = never)
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 60_000 },

  run: async (_payload, { ctx }) => {
    const ORCHESTRATOR_DISABLED = process.env.DELI_ORCHESTRATOR_DISABLED === 'true';
    if (ORCHESTRATOR_DISABLED) {
      logger.warn("deli-orchestrator: DISABLED via env var");
      return { semaforo: "Verde", motivos: ["disabled_via_env"], results: { verde: [], amarelo: [], vermelho: [] } };
    }

    const sb = getSupabase();
    const since5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const resultsBySemaforo: Record<AutonomyLevel, string[]> = { verde: [], amarelo: [], vermelho: [] };

    // 1. Carregar triggers ativos
    let triggers: DeliTrigger[] = [];
    try {
      const { data, error } = await sb
        .from("deli_triggers")
        .select("id, name, descricao, event_type, autonomy_level, condition_jsonb, proposed_action_jsonb")
        .eq("tenant_id", TENANT_ID)
        .eq("enabled", true);

      if (error) {
        logger.warn("deli-orchestrator: falha ao carregar triggers", { error: error.message });
      } else {
        triggers = (data ?? []) as DeliTrigger[];
        logger.info("deli-orchestrator: triggers carregados", { count: triggers.length });
      }
    } catch (err) {
      logger.warn("deli-orchestrator: exception carregando triggers", { error: (err as Error).message });
    }

    // 2. Avaliar cada trigger
    for (const trigger of triggers) {
      const result = await evaluateTrigger(sb, trigger, since5min);
      if (!result.fired) continue;

      logger.info(`deli-orchestrator: trigger FIRED ${trigger.name}`, {
        autonomy_level: trigger.autonomy_level,
        summary: result.summary,
      });

      if (trigger.autonomy_level === "verde") {
        // VERDE: executa direto — notifica internamente
        await notifyDeli({
          tenantId: TENANT_ID,
          content: `[VERDE] ${trigger.name}: ${result.summary}`,
          sourceAgent: "deli",
          sourceTask: "deli-orchestrator-5min",
          runId: ctx.run.id,
        });
        resultsBySemaforo.verde.push(result.summary);
      } else if (trigger.autonomy_level === "amarelo") {
        // AMARELO: cria pendência, notifica sem urgência
        const approvalId = await createPendingApproval(sb, trigger, result);
        if (approvalId) {
          logger.info("deli-orchestrator: pending approval AMARELO criado", { approvalId, trigger: trigger.name });
        }
        resultsBySemaforo.amarelo.push(result.summary);
      } else if (trigger.autonomy_level === "vermelho") {
        // VERMELHO: cria pendência urgente
        const approvalId = await createPendingApproval(sb, trigger, result);
        if (approvalId) {
          logger.info("deli-orchestrator: pending approval VERMELHO criado", { approvalId, trigger: trigger.name });
        }
        resultsBySemaforo.vermelho.push(result.summary);
      }
    }

    // 3. Calcular semáforo geral
    let semaforo: Semaforo = "Verde";
    const motivos: string[] = [];

    if (resultsBySemaforo.vermelho.length > 0) {
      semaforo = "Vermelho";
      motivos.push(...resultsBySemaforo.vermelho.map((s) => `🔴 ${s}`));
    }
    if (resultsBySemaforo.amarelo.length > 0) {
      if (semaforo === "Verde") semaforo = "Amarelo";
      motivos.push(...resultsBySemaforo.amarelo.map((s) => `🟡 ${s}`));
    }
    motivos.push(...resultsBySemaforo.verde.map((s) => `🟢 ${s}`));

    // 4. Notificar Bridge se não-Verde
    // NOTIFICAÇÃO TEMPORARIAMENTE DESLIGADA — bug spam (Wandson 2026-05-26)
    // if (semaforo !== "Verde") {
    //   await notifyBridge(semaforo, motivos, ctx.run.id);
    // }

    logger.info("deli-orchestrator-5min: concluído", { semaforo, motivos });

    // 5. logAgentRun
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      input: { check_at: since5min },
      output: { semaforo, motivos, results: resultsBySemaforo },
      status: "success",
    });

    return { semaforo, motivos, results: resultsBySemaforo };
  },
});
