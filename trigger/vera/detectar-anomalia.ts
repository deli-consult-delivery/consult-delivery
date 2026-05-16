import { task, logger } from "@trigger.dev/sdk/v3";
import { schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const AnomaliaSchema = z.object({
  metrica:          z.string(),
  severidade:       z.enum(["info", "warning", "critical"]),
  valor_esperado:   z.number().nullable(),
  valor_observado:  z.number().nullable(),
  explicacao:       z.string(),
});

const OutputSchema = z.object({
  ok:                   z.boolean(),
  anomalias_detectadas: z.number(),
  anomalias:            z.array(AnomaliaSchema.pick({ metrica: true, severidade: true })),
});

// Schema do JSON de explicação gerado pelo Claude
const ExplicacaoClaudeSchema = z.object({
  explicacao: z.string(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// KPIs numéricos a monitorar e seus caminhos no JSONB metricas
const KPI_PATHS: { campo: string; label: string }[] = [
  { campo: "num_prospects_novos",   label: "Novos prospects SOFIA" },
  { campo: "num_conversas_novas",   label: "Conversas WhatsApp novas" },
  { campo: "num_runs",              label: "Execuções de agentes" },
  { campo: "custo_total_usd",       label: "Custo Claude (USD)" },
];

// =====================================================
// TASK ORQUESTRADORA (schedule) — a cada 4 horas
// =====================================================

export const veraDetectarAnomaliaSchedule = schedules.task({
  id:    "vera-detectar-anomalia-schedule",
  cron:  "0 */4 * * *", // a cada 4 horas
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async () => {
    const sb = getSupabase();

    logger.info("vera-detectar-anomalia-schedule: buscando tenants ativos");

    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (error) {
      logger.error("vera-detectar-anomalia-schedule: erro ao buscar tenants", { error: error.message });
      throw error;
    }

    const tenantIds: string[] = (tenants ?? []).map((t: { id: string }) => t.id);

    for (const tenant_id of tenantIds) {
      await veraDetectarAnomalia.trigger({ tenant_id });
    }

    return { ok: true, tenants_processados: tenantIds.length };
  },
});

// =====================================================
// TASK DE NEGÓCIO — detecção por tenant
// =====================================================

export const veraDetectarAnomalia = task({
  id:    "vera-detectar-anomalia",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("vera-detectar-anomalia iniciado", { tenant_id: input.tenant_id });

    try {
      // 1. Busca últimos 30 dias de snapshots para calcular média e desvio padrão
      const { data: snapshots30, error: snap30Error } = await sb
        .from("vera_metricas_snapshot")
        .select("data, metricas")
        .eq("tenant_id", input.tenant_id)
        .order("data", { ascending: false })
        .limit(30);

      if (snap30Error) {
        throw new Error(`Erro ao buscar snapshots históricos: ${snap30Error.message}`);
      }

      const historico = snapshots30 ?? [];

      logger.info("vera-detectar-anomalia: histórico carregado", { dias: historico.length });

      if (historico.length < 3) {
        // Dados insuficientes para análise estatística significativa
        logger.info("vera-detectar-anomalia: histórico insuficiente para análise", {
          tenant_id: input.tenant_id,
          dias_disponiveis: historico.length,
        });

        const output = OutputSchema.parse({
          ok:                   true,
          anomalias_detectadas: 0,
          anomalias:            [],
        });

        await logAgentRun({
          runId:       ctx.run.id,
          agentSlug:   "vera",
          tenantId:    input.tenant_id,
          triggeredBy: input.triggered_by,
          input,
          output,
          status:      "success",
        });

        return output;
      }

      // 2. Pega snapshot mais recente (hoje ou ontem)
      const snapshotRecente = historico[0];
      const metricasRecentes = snapshotRecente.metricas as Record<string, unknown>;

      // Histórico excluindo o dia mais recente (para calcular baseline)
      const historicoBaseline = historico.slice(1);

      logger.info("vera-detectar-anomalia: calculando estatísticas de baseline", {
        dias_baseline: historicoBaseline.length,
        data_recente:  snapshotRecente.data,
      });

      // 3. Para cada KPI: calcula média e desvio padrão do baseline
      const anomaliasDetectadas: z.infer<typeof AnomaliaSchema>[] = [];

      // Instanciação dentro do run() — anti-padrão #4 evitado
      const anthropic = new Anthropic();

      for (const kpi of KPI_PATHS) {
        const valoresBaseline = historicoBaseline
          .map((s) => {
            const m = s.metricas as Record<string, unknown>;
            const v = m[kpi.campo];
            return typeof v === "number" ? v : null;
          })
          .filter((v): v is number => v !== null);

        if (valoresBaseline.length < 2) {
          // Sem dados suficientes para este KPI
          continue;
        }

        const media = valoresBaseline.reduce((a, b) => a + b, 0) / valoresBaseline.length;

        // Desvio padrão amostral
        const variancia = valoresBaseline.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / (valoresBaseline.length - 1);
        const desvio    = Math.sqrt(variancia);

        const valorAtual = metricasRecentes[kpi.campo];
        const valorNum   = typeof valorAtual === "number" ? valorAtual : null;

        if (valorNum === null) continue;

        // 4. Calcula desvio em sigmas
        let sigmas = 0;
        if (desvio > 0) {
          sigmas = Math.abs(valorNum - media) / desvio;
        } else if (valorNum !== media) {
          // Desvio = 0 mas valor mudou — trata como anomalia crítica
          sigmas = 3;
        }

        // Determina severidade
        let severidade: "info" | "warning" | "critical" | null = null;
        if (sigmas >= 2.0) {
          severidade = "critical";
        } else if (sigmas >= 1.5) {
          severidade = "warning";
        }

        if (!severidade) continue; // Dentro do normal

        logger.info("vera-detectar-anomalia: anomalia detectada", {
          campo:          kpi.campo,
          valor_atual:    valorNum,
          media_baseline: Number(media.toFixed(4)),
          desvio:         Number(desvio.toFixed(4)),
          sigmas:         Number(sigmas.toFixed(2)),
          severidade,
        });

        // 5. Verifica se já existe anomalia não-resolvida para esta métrica (evitar spam)
        const { data: anomaliaExistente } = await sb
          .from("vera_anomalias")
          .select("id")
          .eq("tenant_id", input.tenant_id)
          .eq("metrica", kpi.campo)
          .eq("resolvida", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anomaliaExistente) {
          logger.info("vera-detectar-anomalia: anomalia já registrada e aberta, pulando", {
            campo:       kpi.campo,
            anomalia_id: anomaliaExistente.id,
          });
          continue;
        }

        // 6. Claude gera explicação de 1-2 frases
        let explicacao = `${kpi.label} está em ${valorNum.toFixed(2)} (esperado: ~${media.toFixed(2)}), desvio de ${sigmas.toFixed(1)} sigma.`;

        try {
          const resp = await anthropic.messages.create({
            model:      "claude-haiku-4-5-20251001",
            max_tokens: 200,
            system:     "Você é VERA, analista de BI. Gere explicações curtas e acionáveis sobre anomalias de métricas. JSON apenas.",
            messages:   [{
              role:    "user",
              content: `Gere uma explicação de 1-2 frases para esta anomalia detectada na plataforma:

Métrica: ${kpi.label}
Valor atual: ${valorNum.toFixed(2)}
Valor esperado (média histórica): ${media.toFixed(2)}
Desvio padrão histórico: ${desvio.toFixed(2)}
Desvio em sigmas: ${sigmas.toFixed(1)}
Severidade: ${severidade}

Retorne APENAS JSON: {"explicacao": "sua explicação aqui"}`,
            }],
          });

          const rawExp = resp.content
            .filter((b) => b.type === "text")
            .map((b) => (b as Anthropic.TextBlock).text)
            .join("");

          const matchExp = rawExp.match(/\{[\s\S]*\}/);
          const parsedExp = ExplicacaoClaudeSchema.parse(JSON.parse(matchExp ? matchExp[0] : rawExp));
          explicacao = parsedExp.explicacao;
        } catch {
          // Mantém explicação fallback gerada acima
          logger.warn("vera-detectar-anomalia: Claude falhou ao gerar explicação, usando fallback", {
            campo: kpi.campo,
          });
        }

        // 7. INSERT em vera_anomalias
        await sb.from("vera_anomalias").insert({
          tenant_id:       input.tenant_id,
          metrica:         kpi.campo,
          valor_esperado:  Number(media.toFixed(4)),
          valor_observado: valorNum,
          severidade,
          explicacao,
          notificado:      false,
          resolvida:       false,
        });

        anomaliasDetectadas.push({
          metrica:         kpi.campo,
          severidade,
          valor_esperado:  Number(media.toFixed(4)),
          valor_observado: valorNum,
          explicacao,
        });
      }

      logger.info("vera-detectar-anomalia concluído", {
        tenant_id:            input.tenant_id,
        anomalias_detectadas: anomaliasDetectadas.length,
      });

      // Notificar equipe para anomalias alta/media
      const anomaliasUrgentes = anomaliasDetectadas.filter(
        (a) => a.severidade === "critical" || a.severidade === "warning"
      );
      if (anomaliasUrgentes.length > 0) {
        const top = anomaliasUrgentes[0];
        await notify({
          tenantId:        input.tenant_id,
          kind:            "deli_alert",
          agent:           "vera",
          title:           `⚠️ VERA detectou ${anomaliasUrgentes.length} anomalia(s)`,
          body:            `${top.metrica}: esperado ${top.valor_esperado?.toFixed?.(2) ?? "—"}, observado ${top.valor_observado?.toFixed?.(2) ?? "—"} (${top.severidade})`,
          link:            `/vera`,
          recipientUserId: null, // broadcast
          metadata:        { anomalias: anomaliasUrgentes.map((a) => a.metrica), run_id: ctx.run.id },
        });
      }

      const output = OutputSchema.parse({
        ok:                   true,
        anomalias_detectadas: anomaliasDetectadas.length,
        anomalias:            anomaliasDetectadas.map(({ metrica, severidade }) => ({ metrica, severidade })),
      });

      // OBRIGATÓRIO: audit log (sucesso)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output,
        status:      "success",
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("vera-detectar-anomalia falhou", {
        tenant_id: input.tenant_id,
        error:     errorMessage,
      });

      // OBRIGATÓRIO: audit log (falha)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
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
