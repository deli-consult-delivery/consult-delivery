import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
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
  ok:          z.boolean(),
  prospect_id: z.string().uuid(),
  score:       z.number().min(0).max(100),
  status:      z.enum(["qualificado", "nao_qualificado", "manual"]),
  razao_score: z.string(),
});

// Schema interno do resultado Claude
const ScoreResultSchema = z.object({
  score:  z.number().min(0).max(100),
  razao:  z.string(),
  status: z.enum(["qualificado", "nao_qualificado", "manual"]),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK
// =====================================================

export const sofiaQualificar = task({
  id: "sofia-qualificar",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    logger.info("sofia-qualificar iniciado", {
      tenant_id:   input.tenant_id,
      prospect_id: input.prospect_id,
    });

    try {
      // 1. Busca prospect com todos os dados atuais
      const { data: prospect, error: fetchError } = await sb
        .from("prospects")
        .select(
          "id, nome, cidade, estado, segmento, avaliacao_ifood, num_avaliacoes_ifood, instagram, site, status"
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
        .eq("tenant_id", input.tenant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const dadosColetados = ultimaPesquisa?.dados_coletados as Record<string, unknown> | null;
      const dadosRelevantes = typeof dadosColetados?.dados_relevantes === "string"
        ? dadosColetados.dados_relevantes
        : "Sem dados de pesquisa disponíveis";

      logger.info("Dados carregados, chamando Claude para score", {
        avaliacao_ifood:     prospect.avaliacao_ifood,
        num_avaliacoes_ifood: prospect.num_avaliacoes_ifood,
        tem_instagram:       !!prospect.instagram,
      });

      // 3. Instanciação dentro do run() — anti-padrão #4
      const anthropic = new Anthropic();

      const prompt = `Você é SOFIA, SDR da Consult Delivery.

ICP (Ideal Customer Profile):
- Cliente ideal: 30-100 pedidos/dia, qualquer plataforma de delivery
- Anti-perfil: nota iFood < 3.0, sem CNPJ, menos 3 meses de operação
- Ticket: R$ 400/mês

Dados do prospect:
Nome: ${prospect.nome}
Cidade: ${prospect.cidade ?? "não informado"}/${prospect.estado ?? "não informado"}
Segmento: ${prospect.segmento ?? "não informado"}
Nota iFood: ${prospect.avaliacao_ifood ?? "não encontrada"}
Nº avaliações: ${prospect.num_avaliacoes_ifood ?? "não encontrado"}
Instagram: ${prospect.instagram ?? "não encontrado"}
Site próprio: ${prospect.site ?? "não encontrado"}
Dados pesquisa: ${dadosRelevantes}

Calcule um score de 0-100 e retorne APENAS JSON:
{
  "score": 75,
  "razao": "Explicação em 2 frases de por que esse score",
  "status": "qualificado"
}

Regras de score:
- +30 pts se nota iFood >= 4.0
- +20 pts se 50-100 pedidos estimados/dia (baseado em nº avaliações)
- +15 pts se tem Instagram ativo
- +10 pts se tem site próprio ou delivery próprio
- -50 pts imediatos se nota < 3.0 (anti-perfil absoluto)
- Score final: 0-100

Status obrigatório:
- "qualificado"     → score >= 70
- "nao_qualificado" → score < 30
- "manual"          → score entre 30 e 69`;

      const response = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system:
          "Você é SOFIA, SDR especializada em qualificação de prospects delivery. Responda SEMPRE com JSON válido, sem markdown.",
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      // Extrai JSON da resposta
      let scoreResult: z.infer<typeof ScoreResultSchema>;
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        scoreResult = ScoreResultSchema.parse(JSON.parse(match ? match[0] : rawText));
      } catch {
        // Fallback determinístico se Claude não retornar JSON válido
        logger.warn("Claude não retornou JSON válido em sofia-qualificar, usando fallback", {
          rawText: rawText.slice(0, 200),
        });
        const avaliacaoNum = Number(prospect.avaliacao_ifood ?? 0);
        const scoreBase = avaliacaoNum >= 4.0
          ? 65
          : avaliacaoNum >= 3.0
          ? 40
          : 15;
        scoreResult = {
          score:  scoreBase,
          razao:  "Score calculado por fallback automático — dados insuficientes para análise completa.",
          status: scoreBase >= 70 ? "qualificado" : scoreBase < 30 ? "nao_qualificado" : "manual",
        };
      }

      logger.info("Score calculado", {
        score:  scoreResult.score,
        status: scoreResult.status,
      });

      // 4. Determina o status final a persistir
      // Mantém 'abordado' ou outros status avançados se já estiverem nessa etapa
      const statusFinal = ["abordado", "respondeu", "convertido"].includes(prospect.status ?? "")
        ? prospect.status
        : scoreResult.status;

      // 5. Atualiza prospect com score e status
      await sb
        .from("prospects")
        .update({
          score:       scoreResult.score,
          razao_score: scoreResult.razao,
          status:      statusFinal,
          updated_at:  new Date().toISOString(),
        })
        .eq("id", input.prospect_id)
        .eq("tenant_id", input.tenant_id);

      // OBRIGATÓRIO: audit log
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: {
          ok:          true,
          prospect_id: input.prospect_id,
          score:       scoreResult.score,
          status:      scoreResult.status,
          razao_score: scoreResult.razao,
        },
        status: "success",
      });

      return OutputSchema.parse({
        ok:          true,
        prospect_id: input.prospect_id,
        score:       scoreResult.score,
        status:      scoreResult.status,
        razao_score: scoreResult.razao,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("sofia-qualificar falhou", {
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
