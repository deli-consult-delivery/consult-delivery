import { task, logger } from "@trigger.dev/sdk/v3";
import { schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:               z.boolean(),
  report_id:        z.string().uuid(),
  resumo_executivo: z.string(),
});

// Schema do JSON gerado pelo Claude
const RelatorioSemanalClaudeSchema = z.object({
  titulo:           z.string(),
  resumo_executivo: z.string(),
  tendencias:       z.array(z.string()),
  destaques:        z.array(z.string()),
  alertas:          z.array(z.string()),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK ORQUESTRADORA (schedule) — segunda-feira 11h UTC
// =====================================================

export const veraRelatorioSemanalSchedule = schedules.task({
  id:    "vera-relatorio-semanal-schedule",
  cron:  "0 11 * * 1", // 11h UTC = 8h Brasília, toda segunda-feira
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async () => {
    const sb = getSupabase();

    logger.info("vera-relatorio-semanal-schedule: buscando tenants ativos");

    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (error) {
      logger.error("vera-relatorio-semanal-schedule: erro ao buscar tenants", { error: error.message });
      throw error;
    }

    const tenantIds: string[] = (tenants ?? []).map((t: { id: string }) => t.id);

    logger.info("vera-relatorio-semanal-schedule: disparando relatório semanal por tenant", {
      total_tenants: tenantIds.length,
    });

    for (const tenant_id of tenantIds) {
      await veraRelatorioSemanal.trigger({ tenant_id });
    }

    return { ok: true, tenants_processados: tenantIds.length };
  },
});

// =====================================================
// TASK DE NEGÓCIO — relatório semanal por tenant
// =====================================================

export const veraRelatorioSemanal = task({
  id:    "vera-relatorio-semanal",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("vera-relatorio-semanal iniciado", { tenant_id: input.tenant_id });

    try {
      // 1. Busca snapshots dos últimos 14 dias
      const { data: snapshots, error: snapError } = await sb
        .from("vera_metricas_snapshot")
        .select("data, metricas")
        .eq("tenant_id", input.tenant_id)
        .order("data", { ascending: false })
        .limit(14);

      if (snapError) {
        throw new Error(`Erro ao buscar snapshots: ${snapError.message}`);
      }

      const snapshotList = snapshots ?? [];

      logger.info("vera-relatorio-semanal: snapshots disponíveis", { count: snapshotList.length });

      if (snapshotList.length === 0) {
        throw new Error(
          "Nenhum snapshot disponível. Execute vera-snapshot-diario por pelo menos 1 dia."
        );
      }

      // 2. Divide em semana atual (7 mais recentes) vs semana anterior (os próximos 7)
      const semanaAtual    = snapshotList.slice(0, 7);
      const semanaAnterior = snapshotList.slice(7, 14);

      // 3. Calcula totais/médias de cada semana por campo numérico
      const somarCampo = (
        snaps: { data: string; metricas: unknown }[],
        campo: string
      ): number => {
        return snaps.reduce((sum, s) => {
          const m = s.metricas as Record<string, unknown>;
          const v = m[campo];
          return sum + (typeof v === "number" ? v : 0);
        }, 0);
      };

      const camposNumericos = [
        "num_prospects_novos",
        "num_conversas_novas",
        "num_runs",
      ];

      const variacoes: Record<string, { atual: number; anterior: number; variacao_pct: number | null }> = {};

      for (const campo of camposNumericos) {
        const atual    = somarCampo(semanaAtual, campo);
        const anterior = somarCampo(semanaAnterior, campo);
        const variacaoPct =
          anterior > 0 ? Number(((atual - anterior) / anterior * 100).toFixed(1)) : null;

        variacoes[campo] = { atual, anterior, variacao_pct: variacaoPct };
      }

      // Períodos para o relatório
      const dataInicioAtual    = semanaAtual[semanaAtual.length - 1]?.data ?? "";
      const dataFimAtual       = semanaAtual[0]?.data ?? "";
      const dataInicioAnterior = semanaAnterior[semanaAnterior.length - 1]?.data ?? "";
      const dataFimAnterior    = semanaAnterior[0]?.data ?? "";

      logger.info("vera-relatorio-semanal: variações calculadas, chamando Claude");

      // 4. Monta prompt e chama Claude
      // Instanciação dentro do run() — anti-padrão #4 evitado
      const anthropic = new Anthropic();

      const systemPrompt = "Você é VERA, analista de BI da Consult Delivery. Gera relatórios semanais executivos com foco em tendências e ações concretas. Responda SEMPRE com JSON válido.";

      const userPrompt = `Você é VERA, analista de BI da Consult Delivery. Gere um relatório semanal comparativo:

SEMANA ATUAL (${dataInicioAtual} a ${dataFimAtual}):
${JSON.stringify(variacoes, null, 2)}

SEMANA ANTERIOR (${dataInicioAnterior} a ${dataFimAnterior}):
Dados incluídos nas variações acima.

Métricas monitoradas:
- num_prospects_novos: prospects captados pela SOFIA
- num_conversas_novas: conversas WhatsApp iniciadas
- num_runs: execuções de agentes IA

Para cada métrica, destaque a tendência (alta/queda/estável) e o que isso significa para o negócio.

Retorne APENAS JSON:
{
  "titulo": "Relatório Semanal — ${dataInicioAtual} a ${dataFimAtual}",
  "resumo_executivo": "3-4 parágrafos com análise comparativa e recomendações",
  "tendencias": ["tendência 1", "tendência 2"],
  "destaques": ["destaque positivo 1"],
  "alertas": ["alerta se houver"]
}`;

      const response = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      });

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      // 5. Parse JSON com fallback
      let relatorio: z.infer<typeof RelatorioSemanalClaudeSchema>;
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        relatorio = RelatorioSemanalClaudeSchema.parse(JSON.parse(match ? match[0] : rawText));
      } catch {
        logger.warn("vera-relatorio-semanal: parse Claude falhou, usando fallback", {
          rawText: rawText.slice(0, 200),
        });
        relatorio = {
          titulo:           `Relatório Semanal — ${dataInicioAtual} a ${dataFimAtual}`,
          resumo_executivo: `Relatório semanal do período ${dataInicioAtual} a ${dataFimAtual}. Processamento automático concluído. Revise os dados de variação manualmente.`,
          tendencias:       ["Dados insuficientes para análise automática de tendências"],
          destaques:        ["Snapshots coletados com sucesso"],
          alertas:          ["Relatório gerado com análise parcial — revise manualmente"],
        };
      }

      logger.info("vera-relatorio-semanal: relatório gerado, salvando no banco");

      // 6. Monta conteúdo markdown
      const conteudoMarkdown = [
        `# ${relatorio.titulo}`,
        "",
        `## Resumo Executivo`,
        relatorio.resumo_executivo,
        "",
        `## Tendências`,
        ...relatorio.tendencias.map((t) => `- ${t}`),
        "",
        `## Destaques`,
        ...relatorio.destaques.map((d) => `- ${d}`),
        "",
        `## Alertas`,
        relatorio.alertas.length > 0
          ? relatorio.alertas.map((a) => `- ${a}`).join("\n")
          : "- Nenhum alerta no período.",
      ].join("\n");

      // Lê destinatários da env
      const destinatariosEnv = process.env.VERA_RECIPIENTS ?? "";
      const destinatarios = destinatariosEnv
        ? destinatariosEnv.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

      // 7. INSERT em vera_reports
      const periodoInicio = `${dataInicioAtual}T00:00:00Z`;
      const periodoFim    = `${dataFimAtual}T23:59:59Z`;

      const { data: reportData, error: insertError } = await sb
        .from("vera_reports")
        .insert({
          tenant_id:         input.tenant_id,
          tipo:              "semanal",
          periodo_inicio:    periodoInicio,
          periodo_fim:       periodoFim,
          titulo:            relatorio.titulo,
          resumo_executivo:  relatorio.resumo_executivo,
          conteudo_markdown: conteudoMarkdown,
          metricas:          variacoes,
          destinatarios,
          agent_run_id:      null,
        })
        .select("id")
        .single();

      if (insertError || !reportData) {
        throw new Error(`Erro ao salvar relatório semanal: ${insertError?.message ?? "sem dados retornados"}`);
      }

      // Email graceful
      if (!process.env.RESEND_API_KEY) {
        logger.info("Email VERA: serviço não configurado, salvo apenas no banco");
      }

      logger.info("vera-relatorio-semanal concluído", {
        tenant_id: input.tenant_id,
        report_id: reportData.id,
      });

      const output = OutputSchema.parse({
        ok:               true,
        report_id:        reportData.id,
        resumo_executivo: relatorio.resumo_executivo,
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

      logger.error("vera-relatorio-semanal falhou", {
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
