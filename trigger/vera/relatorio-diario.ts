import { task, logger } from "@trigger.dev/sdk/v3";
import { schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

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
const RelatorioClaudeSchema = z.object({
  titulo:           z.string(),
  resumo_executivo: z.string(),
  destaques:        z.array(z.string()),
  alertas:          z.array(z.string()),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK ORQUESTRADORA (schedule) — itera por tenant
// =====================================================

export const veraRelatorioDiarioSchedule = schedules.task({
  id:    "vera-relatorio-diario-schedule",
  cron:  "0 10 * * *", // 10h UTC = 7h Brasília
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async () => {
    const sb = getSupabase();

    logger.info("vera-relatorio-diario-schedule: buscando tenants ativos");

    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (error) {
      logger.error("vera-relatorio-diario-schedule: erro ao buscar tenants", { error: error.message });
      throw error;
    }

    const tenantIds: string[] = (tenants ?? []).map((t: { id: string }) => t.id);

    logger.info("vera-relatorio-diario-schedule: disparando relatório por tenant", {
      total_tenants: tenantIds.length,
    });

    for (const tenant_id of tenantIds) {
      await veraRelatorioDiario.trigger({ tenant_id });
    }

    return { ok: true, tenants_processados: tenantIds.length };
  },
});

// =====================================================
// TASK DE NEGÓCIO — relatório por tenant
// =====================================================

export const veraRelatorioDiario = task({
  id:    "vera-relatorio-diario",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("vera-relatorio-diario iniciado", { tenant_id: input.tenant_id });

    try {
      // 1. Busca snapshots dos últimos 8 dias (hoje inclusive + 7 anteriores)
      const { data: snapshots, error: snapError } = await sb
        .from("vera_metricas_snapshot")
        .select("data, metricas")
        .eq("tenant_id", input.tenant_id)
        .order("data", { ascending: false })
        .limit(8);

      if (snapError) {
        throw new Error(`Erro ao buscar snapshots: ${snapError.message}`);
      }

      const snapshotList = snapshots ?? [];

      logger.info("vera-relatorio-diario: snapshots disponíveis", {
        count: snapshotList.length,
      });

      if (snapshotList.length === 0) {
        throw new Error(
          "Nenhum snapshot disponível para gerar relatório. Execute vera-snapshot-diario primeiro."
        );
      }

      // 2. Monta contexto: ontem e média dos 7 dias anteriores
      const snapshotOntem = snapshotList[0];
      const snapshotsAnteriores = snapshotList.slice(1);

      // Calcula média simples de campos numéricos conhecidos nos snapshots anteriores
      const calcularMedia = (campo: string): number | null => {
        const valores = snapshotsAnteriores
          .map((s) => {
            const m = s.metricas as Record<string, unknown>;
            const v = m[campo];
            return typeof v === "number" ? v : null;
          })
          .filter((v): v is number => v !== null);
        if (valores.length === 0) return null;
        return Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2));
      };

      const metricasOntem = snapshotOntem.metricas as Record<string, unknown>;
      const mediaProspects = calcularMedia("num_prospects_novos");
      const mediaConversas = calcularMedia("num_conversas_novas");
      const mediaRuns      = calcularMedia("num_runs");

      const contextoOntem = JSON.stringify(metricasOntem, null, 2);
      const media7Dias = JSON.stringify({
        num_prospects_novos: mediaProspects,
        num_conversas_novas: mediaConversas,
        num_runs:            mediaRuns,
        snapshots_disponiveis: snapshotsAnteriores.length,
      }, null, 2);

      logger.info("vera-relatorio-diario: contexto montado, chamando Claude");

      // 3. Instanciação dentro do run() — anti-padrão #4 evitado
      const anthropic = new Anthropic();

      const systemPrompt = "Você é VERA, analista de BI da Consult Delivery. Gera relatórios executivos concisos e acionáveis. Responda SEMPRE com JSON válido, sem markdown externo.";

      const userPrompt = `Você é VERA, analista de BI da Consult Delivery. Gere um relatório diário executivo baseado nestas métricas:

ONTEM (${snapshotOntem.data}):
${contextoOntem}

MÉDIA 7 DIAS ANTERIORES:
${media7Dias}

Métricas monitoradas:
- Novos prospects SOFIA
- Taxa de recuperação CORA (cobranças pagas/total)
- Conversas ativas no chat
- Runs de agentes (sucesso/falha)
- Custo Claude USD

Gere um relatório objetivo e acionável. Destaque anomalias e oportunidades.
Retorne APENAS JSON:
{
  "titulo": "Relatório Diário — ${snapshotOntem.data}",
  "resumo_executivo": "3-4 parágrafos com análise executiva",
  "destaques": ["ponto positivo 1", "ponto positivo 2"],
  "alertas": ["alerta 1 se houver"]
}`;

      const response = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      });

      const costUsd = calcularCustoUsd("claude-haiku-4-5-20251001", response.usage);

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      // 4. Parse JSON com fallback
      let relatorio: z.infer<typeof RelatorioClaudeSchema>;
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        relatorio = RelatorioClaudeSchema.parse(JSON.parse(match ? match[0] : rawText));
      } catch {
        logger.warn("vera-relatorio-diario: parse Claude falhou, usando fallback", {
          rawText: rawText.slice(0, 200),
        });
        relatorio = {
          titulo:           `Relatório Diário — ${snapshotOntem.data}`,
          resumo_executivo: `Relatório do dia ${snapshotOntem.data}. Processamento automático concluído. Dados disponíveis no snapshot.`,
          destaques:        ["Snapshot coletado com sucesso"],
          alertas:          ["Relatório gerado com dados parciais — revise manualmente"],
        };
      }

      logger.info("vera-relatorio-diario: relatório gerado, salvando no banco");

      // 5. Calcula período (ontem)
      const periodoFim   = new Date(`${snapshotOntem.data}T23:59:59Z`).toISOString();
      const periodoInicio = new Date(`${snapshotOntem.data}T00:00:00Z`).toISOString();

      // Lê destinatários da env (graceful: array vazio se não configurado)
      const destinatariosEnv = process.env.VERA_RECIPIENTS ?? "";
      const destinatarios = destinatariosEnv
        ? destinatariosEnv.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

      // Monta conteúdo markdown do relatório
      const conteudoMarkdown = [
        `# ${relatorio.titulo}`,
        "",
        `## Resumo Executivo`,
        relatorio.resumo_executivo,
        "",
        `## Destaques`,
        ...relatorio.destaques.map((d) => `- ${d}`),
        "",
        `## Alertas`,
        relatorio.alertas.length > 0
          ? relatorio.alertas.map((a) => `- ${a}`).join("\n")
          : "- Nenhum alerta no período.",
      ].join("\n");

      // 6. INSERT em vera_reports
      const { data: reportData, error: insertError } = await sb
        .from("vera_reports")
        .insert({
          tenant_id:        input.tenant_id,
          tipo:             "diario",
          periodo_inicio:   periodoInicio,
          periodo_fim:      periodoFim,
          titulo:           relatorio.titulo,
          resumo_executivo: relatorio.resumo_executivo,
          conteudo_markdown: conteudoMarkdown,
          metricas:         metricasOntem,
          destinatarios,
          agent_run_id:     null, // agent_runs registrado via logAgentRun
        })
        .select("id")
        .single();

      if (insertError || !reportData) {
        throw new Error(`Erro ao salvar relatório: ${insertError?.message ?? "sem dados retornados"}`);
      }

      // 7. Nota sobre email (graceful: não lança erro se RESEND_API_KEY ausente)
      if (!process.env.RESEND_API_KEY) {
        logger.info("Email VERA: serviço não configurado, salvo apenas no banco");
      }

      logger.info("vera-relatorio-diario concluído", {
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
        costUsd,
        status:      "success",
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("vera-relatorio-diario falhou", {
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
