import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notifyDeli } from "../_shared/notify-deli";

const TENANT_ID = "9079bd4d-4df7-4023-90fb-d79c8ba7e900";

// Trava anti-spam: máximo de pendências criadas por trigger em cada ciclo.
// Excedentes são truncados e logados (não somem em silêncio).
const MAX_ITEMS_POR_TRIGGER = 5;

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
        // Unidade de monitoramento = GRUPO de WhatsApp que o Wandson ligou na tela
        // (whatsapp_groups.monitorar_inatividade = true). NÃO a tabela `lojas`
        // (agenda inteira) contra `client_timeline` (sinal MORTO: 1 linha) —
        // essa combinação foi a causa dos falsos "sumiu" do incidente 2026-06-11.
        const { data: grupos } = await sb
          .from("whatsapp_groups")
          .select("id, group_name")
          .eq("tenant_id", TENANT_ID)
          .eq("ativo", true)
          .eq("monitorar_inatividade", true)
          .order("id", { ascending: true });

        if (!grupos?.length) return empty;

        const sumiram: Array<{ id: string; label: string }> = [];
        for (const grupo of grupos) {
          // Sinal VIVO: última mensagem real do grupo em whatsapp_messages.ts
          const { data: recentes } = await sb
            .from("whatsapp_messages")
            .select("id")
            .eq("group_id", grupo.id)
            .eq("tenant_id", TENANT_ID)
            .gte("ts", since7d)
            .limit(1);

          if (!recentes?.length) {
            const g = grupo as { id: string; group_name: string };
            sumiram.push({ id: g.id, label: g.group_name || g.id });
          }
        }

        if (!sumiram.length) return empty;
        return {
          fired: true,
          items: sumiram,
          summary: `${sumiram.length} grupo(s) sem mensagem há 7+ dias: ${sumiram.map((l) => l.label).join(", ")}`,
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
          .eq("status", "ativo")
          // Só consultorias ativas explicitamente marcadas (não toda a base de contatos).
          // Causa-raiz do incidente 2026-06-11: sem este filtro, iterava ~1172 contatos.
          .eq("is_consultoria_ativa", true)
          .order("id", { ascending: true });

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
  result: TriggerResult,
  dedupKey: string
): Promise<string | null> {
  try {
    // Dedup defensivo: já existe pendência "waiting" com esta chave hoje?
    // O índice único parcial (status='waiting' AND dedup_key IS NOT NULL) garante no banco;
    // este SELECT evita o round-trip de insert na maioria dos casos. A corrida residual
    // entre SELECT e INSERT é coberta pelo tratamento de 23505 abaixo.
    const { data: existing } = await sb
      .from("deli_pending_approvals")
      .select("id")
      .eq("dedup_key", dedupKey)
      .eq("status", "waiting")
      .limit(1);

    if (existing?.length) {
      logger.info("createPendingApproval: dedup hit — pendência já existe", {
        dedupKey,
        trigger: trigger.name,
      });
      return null;
    }

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
        dedup_key: dedupKey,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation do índice parcial → outra execução criou a pendência
      // entre o SELECT e o INSERT. É dedup hit legítimo, não erro.
      if ((error as { code?: string }).code === "23505") {
        logger.info("createPendingApproval: dedup hit (corrida) — índice único barrou", { dedupKey });
        return null;
      }
      logger.warn("createPendingApproval: insert falhou", { error: error.message });
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    logger.warn("createPendingApproval: exception", { error: (err as Error).message });
    return null;
  }
}

// ─── 4.1 + 4.2: Helpers de heartbeat — tasks proativas e memória ativa ────────

async function resolveLojaIdFromGroup(
  sb: ReturnType<typeof getSupabase>,
  groupId: string
): Promise<string | null> {
  try {
    const { data } = await sb
      .from("whatsapp_groups")
      .select("loja_id")
      .eq("id", groupId)
      .limit(1);
    return (data as Array<{ loja_id: string | null }> | null)?.[0]?.loja_id ?? null;
  } catch {
    return null;
  }
}

async function resolveCustomerIdFromLoja(
  sb: ReturnType<typeof getSupabase>,
  lojaId: string
): Promise<string | null> {
  try {
    const { data } = await sb
      .from("lojas")
      .select("client_id")
      .eq("id", lojaId)
      .limit(1);
    return (data as Array<{ client_id: string | null }> | null)?.[0]?.client_id ?? null;
  } catch {
    return null;
  }
}

