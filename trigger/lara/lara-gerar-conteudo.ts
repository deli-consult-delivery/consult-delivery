import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { gerarConteudo } from "../../src/agents/lara/gerador";

const TEMAS_ROTATIVOS = [
  "Precificação no delivery: por que a maioria erra o preço",
  "Fotos de cardápio que aumentam o ticket médio",
  "Como gerenciar avaliações negativas no iFood",
  "Automação para donos de loja: o que realmente funciona",
  "Anti-churn: por que seus clientes somem após 3 pedidos",
  "Ficha técnica: a ferramenta que separa quem lucra de quem não lucra",
];

const OutputSchema = z.object({
  draft_id: z.string().uuid(),
  titulo: z.string(),
  tokens: z.number(),
});

export const laraGerarConteudoEditorial = schedules.task({
  id: "lara-editorial-schedule",
  cron: "0 12 * * 1,3,5",
  retry: { maxAttempts: 3, minTimeoutInMs: 60_000, maxTimeoutInMs: 300_000, factor: 2 },

  run: async (payload, { ctx }) => {
    logger.info("lara-editorial-schedule: iniciando geração de conteúdo editorial");

    const sb = getSupabase();

    const { data: tenant } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", "consult")
      .maybeSingle();
    if (!tenant) throw new Error("[lara] tenant 'consult' não encontrado");

    const temaIndex = new Date().getDay() % TEMAS_ROTATIVOS.length;
    const tema = TEMAS_ROTATIVOS[temaIndex];

    const output = await gerarConteudo(
      { tema, formato: "post" },
      { runId: ctx.run.id, tenantId: tenant.id }
    );

    const { data: draft, error } = await sb
      .from("content_drafts")
      .insert({
        tenant_id: tenant.id,
        titulo: output.titulo,
        corpo: output.corpo,
        hashtags: output.hashtags,
        formato: output.formato,
        status: "pendente",
      })
      .select("id")
      .single();

    if (error) throw new Error(`[lara] insert draft falhou: ${error.message}`);

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "lara-editorial",
      tenantId: tenant.id,
      input: { tema, formato: "post" },
      output,
      status: "success",
    });

    logger.info("lara-editorial-schedule: draft criado", { draft_id: draft.id });
    return OutputSchema.parse({ draft_id: draft.id, titulo: output.titulo, tokens: 0 });
  },
});
