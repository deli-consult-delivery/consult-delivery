import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { qualificarLead } from "../../src/agents/sofia/prospeccao";

const LeadSchema = z.object({
  nome: z.string(),
  fonte: z.enum(["google_maps", "ifood", "instagram", "manual", "outro"]),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  telefone: z.string().optional(),
  instagram: z.string().optional(),
  ifood_url: z.string().optional(),
  gmaps_url: z.string().optional(),
  score: z.number().int().min(1).max(10),
  justificativa: z.string(),
  dados_json: z.record(z.unknown()).default({}),
});

const OutputSchema = z.object({
  leads_processados: z.number(),
  leads_inseridos: z.number(),
  score_medio: z.number(),
});

const CIDADES_DEFAULT = ["São Paulo", "Campinas", "Santos"];
const QUERIES_DEFAULT = [
  "restaurante delivery",
  "hamburgueria artesanal",
  "pizzaria delivery",
  "comida saudável delivery",
];

export const sofiaProspectTask = schedules.task({
  id: "sofia-prospect",
  cron: "0 12 * * 1-5",
  retry: { maxAttempts: 2, minTimeoutInMs: 120_000, maxTimeoutInMs: 600_000, factor: 2 },

  run: async (payload, { ctx }) => {
    logger.info("sofia-prospect: iniciando prospecção diária");

    const sb = getSupabase();
    const { data: tenant } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", "consult")
      .maybeSingle();
    if (!tenant) throw new Error("[sofia] tenant 'consult' não encontrado");

    let inseridos = 0;
    let totalScore = 0;
    let processados = 0;

    for (const cidade of CIDADES_DEFAULT.slice(0, 1)) {
      for (const query of QUERIES_DEFAULT.slice(0, 2)) {
        try {
          const dadosBrutos = `Busca: "${query}" em ${cidade}. Dados simulados para smoke test.`;

          const lead = await qualificarLead(
            { query, cidade, fonte: "google_maps", dados_brutos: dadosBrutos },
            { runId: ctx.run.id, tenantId: tenant.id }
          );

          processados++;
          const validated = LeadSchema.parse({ ...lead, fonte: "google_maps" });

          const { data: existing } = await sb
            .from("leads")
            .select("id")
            .eq("tenant_id", tenant.id)
            .eq("nome", validated.nome)
            .eq("cidade", validated.cidade ?? cidade)
            .maybeSingle();

          if (!existing) {
            await sb.from("leads").insert({
              ...validated,
              tenant_id: tenant.id,
            });
            inseridos++;
            totalScore += validated.score;
          }
        } catch (err) {
          logger.warn("sofia-prospect: falha ao qualificar lead", {
            error: (err as Error).message,
          });
        }
      }
    }

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "sofia",
      tenantId: tenant.id,
      input: { cidades: CIDADES_DEFAULT, queries: QUERIES_DEFAULT },
      output: { inseridos, processados },
      status: "success",
    });

    logger.info("sofia-prospect: concluído", { inseridos, processados });
    return OutputSchema.parse({
      leads_processados: processados,
      leads_inseridos: inseridos,
      score_medio: inseridos > 0 ? Math.round(totalScore / inseridos) : 0,
    });
  },
});