async function createHeartbeatTask(
  sb: ReturnType<typeof getSupabase>,
  params: {
    customerId: string;
    agentId: string;
    title: string;
    phaseId: string;
    description: string;
  }
): Promise<void> {
  try {
    const { data: existing } = await sb
      .from("client_tasks")
      .select("id")
      .eq("tenant_id", TENANT_ID)
      .eq("customer_id", params.customerId)
      .eq("agent_id", params.agentId)
      .eq("status", "todo")
      .limit(1);

    if (existing && existing.length > 0) {
      logger.info("createHeartbeatTask: task já existe, pulando", {
        customerId: params.customerId,
        agentId: params.agentId,
      });
      return;
    }

    const { error } = await sb.from("client_tasks").insert({
      tenant_id: TENANT_ID,
      customer_id: params.customerId,
      agent_id: params.agentId,
      title: params.title,
      phase_id: params.phaseId,
      priority: "high",
      description: params.description,
      status: "todo",
    });
    if (error) {
      logger.warn("createHeartbeatTask: insert falhou", { error: error.message });
    } else {
      logger.info("createHeartbeatTask: task criada", {
        customerId: params.customerId,
        agentId: params.agentId,
      });
    }
  } catch (err) {
    logger.warn("createHeartbeatTask: exception", { error: (err as Error).message });
  }
}

async function upsertClientFact(
  sb: ReturnType<typeof getSupabase>,
  lojaId: string,
  category: string,
  value: string
): Promise<void> {
  try {
    const { data: existing } = await sb
      .from("client_facts")
      .select("id")
      .eq("loja_id", lojaId)
      .eq("tenant_id", TENANT_ID)
      .eq("category", category)
      .limit(1);

    if (existing?.length) {
      await sb
        .from("client_facts")
        .update({ fact: value, agent_name: "deli-orchestrator" })
        .eq("loja_id", lojaId)
        .eq("tenant_id", TENANT_ID)
        .eq("category", category);
    } else {
      await sb.from("client_facts").insert({
        loja_id: lojaId,
        tenant_id: TENANT_ID,
        category,
        fact: value,
        agent_name: "deli-orchestrator",
        confidence: 100,
      });
    }
  } catch (err) {
    logger.warn("upsertClientFact: exception", {
      error: (err as Error).message,
      lojaId,
      category,
    });
  }
}

async function processHeartbeatActions(
  sb: ReturnType<typeof getSupabase>,
  triggerName: string,
  items: Array<{ id: string; label: string; detail?: string }>,
  isoNow: string
): Promise<void> {
  const isClienteSumiu = triggerName.includes("cliente_sumiu");
  const isInadimplente =
    triggerName.includes("inadimplente") || triggerName.includes("metrica_caiu");

  if (!isClienteSumiu && !isInadimplente) return;

  for (const item of items.slice(0, MAX_ITEMS_POR_TRIGGER)) {
    if (isClienteSumiu) {
      // item.id = whatsapp_group.id → resolve loja_id → client_id
      const lojaId = await resolveLojaIdFromGroup(sb, item.id);
      if (!lojaId) {
        logger.info("processHeartbeatActions: grupo sem loja vinculada, skip", {
          groupId: item.id,
        });
        continue;
      }

      // 4.2: Persistir fato — último contato detectado
      await upsertClientFact(sb, lojaId, "ultimo_contato_detectado", isoNow);

      // 4.1: Criar task para BRENO
      const customerId = await resolveCustomerIdFromLoja(sb, lojaId);
      if (!customerId) {
        logger.info("processHeartbeatActions: loja sem customer, skip task BRENO", { lojaId });
        continue;
      }
      await createHeartbeatTask(sb, {
        customerId,
        agentId: "breno",
        title: `Retomar contato: ${item.label}`,
        phaseId: "acompanhamento",
        description: `Grupo inativo há 7+ dias. Detectado pelo orchestrator em ${isoNow}.`,
      });
    } else {
      // isInadimplente — item.id = loja.id
      const lojaId = item.id;

      // 4.2: Persistir fato — inadimplência detectada
      await upsertClientFact(sb, lojaId, "inadimplencia_detectada_em", isoNow);

      // 4.1: Criar task para CORA
      const customerId = await resolveCustomerIdFromLoja(sb, lojaId);
      if (!customerId) {
        logger.info("processHeartbeatActions: loja sem customer, skip task CORA", { lojaId });
        continue;
      }
      await createHeartbeatTask(sb, {
        customerId,
        agentId: "cora",
        title: `Cobrança pendente: ${item.label}${item.detail ? ` (${item.detail})` : ""}`,
        phaseId: "acompanhamento",
        description: `Métrica crítica detectada. Detectado pelo orchestrator em ${isoNow}.`,
      });
    }
  }
}

