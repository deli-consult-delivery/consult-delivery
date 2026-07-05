import { task, logger } from "@trigger.dev/sdk/v3";
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
  prospect_id:  z.string().uuid(),
  canal:        z.enum(["whatsapp", "instagram_dm", "email"]),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:           z.boolean(),
  abordagem_id: z.string().uuid(),
  mensagem:     z.string(),
  canal:        z.string(),
});

// Schema interno do resultado Claude
const AbordagemResultSchema = z.object({
  mensagem: z.string().min(10),
  assunto:  z.string().nullable(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK
// =====================================================

export const sofiaGerarAbordagem = task({
  id: "sofia-gerar-abordagem",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    logger.info("sofia-gerar-abordagem iniciado", {
      tenant_id:   input.tenant_id,
      prospect_id: input.prospect_id,
      canal:       input.canal,
    });

    try {
      // 1. Busca prospect com todos os dados
      const { data: prospect, error: fetchError } = await sb
        .from("prospects")
        .select(
          "id, nome, cidade, estado, segmento, avaliacao_ifood, num_avaliacoes_ifood, instagram, site, score, razao_score, status"
        )
        .eq("id", input.prospect_id)
        .eq("tenant_id", input.tenant_id)
        .single();

      if (fetchError || !prospect) {
        throw new Error(
          `Prospect não encontrado: ${input.prospect_id} (tenant: ${input.tenant_id})`
        );
      }

      // 2. Busca última pesquisa para dados_relevantes
      const { data: ultimaPesquisa } = await sb
        .from("prospect_pesquisas")
        .select("dados_coletados")
        .eq("prospect_id", input.prospect_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const dadosColetados = ultimaPesquisa?.dados_coletados as Record<string, unknown> | null;
      const dadosRelevantes = typeof dadosColetados?.dados_relevantes === "string"
        ? dadosColetados.dados_relevantes
        : "Nenhum dado adicional disponível";

      logger.info("Dados carregados, gerando abordagem personalizada", {
        canal:       input.canal,
        score:       prospect.score,
        tem_pesquisa: !!ultimaPesquisa,
      });

      // 3. Instrução por canal
      const instrucaoCanal: Record<string, string> = {
        whatsapp:      "máximo 3 parágrafos, linguagem próxima e natural, sem formalidade excessiva, mencione algo específico e real da loja",
        instagram_dm:  "máximo 2 parágrafos, tom dinâmico, CTA claro no final",
        email:         "pode ser mais estruturado e detalhado, inclua um assunto atrativo no campo 'assunto'",
      };

      // 4. Instanciação dentro do run() — anti-padrão #4
      const anthropic = new Anthropic();

      const prompt = `Você é SOFIA, SDR da Consult Delivery (consultoria de delivery, Parauapebas-PA).

Gere uma abordagem personalizada para o canal ${input.canal} para este prospect:

Nome: ${prospect.nome}
Cidade: ${prospect.cidade ?? "não informado"}/${prospect.estado ?? "não informado"}
Segmento: ${prospect.segmento ?? "não informado"}
Nota iFood: ${prospect.avaliacao_ifood ?? "não encontrada"} (${prospect.num_avaliacoes_ifood ?? "?"} avaliações)
Instagram: ${prospect.instagram ?? "não encontrado"}
Score SOFIA: ${prospect.score ?? "não calculado"}/100 — ${prospect.razao_score ?? "sem análise"}
Dados relevantes: ${dadosRelevantes}

Consult Delivery oferece:
- Consultoria especializada em delivery (gestão de operação, cardápio, iFood)
- Estratégias para aumentar pedidos e melhorar avaliação
- R$ 400/mês, sem fidelidade mínima

Regras para canal ${input.canal}:
${instrucaoCanal[input.canal]}

Retorne APENAS JSON (sem markdown, sem texto fora do JSON):
{
  "mensagem": "texto completo da abordagem",
  "assunto": "assunto da mensagem se for email, null caso contrário"
}

NUNCA:
- Prometer resultados específicos (ex: "vai triplicar seus pedidos")
- Inventar dados da loja que não estão nas informações acima
- Ser genérico — a mensagem precisa mencionar algo real e específico do prospect
- Usar linguagem de spam ou excesso de emojis`;

      const response = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1024,
        system:
          "Você é SOFIA, SDR especializada em prospecção de lojas de delivery. Gere abordagens personalizadas, genuínas e eficazes. Responda SEMPRE com JSON válido, sem markdown.",
        messages: [{ role: "user", content: prompt }],
      });

      let costUsd = calcularCustoUsd("claude-sonnet-4-6", response.usage) ?? 0;

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      // Parse do resultado — com retry de correção
      let abordagem: z.infer<typeof AbordagemResultSchema>;
      try {
        const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        abordagem = AbordagemResultSchema.parse(JSON.parse(match ? match[0] : cleaned));
      } catch {
        // Retry de correção: instrução explícita para corrigir o formato
        logger.warn("Primeiro parse falhou, tentando correção de formato", {
          rawText: rawText.slice(0, 300),
        });

        const correcaoResponse = await anthropic.messages.create({
          model:      "claude-sonnet-4-6",
          max_tokens: 1024,
          system:     "Corrija o JSON abaixo para que seja válido e corresponda exatamente ao schema solicitado.",
          messages: [
            {
              role:    "user",
              content: `O JSON abaixo está malformado ou fora do schema esperado. Corrija-o e retorne APENAS JSON válido no formato: {"mensagem": "...", "assunto": "... ou null"}.\n\nTexto original:\n${rawText}`,
            },
          ],
        });

        costUsd += calcularCustoUsd("claude-sonnet-4-6", correcaoResponse.usage) ?? 0;

        const correcaoText = correcaoResponse.content
          .filter((b) => b.type === "text")
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("");

        const match2 = correcaoText.match(/\{[\s\S]*\}/);
        abordagem = AbordagemResultSchema.parse(JSON.parse(match2 ? match2[0] : correcaoText));
      }

      logger.info("Abordagem gerada com sucesso", {
        canal:            input.canal,
        tamanho_mensagem: abordagem.mensagem.length,
        tem_assunto:      !!abordagem.assunto,
      });

      // 5. Insere em prospect_abordagens com status='rascunho'
      const { data: abordagemInserida, error: insertError } = await sb
        .from("prospect_abordagens")
        .insert({
          prospect_id: input.prospect_id,
          canal:       input.canal,
          mensagem:    abordagem.mensagem,
          status:      "rascunho",
          created_by:  input.triggered_by ?? null,
        })
        .select("id")
        .single();

      if (insertError || !abordagemInserida) {
        throw new Error(`Erro ao salvar abordagem: ${insertError?.message ?? "retorno vazio"}`);
      }

      // 6. Atualiza status do prospect para 'abordado' se já era qualificado
      if (prospect.status === "qualificado") {
        await sb
          .from("prospects")
          .update({ status: "abordado", updated_at: new Date().toISOString() })
          .eq("id", input.prospect_id)
          .eq("tenant_id", input.tenant_id);
      }

      // OBRIGATÓRIO: audit log
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: {
          ok:           true,
          abordagem_id: abordagemInserida.id,
          canal:        input.canal,
        },
        costUsd,
        status: "success",
      });

      return OutputSchema.parse({
        ok:           true,
        abordagem_id: abordagemInserida.id,
        mensagem:     abordagem.mensagem,
        canal:        input.canal,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("sofia-gerar-abordagem falhou", {
        prospect_id: input.prospect_id,
        canal:       input.canal,
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
