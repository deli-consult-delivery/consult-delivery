import { task, tasks, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  contexto: z.string().min(1).max(2000),
  pergunta: z.string().max(500).optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  diagnostico: z.string(),
  falhas_detectadas: z.number(),
  custo_total_24h_usd: z.number(),
  acoes_tomadas: z.array(z.string()),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ── Ferramentas disponíveis para DELI ────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "acionar_lara",
    description: "Aciona LARA para task de marketing",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string" },
        parametros: { type: "object" },
        justificativa: { type: "string" },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
  {
    name: "acionar_vera",
    description: "Aciona VERA para responder pergunta de BI",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string" },
        parametros: { type: "object" },
        justificativa: { type: "string" },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
  {
    name: "acionar_cora",
    description: "Aciona CORA para escalonar cobrança",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string" },
        parametros: { type: "object" },
        justificativa: { type: "string" },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
  {
    name: "acionar_sofia",
    description: "Aciona SOFIA para gerar abordagem de prospecção",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string" },
        parametros: { type: "object" },
        justificativa: { type: "string" },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
];

const toolToTaskId: Record<string, string> = {
  acionar_lara: "lara-gerar-conteudo",
  acionar_vera: "vera-responder-pergunta",
  acionar_cora: "cora-escalonar",
  acionar_sofia: "sofia-gerar-abordagem",
};

// ── Task ──────────────────────────────────────────────────────────────────────

export const deliSupervisionar = task({
  id: "deli-supervisionar",
  retry: { maxAttempts: 2 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    logger.info("deli-supervisionar iniciado", { tenant_id: input.tenant_id });

    try {
      // 1. Buscar últimas 24h de agent_runs
      let falhasDetectadas = 0;
      let custoTotal24h = 0;
      let agentesFalharam: string[] = [];
      let runsContexto = "(dados de execução não disponíveis)";

      try {
        const { data: runs } = await sb
          .from("agent_runs")
          .select("agent_id, status, cost_usd, duration_ms, completed_at, output")
          .eq("tenant_id", input.tenant_id)
          .gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (runs && runs.length > 0) {
          const falhas = (runs as { agent_id: string; status: string; cost_usd: number | null }[]).filter(
            (r) => r.status === "failed"
          );
          falhasDetectadas = falhas.length;
          custoTotal24h = (runs as { cost_usd: number | null }[]).reduce(
            (sum, r) => sum + (r.cost_usd ?? 0),
            0
          );
          agentesFalharam = [...new Set(falhas.map((r) => r.agent_id))];

          runsContexto = `Execuções nas últimas 24h: ${runs.length} total, ${falhasDetectadas} falhas. Custo: $${custoTotal24h.toFixed(4)}. Agentes com falha: ${agentesFalharam.join(", ") || "nenhum"}.`;
        } else {
          runsContexto = "Nenhuma execução registrada nas últimas 24h.";
        }
      } catch {
        logger.warn("deli-supervisionar: tabela agent_runs não disponível");
      }

      // 2. Buscar anomalias ativas de vera_anomalias
      let anomaliasContexto = "(dados de anomalias não disponíveis)";

      try {
        const { data: anomalias } = await sb
          .from("vera_anomalias")
          .select("tipo, descricao, severidade, created_at")
          .eq("tenant_id", input.tenant_id)
          .eq("resolvida", false)
          .order("created_at", { ascending: false })
          .limit(10);

        if (anomalias && anomalias.length > 0) {
          const linhas = (
            anomalias as { tipo: string; descricao: string; severidade: string; created_at: string }[]
          ).map(
            (a) => `[${a.severidade}] ${a.tipo}: ${a.descricao} (${a.created_at.slice(0, 10)})`
          );
          anomaliasContexto = `Anomalias ativas (${anomalias.length}):\n${linhas.join("\n")}`;
        } else {
          anomaliasContexto = "Nenhuma anomalia ativa registrada.";
        }
      } catch {
        logger.warn("deli-supervisionar: tabela vera_anomalias não disponível");
      }

      // 3. Montar bloco de contexto
      const blocoContexto = [
        "=== ESTADO OPERACIONAL DOS AGENTES ===",
        runsContexto,
        "",
        "=== ANOMALIAS ATIVAS ===",
        anomaliasContexto,
        "",
        "=== CONTEXTO ADICIONAL ===",
        input.contexto,
      ].join("\n");

      const userMessage = input.pergunta
        ? `${blocoContexto}\n\nPergunta específica: ${input.pergunta}`
        : blocoContexto;

      // 4. Loop agentico com Claude Sonnet
      const client = new Anthropic();

      const systemPrompt =
        "Você é DELI, COO Digital da Consult Delivery. Analise o estado operacional dos agentes e forneça um diagnóstico executivo preciso. Seja direto e acionável. Use semáforo: 🟢 ok, 🟡 atenção, 🔴 crítico.";

      let messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
      ];

      let diagnostico = "";
      const acoesTomadas: string[] = [];
      const maxTurns = 3;

      logger.info("deli-supervisionar: iniciando loop agentico");

      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages,
          tools,
          tool_choice: { type: "auto" },
        });

        if (response.stop_reason === "tool_use") {
          const toolBlock = response.content.find(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          if (toolBlock && toolToTaskId[toolBlock.name]) {
            const toolInput = toolBlock.input as {
              task: string;
              parametros: Record<string, unknown>;
              justificativa: string;
            };

            const targetTaskId = toolToTaskId[toolBlock.name];
            let toolResult = "";

            try {
              const handle = await tasks.trigger(targetTaskId, {
                tenant_id: input.tenant_id,
                triggered_by: input.triggered_by,
                ...toolInput.parametros,
              });
              const acao = `${toolBlock.name} acionado (run_id: ${handle.id}) — ${toolInput.justificativa}`;
              acoesTomadas.push(acao);
              toolResult = `Agente acionado com sucesso (run_id: ${handle.id}).`;
              logger.info(`deli-supervisionar: ${toolBlock.name} acionado`, { run_id: handle.id });
            } catch (err) {
              toolResult = `Erro ao acionar ${toolBlock.name}: ${(err as Error).message}`;
              logger.warn(`deli-supervisionar: erro ao acionar ${toolBlock.name}`, {
                error: (err as Error).message,
              });
            }

            messages = [
              ...messages,
              { role: "assistant", content: response.content },
              {
                role: "user",
                content: [
                  {
                    type: "tool_result" as const,
                    tool_use_id: toolBlock.id,
                    content: toolResult,
                  },
                ],
              },
            ];
            continue;
          }
        }

        diagnostico = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        break;
      }

      if (!diagnostico) {
        diagnostico = "Diagnóstico não gerado. Verifique os logs do run.";
      }

      logger.info("deli-supervisionar: diagnóstico gerado", {
        falhas_detectadas: falhasDetectadas,
        acoes_tomadas: acoesTomadas.length,
      });

      // 5. Salvar diagnóstico em deli_messages
      try {
        await sb.from("deli_messages").insert({
          tenant_id: input.tenant_id,
          user_id: null,
          role: "assistant",
          content: diagnostico,
          metadata: {
            tipo: "supervisao",
            falhas_detectadas: falhasDetectadas,
          },
        });
      } catch {
        logger.warn("deli-supervisionar: falha ao salvar em deli_messages");
      }

      const output = OutputSchema.parse({
        ok: true,
        diagnostico,
        falhas_detectadas: falhasDetectadas,
        custo_total_24h_usd: Number(custoTotal24h.toFixed(6)),
        acoes_tomadas: acoesTomadas,
      });

      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "deli",
        tenantId: input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output,
        status: "success",
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("deli-supervisionar falhou", {
        tenant_id: input.tenant_id,
        error: errorMessage,
      });

      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "deli",
        tenantId: input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: { error: errorMessage },
        status: "failed",
      });

      throw error;
    }
  },
});
