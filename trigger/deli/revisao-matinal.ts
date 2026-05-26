import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:               z.boolean(),
  tenant_id:        z.string().uuid(),
  resumo:           z.string(),
  alertas:          z.array(z.string()),
  acoes_sugeridas:  z.array(z.string()),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ── Task orquestradora (schedule) — fan-out por tenant ───────────────────────

export const deliRevisaoMatinalSchedule = schedules.task({
  id:    "deli-revisao-matinal-schedule",
  cron:  "0 0 31 2 *", // PAUSED — spam emergency 2026-05-26
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async () => {
    const sb = getSupabase();

    logger.info("deli-revisao-matinal-schedule: buscando tenants ativos");

    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (error) {
      logger.error("deli-revisao-matinal-schedule: erro ao buscar tenants", {
        error: error.message,
      });
      throw error;
    }

    const tenantIds: string[] = (tenants ?? []).map((t: { id: string }) => t.id);

    logger.info("deli-revisao-matinal-schedule: disparando revisao por tenant", {
      total_tenants: tenantIds.length,
    });

    for (const tenant_id of tenantIds) {
      await deliRevisaoMatinal.trigger({ tenant_id });
    }

    return { ok: true, tenants_processados: tenantIds.length };
  },
});

// ── Task de negócio — revisão matinal por tenant ─────────────────────────────

