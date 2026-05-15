import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  prospect_id:  z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:               z.boolean(),
  prospect_id:      z.string().uuid(),
  dados_encontrados: z.boolean(),
  fontes:           z.array(z.string()),
});

// Schema interno para o resultado da pesquisa Claude
const PesquisaResultSchema = z.object({
  instagram:        z.string().nullable(),
  ifood_link:       z.string().nullable(),
  avaliacao_ifood:  z.number().nullable(),
  num_avaliacoes:   z.number().nullable(),
  whatsapp:         z.string().nullable(),
  site:             z.string().nullable(),
  dados_relevantes: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK
// =====================================================

export const sofiaPesquisarProspect = task({
  id: "sofia-pesquisar-prospect",
  retry: { maxAttempts: 3, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    logger.info("sofia-pesquisar-prospect iniciado", {
      tenant_id:   input.tenant_id,
      prospect_id: input.prospect_id,
    });

    try {
      // 1. Busca prospect no banco
      const { data: prospect, error: fetchError } = await sb
        .from("prospects")
        .select("id, nome, cidade, estado, segmento")
        .eq("id", input.prospect_id)
        .eq("tenant_id", input.tenant_id)
        .single();

      if (fetchError || !prospect) {
        throw new Error(
          `Prospect não encontrado: ${input.prospect_id} (tenant: ${input.tenant_id})`
        );
      }

      logger.info("Prospect encontrado, iniciando pesquisa web", {
        nome:    prospect.nome,
        cidade:  prospect.cidade,
        estado:  prospect.estado,
      });

      // 2. Marca status como 'pesquisando'
      await sb
        .from("prospects")
        .update({ status: "pesquisando", updated_at: new Date().toISOString() })
        .eq("id", input.prospect_id)
        .eq("tenant_id", input.tenant_id);

      // 3. Pesquisa web com Claude + web_search
      const localidade = [prospect.cidade, prospect.estado].filter(Boolean).join("/");
      const segmento   = prospect.segmento ?? "restaurante delivery";

      const systemPrompt = `Você é SOFIA, SDR especializada em prospecção de lojas de delivery para a Consult Delivery.
Sua função é pesquisar dados públicos de lojas para qualificação comercial.
Retorne SEMPRE JSON válido, sem markdown, sem texto adicional.`;

      const userPrompt = `Pesquise dados públicos desta loja de delivery:

Nome: ${prospect.nome}
Cidade/Estado: ${localidade || "não informado"}
Segmento: ${segmento}

Busque:
1. Instagram da loja (perfil @handle)
2. Presença e nota no iFood (link do perfil iFood)
3. WhatsApp de contato
4. Site próprio ou cardápio digital

Retorne APENAS JSON:
{
  "instagram": "@handle ou null",
  "ifood_link": "URL completa do perfil iFood ou null",
  "avaliacao_ifood": 4.5,
  "num_avaliacoes": 230,
  "whatsapp": "número com DDI (ex: 5594999999999) ou null",
  "site": "URL ou null",
  "dados_relevantes": "resumo em 2-3 frases do que encontrou sobre a loja"
}

Se não encontrar o dado, use null. Para avaliacao_ifood e num_avaliacoes, use null se não encontrar.`;

      const pesquisa = await runClaudeWithWebSearch({
        systemPrompt,
        userPrompt,
        outputSchema: PesquisaResultSchema,
        maxRetries:   1,
        useWebSearch: true,
      });

      logger.info("Pesquisa web concluída", {
        instagram:       pesquisa.instagram,
        avaliacao_ifood: pesquisa.avaliacao_ifood,
        num_avaliacoes:  pesquisa.num_avaliacoes,
      });

      // 4. Monta campos a atualizar (só campos não-null)
      const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (pesquisa.instagram      !== null) updateFields.instagram             = pesquisa.instagram;
      if (pesquisa.ifood_link     !== null) updateFields.ifood_link            = pesquisa.ifood_link;
      if (pesquisa.avaliacao_ifood !== null) updateFields.avaliacao_ifood      = pesquisa.avaliacao_ifood;
      if (pesquisa.num_avaliacoes !== null) updateFields.num_avaliacoes_ifood  = pesquisa.num_avaliacoes;
      if (pesquisa.whatsapp       !== null) updateFields.whatsapp              = pesquisa.whatsapp;
      if (pesquisa.site           !== null) updateFields.site                  = pesquisa.site;

      // 5. Atualiza prospect com dados encontrados
      await sb
        .from("prospects")
        .update(updateFields)
        .eq("id", input.prospect_id)
        .eq("tenant_id", input.tenant_id);

      // 6. Determina fontes encontradas
      const fontes: string[] = [];
      if (pesquisa.instagram  !== null) fontes.push("instagram");
      if (pesquisa.ifood_link !== null) fontes.push("ifood");
      if (pesquisa.whatsapp   !== null) fontes.push("whatsapp");
      if (pesquisa.site       !== null) fontes.push("site");

      const dadosColetados = {
        instagram:        pesquisa.instagram,
        ifood_link:       pesquisa.ifood_link,
        avaliacao_ifood:  pesquisa.avaliacao_ifood,
        num_avaliacoes:   pesquisa.num_avaliacoes,
        whatsapp:         pesquisa.whatsapp,
        site:             pesquisa.site,
        dados_relevantes: pesquisa.dados_relevantes,
      };

      // 7. Insere registro em prospect_pesquisas
      await sb.from("prospect_pesquisas").insert({
        prospect_id:    input.prospect_id,
        dados_coletados: dadosColetados,
        fontes,
        agent_run_id: ctx.run.id,
      });

      const dadosEncontrados = fontes.length > 0;

      logger.info("sofia-pesquisar-prospect concluído", {
        prospect_id:      input.prospect_id,
        dados_encontrados: dadosEncontrados,
        fontes,
      });

      // OBRIGATÓRIO: audit log
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: { ok: true, prospect_id: input.prospect_id, dados_encontrados: dadosEncontrados, fontes },
        status:  "success",
      });

      return OutputSchema.parse({
        ok:               true,
        prospect_id:      input.prospect_id,
        dados_encontrados: dadosEncontrados,
        fontes,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("sofia-pesquisar-prospect falhou", {
        prospect_id: input.prospect_id,
        error:       errorMessage,
      });

      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
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