async function notifyBridge(semaforo: Semaforo, motivos: string[], runId: string): Promise<void> {
  try {
    const r = await fetch(`${getBridgeUrl()}/agents/deli/notify`, {
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
    if (!r.ok) {
      logger.warn("notifyBridge: status não-ok", { status: r.status });
    }
  } catch (err) {
    logger.warn("notifyBridge falhou", { error: (err as Error).message });
  }
}

export const deliOrchestrator5min = schedules.task({
  id: "deli-orchestrator-5min",
  // Religado a 30/30 min após a trava anti-spam (dedup_key + cap por trigger, #305).
  // Cinto de segurança final continua sendo a env DELI_ORCHESTRATOR_DISABLED: enquanto
  // ela estiver 'true' no Trigger.dev cloud, o run retorna cedo mesmo com o cron ativo.
  cron: "*/30 * * * *", // a cada 30 min — era "0 0 29 2 1" (PAUSED, spam emergency 2026-05-26)
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 60_000 },

  run: async (_payload, { ctx }) => {
    const ORCHESTRATOR_DISABLED = process.env.DELI_ORCHESTRATOR_DISABLED === 'true';
    if (ORCHESTRATOR_DISABLED) {
      logger.warn("deli-orchestrator: DISABLED via env var");
      return { semaforo: "Verde", motivos: ["disabled_via_env"], results: { verde: [], amarelo: [], vermelho: [] } };
    }

    const sb = getSupabase();
    const since5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    // Janela diária (YYYY-MM-DD em UTC) — componente da dedupKey: no máx. 1 pendência por evento/dia.
    const janelaDia = new Date().toISOString().slice(0, 10);
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
      } else if (trigger.autonomy_level === "amarelo" || trigger.autonomy_level === "vermelho") {
        // AMARELO/VERMELHO: cria 1 pendência por item, com dedup e cap.
        const nivel = trigger.autonomy_level === "vermelho" ? "VERMELHO" : "AMARELO";

        // Cap por trigger/ciclo: trunca itens excedentes e loga o que ficou de fora.
        const itensProcessar = result.items.slice(0, MAX_ITEMS_POR_TRIGGER);
        const truncados = result.items.length - itensProcessar.length;
        if (truncados > 0) {
          logger.info(
            `[deli-orchestrator] cap atingido em trigger="${trigger.name}" (${nivel}): ` +
              `${result.items.length} itens detectados, processando ${itensProcessar.length}, ` +
              `${truncados} truncado(s) neste ciclo`
          );
        }

        let criados = 0;
        for (const item of itensProcessar) {
          // dedupKey = tenant|trigger.name|itemId|janelaDia → 1 pendência waiting/dia.
          const dedupKey = `${TENANT_ID}|${trigger.name}|${item.id}|${janelaDia}`;
          const approvalId = await createPendingApproval(sb, trigger, result, dedupKey);
          if (approvalId) {
            criados++;
            logger.info(`deli-orchestrator: pending approval ${nivel} criado`, {
              approvalId,
              trigger: trigger.name,
              item: item.id,
            });
          }
        }
        logger.info(`deli-orchestrator: ${nivel} resumo`, {
          trigger: trigger.name,
          detectados: result.items.length,
          processados: itensProcessar.length,
          criados,
          dedup_skips: itensProcessar.length - criados,
        });

        if (trigger.autonomy_level === "vermelho") {
          resultsBySemaforo.vermelho.push(result.summary);
          // 4.1 + 4.2: Heartbeats — tasks proativas e memória ativa (só VERMELHO)
          await processHeartbeatActions(
            sb,
            trigger.name,
            result.items,
            new Date().toISOString()
          );
        } else {
          resultsBySemaforo.amarelo.push(result.summary);
        }
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

    // 4. Notificar Bridge se não-Verde (dedup de 30 min feito pelo endpoint)
    if (semaforo !== "Verde") {
      await notifyBridge(semaforo, motivos, ctx.run.id);
    }

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