export const deliRevisaoMatinal = task({
  id:    "deli-revisao-matinal",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("deli-revisao-matinal iniciado", { tenant_id: input.tenant_id });

    try {
      const agora    = new Date();
      const offsetMs = 3 * 60 * 60 * 1000;
      const hoje     = new Date(agora.getTime() - offsetMs);
      const dataHoje = hoje.toISOString().slice(0, 10);

      // 1. Snapshot mais recente de vera_metricas_snapshot
      let snapshotRecente: Record<string, unknown> | null = null;
      try {
        const { data } = await sb
          .from("vera_metricas_snapshot")
          .select("data, metricas")
          .eq("tenant_id", input.tenant_id)
          .order("data", { ascending: false })
          .limit(1)
          .maybeSingle();
        snapshotRecente = (data as Record<string, unknown> | null) ?? null;
      } catch {
        logger.warn("deli-revisao-matinal: vera_metricas_snapshot não disponível");
      }

      // 2. Cobranças vencidas — count + soma valor_atual
      let cobrancasCount  = 0;
      let cobrancasValor  = 0;
      try {
        const { data: cobrancas } = await sb
          .from("cora_cobrancas")
          .select("id, valor_atual")
          .eq("tenant_id", input.tenant_id)
          .in("status", ["pendente", "vencida"]);
        const lista = (cobrancas ?? []) as { id: string; valor_atual: string | number }[];
        cobrancasCount = lista.length;
        cobrancasValor = Number(
          lista.reduce((sum, c) => sum + Number(c.valor_atual ?? 0), 0).toFixed(2)
        );
      } catch {
        logger.warn("deli-revisao-matinal: cora_cobrancas não disponível");
      }

      // 3. Prospects novos
      let prospectsNovos = 0;
      try {
        const { count } = await sb
          .from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", input.tenant_id)
          .eq("status", "novo");
        prospectsNovos = count ?? 0;
      } catch {
        logger.warn("deli-revisao-matinal: prospects não disponível");
      }

      // 4. Conversas abertas
      let conversasAbertas = 0;
      try {
        const { count } = await sb
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", input.tenant_id)
          .in("status", ["open", "pendente"]);
        conversasAbertas = count ?? 0;
      } catch {
        logger.warn("deli-revisao-matinal: conversations não disponível");
      }

      // 5. Anomalias não resolvidas
      let anomalias: { tipo: string; descricao: string; severidade: string }[] = [];
      try {
        const { data } = await sb
          .from("vera_anomalias")
          .select("tipo, descricao, severidade")
          .eq("tenant_id", input.tenant_id)
          .eq("resolvida", false)
          .limit(5);
        anomalias = (data ?? []) as typeof anomalias;
      } catch {
        logger.warn("deli-revisao-matinal: vera_anomalias não disponível");
      }

      // 6. Montar bloco de contexto
      const anomaliasTexto =
        anomalias.length > 0
          ? anomalias
              .map((a) => `  - [${a.severidade}] ${a.tipo}: ${a.descricao}`)
              .join("\n")
          : "  Nenhuma anomalia registrada.";

      const snapshotTexto = snapshotRecente
        ? `Snapshot VERA (${snapshotRecente.data}): ${JSON.stringify(snapshotRecente.metricas)}`
        : "Snapshot VERA: não disponível.";

      const contexto = `Data de hoje: ${dataHoje}
Tenant ID: ${input.tenant_id}

${snapshotTexto}

Cobranças pendentes/vencidas: ${cobrancasCount} cobranças | Total: R$ ${cobrancasValor.toFixed(2)}

Prospects novos aguardando contato: ${prospectsNovos}

Conversas abertas/pendentes no chat: ${conversasAbertas}

Anomalias não resolvidas (VERA):
${anomaliasTexto}`;

      logger.info("deli-revisao-matinal: contexto montado, chamando Claude", {
        tenant_id: input.tenant_id,
      });

      // 7. Chamar Claude Haiku para gerar resumo executivo
      const client = new Anthropic();

      const response = await client.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:
          "Você é DELI, COO Digital da Consult Delivery. Gere um resumo executivo matinal conciso e acionável em português brasileiro. Use emojis de semáforo (🟢🟡🔴) para indicar urgência. Seja direto.",
        messages: [
          {
            role:    "user",
            content: `${contexto}\n\nGere o resumo matinal executivo com: 1) status geral, 2) alertas prioritários, 3) ações sugeridas para hoje.`,
          },
        ],
      });

      const resumo = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      logger.info("deli-revisao-matinal: resumo gerado, parseando alertas e ações", {
        tenant_id: input.tenant_id,
      });

      // 8. Parsear alertas e ações sugeridas
      const linhas = resumo.split("\n").map((l) => l.trim()).filter(Boolean);

      const alertas = linhas.filter((l) =>
        /⚠️|🔴/.test(l) && !l.startsWith("#")
      );

      const acoesSugeridas = linhas.filter((l) =>
        /✅|→|Ação/i.test(l)
      );

      // 9. Salvar em deli_messages
      try {
        await sb.from("deli_messages").insert({
          tenant_id: input.tenant_id,
          user_id:   null,
          role:      "assistant",
          content:   resumo,
          metadata: {
            tipo:             "revisao_matinal",
            data:             dataHoje,
            alertas,
            acoes_sugeridas:  acoesSugeridas,
          },
        });
      } catch {
        logger.warn("deli-revisao-matinal: falha ao salvar em deli_messages");
      }

      // 10. Salvar em deli_agenda
      try {
        await sb.from("deli_agenda").insert({
          tenant_id:       input.tenant_id,
          tipo:            "revisao_matinal",
          resumo,
          alertas,
          acoes_sugeridas: acoesSugeridas,
          agent_run_id:    null,
        });
      } catch {
        logger.warn("deli-revisao-matinal: deli_agenda não disponível, ignorando");
      }

      await notify({
        tenantId:        input.tenant_id,
        kind:            "deli_alert",
        agent:           "deli",
        title:           "DELI — Revisão matinal disponível",
        body:            alertas.length > 0
          ? `${alertas.length} alerta(s) para hoje`
          : "Dia tranquilo por enquanto 🟢",
        link:            "/deli",
        recipientUserId: null,
        metadata:        { run_id: ctx.run.id },
      });

      const output = OutputSchema.parse({
        ok:              true,
        tenant_id:       input.tenant_id,
        resumo,
        alertas,
        acoes_sugeridas: acoesSugeridas,
      });

      // 11. Audit log (sucesso)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "deli",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output,
        status:      "success",
      });

      logger.info("deli-revisao-matinal concluído", { tenant_id: input.tenant_id });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("deli-revisao-matinal falhou", {
        tenant_id: input.tenant_id,
        error:     errorMessage,
      });

      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "deli",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:      { error: errorMessage },
        status:      "failed",
      });

      throw error;
    }
  },
});
