import { task, tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { chatWithTools, type ToolDef, type OAIMessage } from "../_shared/llm-tools";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  reply: z.string(),
  memories_used: z.number(),
  lara_triggered: z.boolean().optional(),
  agents_triggered: z.array(z.string()).optional(),
});

// ── Ferramentas dos agentes ───────────────────────────────────────────────────

const acionarLaraTool: ToolDef = {
  type: "function",
  function: {
    name: "acionar_lara",
    description: "Aciona a LARA para executar uma task de marketing em background. Use quando o usuário pedir pesquisa de loja, geração de conteúdo ou análise de tendências. O resultado chegará no chat em alguns minutos.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          enum: ["pesquisar-loja", "gerar-conteudo", "analisar-tendencia"],
          description: "Qual task da LARA executar",
        },
        parametros: {
          type: "object",
          description: "Parâmetros para a task. pesquisar-loja: {loja_nome, cidade?, ifood_link?, instagram?}. gerar-conteudo: {loja_nome, tipo, objetivo, contexto?, tom?, cupom?}. analisar-tendencia: {segmento, cidade?, foco?}",
        },
        justificativa: {
          type: "string",
          description: "Por que você está acionando a LARA agora",
        },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
};

const acionarVeraTool: ToolDef = {
  type: "function",
  function: {
    name: "acionar_vera",
    description: "Aciona a VERA para gerar um relatório analítico ou responder uma pergunta com dados reais do negócio. Use quando o usuário pedir análises, métricas, KPIs ou relatórios de BI.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          enum: ["vera-responder-pergunta", "vera-snapshot-diario"],
          description: "Qual task da VERA executar",
        },
        parametros: {
          type: "object",
          description: "Para vera-responder-pergunta: {pergunta: string}. Para vera-snapshot-diario: {}",
        },
        justificativa: {
          type: "string",
          description: "Por que você está acionando a VERA agora",
        },
      },
      required: ["task", "parametros", "justificativa"],
    },
  },
};

const acionarCoraTool: ToolDef = {
  type: "function",
  function: {
    name: "acionar_cora",
    description: "Aciona a CORA para escalonar ou gerenciar uma cobrança. Use quando o usuário mencionar inadimplência, devedor, cobrança vencida ou quiser agir sobre um cliente com pagamento em atraso.",
    parameters: {
      type: "object",
      properties: {
        cobranca_id: {
          type: "string",
          description: "ID da cobrança a escalonar (UUID)",
        },
        justificativa: {
          type: "string",
          description: "Por que você está acionando a CORA agora",
        },
      },
      required: ["cobranca_id", "justificativa"],
    },
  },
};

const acionarSofiaTool: ToolDef = {
  type: "function",
  function: {
    name: "acionar_sofia",
    description: "Aciona a SOFIA para iniciar ou retomar uma abordagem de prospecção para um prospect específico. Use quando o usuário pedir para contatar, abordar ou qualificar um prospect.",
    parameters: {
      type: "object",
      properties: {
        prospect_id: {
          type: "string",
          description: "ID do prospect no banco (UUID)",
        },
        instrucao: {
          type: "string",
          description: "Instrução específica para a SOFIA sobre como abordar este prospect",
        },
        justificativa: {
          type: "string",
          description: "Por que você está acionando a SOFIA agora",
        },
      },
      required: ["prospect_id", "instrucao", "justificativa"],
    },
  },
};

const acionarBrenoTool: ToolDef = {
  type: "function",
  function: {
    name: "acionar_breno",
    description: "Pausa ou libera o BRENO em uma conversa de atendimento. Use quando o usuário quiser que o BRENO pare de responder automaticamente em uma conversa ou retome o atendimento.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: {
          type: "string",
          description: "ID da conversa (UUID)",
        },
        acao: {
          type: "string",
          enum: ["pausar", "liberar"],
          description: "pausar = BRENO para de responder; liberar = BRENO retoma atendimento automático",
        },
        justificativa: {
          type: "string",
          description: "Por que você está acionando o BRENO agora",
        },
      },
      required: ["conversation_id", "acao", "justificativa"],
    },
  },
};

const consultarKpisTool: ToolDef = {
  type: "function",
  function: {
    name: "consultar_kpis",
    description: "Consulta os KPIs e métricas mais recentes do negócio direto do banco. Use quando o usuário pedir números reais como faturamento, inadimplência, prospects, taxa de recuperação, etc.",
    parameters: {
      type: "object",
      properties: {
        metricas: {
          type: "array",
          items: { type: "string" },
          description: "Lista de métricas desejadas. Valores possíveis: snapshot_vera, cobrancas_vencidas, prospects_novos, conversas_abertas, anomalias_ativas",
        },
      },
      required: ["metricas"],
    },
  },
};

// ── Task ──────────────────────────────────────────────────────────────────────

export const deliConversa = task({
  id: "deli-conversa",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Contexto do tenant
    const { data: tenant } = await sb
      .from("tenants")
      .select("name, slug")
      .eq("id", input.tenant_id)
      .single();

    // 2. Memórias persistentes
    const { data: memories } = await sb
      .from("agent_memories")
      .select("content, kind, importance, created_at")
      .eq("agent_id", "deli")
      .eq("tenant_id", input.tenant_id)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15);

    // 3. Histórico recente — inclui mensagens do usuário E relatórios de agentes (user_id IS NULL)
    const { data: history } = await sb
      .from("deli_messages")
      .select("role, content, metadata")
      .eq("tenant_id", input.tenant_id)
      .or(`user_id.eq.${input.user_id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(25);

    const historyChronological = (history ?? []).reverse();

    // 4. System prompt
    const tenantName = tenant?.name ?? "Consult Delivery";
    const memoriesBlock =
      memories && memories.length > 0
        ? memories.map((m) => `[${m.kind}] ${m.content}`).join("\n")
        : "(sem memórias registradas ainda)";

    const systemPrompt = `Você é DELI, COO Digital da ${tenantName}. Você é o braço direito do CEO Wandson Silva.

## Papel
- Monitorar e resumir o estado do negócio em tempo real
- Propor ações estratégicas com semáforo: 🟢 Verde (executa sozinha), 🟡 Amarelo (propõe, aguarda aprovação), 🔴 Vermelho (precisa de aprovação explícita)
- Acionar agentes especialistas conforme a necessidade do usuário
- Dar respostas diretas, práticas e acionáveis — sem enrolação

## Agentes sob sua supervisão
- **LARA** — CRM & Marketing food service. Acione via \`acionar_lara\` para pesquisa de loja, geração de conteúdo ou análise de tendências.
- **VERA** — BI & Relatórios. Acione via \`acionar_vera\` para análises de dados, KPIs e relatórios.
- **CORA** — Cobrança inteligente. Acione via \`acionar_cora\` para escalonar devedores ou gerenciar cobranças vencidas.
- **SOFIA** — SDR/Prospecção. Acione via \`acionar_sofia\` para iniciar ou retomar abordagem com um prospect.
- **BRENO** — Atendimento WhatsApp. Acione via \`acionar_breno\` para pausar ou liberar o atendimento automático em uma conversa.
- **KPIs diretos** — Use \`consultar_kpis\` para buscar métricas reais do banco sem precisar acionar um agente.

## Memórias e contexto do negócio
${memoriesBlock}

## Regras absolutas
- Responda SEMPRE em português brasileiro
- Você fala APENAS com a equipe interna (Wandson, Wélida, Eduardo) — NUNCA com clientes finais
- Quando acionar um agente, avise o usuário que o resultado chegará em alguns minutos no chat
- Use emojis moderadamente para clareza visual (🟢🟡🔴✅⚠️🚨)
- Se não souber algo com certeza, use \`consultar_kpis\` para buscar dados reais — nunca invente números
- Respostas longas: use markdown (cabeçalhos, bullets, negrito) para organização`;

    // 5. Formata mensagens do histórico — relatórios de agentes aparecem com prefixo
    const histMessages: OAIMessage[] = historyChronological.map((h) => {
      const isAgentReport = h.metadata?.source_agent != null;
      const content = isAgentReport
        ? `[Relatório ${String(h.metadata.source_agent).toUpperCase()}] ${h.content}`
        : h.content;
      return { role: h.role as "user" | "assistant", content };
    });

    let messages: OAIMessage[] = [
      ...histMessages,
      { role: "user", content: input.message },
    ];

    // 6. Loop agentico — suporte a todas as tools dos agentes
    let reply = "";
    let laraTriggered = false;
    const agentsTriggered: string[] = [];
    const maxTurns = 5;
    // null até o 1º turno com custo calculável (provider Anthropic/OpenRouter) —
    // nunca soma 0 fake quando todos os turnos caem no Ollama (sem custo por token).
    let costUsd: number | null = null;

    const allTools = [
      acionarLaraTool,
      acionarVeraTool,
      acionarCoraTool,
      acionarSofiaTool,
      acionarBrenoTool,
      consultarKpisTool,
    ];

    for (let turn = 0; turn < maxTurns; turn++) {
      const { message, cost_usd } = await chatWithTools({
        system: systemPrompt,
        messages,
        tools: allTools,
        maxTokens: 1024,
      });
      if (cost_usd != null) costUsd = (costUsd ?? 0) + cost_usd;

      if (message.tool_calls?.length) {
        const toolCall = message.tool_calls[0];
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        let toolResult = "";

        if (toolCall.function.name === "acionar_lara") {
          const toolInput = toolArgs as {
            task: string;
            parametros: Record<string, unknown>;
            justificativa: string;
          };
          try {
            const handle = await tasks.trigger(`lara-${toolInput.task}`, {
              tenant_id: input.tenant_id,
              triggered_by: input.user_id,
              ...toolInput.parametros,
            });
            laraTriggered = true;
            agentsTriggered.push("lara");
            toolResult = `LARA acionada com sucesso (run_id: ${handle.id}). O resultado chegará em alguns minutos no chat.`;
          } catch (err) {
            toolResult = `Erro ao acionar LARA: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "acionar_vera") {
          const toolInput = toolArgs as {
            task: string;
            parametros: Record<string, unknown>;
            justificativa: string;
          };
          try {
            const handle = await tasks.trigger(toolInput.task, {
              tenant_id: input.tenant_id,
              triggered_by: input.user_id,
              ...toolInput.parametros,
            });
            agentsTriggered.push("vera");
            toolResult = `VERA acionada com sucesso (run_id: ${handle.id}). O resultado chegará em alguns minutos no chat.`;
          } catch (err) {
            toolResult = `Erro ao acionar VERA: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "acionar_cora") {
          const toolInput = toolArgs as {
            cobranca_id: string;
            justificativa: string;
          };
          try {
            const handle = await tasks.trigger("cora-escalonar", {
              tenant_id: input.tenant_id,
              cobranca_id: toolInput.cobranca_id,
              triggered_by: input.user_id,
            });
            agentsTriggered.push("cora");
            toolResult = `CORA acionada com sucesso (run_id: ${handle.id}). A cobrança será escalada em breve.`;
          } catch (err) {
            toolResult = `Erro ao acionar CORA: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "acionar_sofia") {
          const toolInput = toolArgs as {
            prospect_id: string;
            instrucao: string;
            justificativa: string;
          };
          try {
            const handle = await tasks.trigger("sofia-gerar-abordagem", {
              tenant_id: input.tenant_id,
              prospect_id: toolInput.prospect_id,
              instrucao: toolInput.instrucao,
              triggered_by: input.user_id,
            });
            agentsTriggered.push("sofia");
            toolResult = `SOFIA acionada com sucesso (run_id: ${handle.id}). A abordagem será gerada em breve.`;
          } catch (err) {
            toolResult = `Erro ao acionar SOFIA: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "acionar_breno") {
          const toolInput = toolArgs as {
            conversation_id: string;
            acao: "pausar" | "liberar";
            justificativa: string;
          };
          try {
            await sb
              .from("conversations")
              .update({ breno_pausado: toolInput.acao === "pausar" })
              .eq("id", toolInput.conversation_id)
              .eq("tenant_id", input.tenant_id);
            agentsTriggered.push("breno");
            toolResult = `BRENO ${toolInput.acao === "pausar" ? "pausado" : "liberado"} com sucesso na conversa ${toolInput.conversation_id}.`;
          } catch (err) {
            toolResult = `Erro ao acionar BRENO: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "consultar_kpis") {
          const toolInput = toolArgs as { metricas: string[] };
          const kpiResults: Record<string, unknown> = {};

          if (toolInput.metricas.includes("snapshot_vera")) {
            try {
              const { data } = await sb
                .from("vera_metricas_snapshot")
                .select("data, metricas")
                .eq("tenant_id", input.tenant_id)
                .order("data", { ascending: false })
                .limit(1)
                .single();
              kpiResults.snapshot_vera = data ?? null;
            } catch { kpiResults.snapshot_vera = null; }
          }
          if (toolInput.metricas.includes("cobrancas_vencidas")) {
            try {
              const { data } = await sb
                .from("cora_cobrancas")
                .select("id, valor_atual, status, cliente_nome")
                .eq("tenant_id", input.tenant_id)
                .in("status", ["pendente", "vencida"]);
              kpiResults.cobrancas_vencidas = { total: data?.length ?? 0, registros: data ?? [] };
            } catch { kpiResults.cobrancas_vencidas = null; }
          }
          if (toolInput.metricas.includes("prospects_novos")) {
            try {
              const { count } = await sb
                .from("prospects")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", input.tenant_id)
                .eq("status", "novo");
              kpiResults.prospects_novos = count ?? 0;
            } catch { kpiResults.prospects_novos = null; }
          }
          if (toolInput.metricas.includes("conversas_abertas")) {
            try {
              const { count } = await sb
                .from("conversations")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", input.tenant_id)
                .in("status", ["open", "pendente"]);
              kpiResults.conversas_abertas = count ?? 0;
            } catch { kpiResults.conversas_abertas = null; }
          }
          if (toolInput.metricas.includes("anomalias_ativas")) {
            try {
              const { data } = await sb
                .from("vera_anomalias")
                .select("tipo, descricao, severidade, created_at")
                .eq("tenant_id", input.tenant_id)
                .eq("resolvida", false)
                .limit(10);
              kpiResults.anomalias_ativas = data ?? [];
            } catch { kpiResults.anomalias_ativas = []; }
          }

          toolResult = JSON.stringify(kpiResults, null, 2);
        } else {
          toolResult = `Ferramenta desconhecida: ${toolCall.function.name}`;
        }

        messages = [
          ...messages,
          { role: "assistant", content: message.content, tool_calls: message.tool_calls },
          { role: "tool", tool_call_id: toolCall.id, content: toolResult },
        ];
        continue;
      }

      // Resposta final em texto
      reply = message.content ?? "";
      break;
    }

    if (!reply) reply = "Desculpa, não consegui gerar uma resposta. Tente novamente.";

    // 7. Salvar user + assistant no histórico
    await sb.from("deli_messages").insert([
      {
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        role: "user",
        content: input.message,
      },
      {
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        role: "assistant",
        content: reply,
      },
    ]);

    // 8. Salvar fato relevante na memória (heurística simples)
    const isDecision =
      /decisão|decidimos|ficou acertado|mudamos|cancelamos|novo cliente|perdemos|fechamos|aprovado|rejeitado/i.test(
        input.message
      );

    if (isDecision && input.message.length > 50) {
      await sb
        .from("agent_memories")
        .insert({
          agent_id: "deli",
          tenant_id: input.tenant_id,
          user_id: input.user_id,
          kind: "decision",
          content: `[${new Date().toISOString().slice(0, 10)}] "${input.message.slice(0, 250)}"`,
          importance: 7,
        });
    }

    // 9. Log de execução
    const output = OutputSchema.parse({
      ok: true,
      reply,
      memories_used: memories?.length ?? 0,
      lara_triggered: laraTriggered,
      agents_triggered: agentsTriggered,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by ?? input.user_id,
      durationMs: Date.now() - startedAt,
      costUsd,
    });

    return output;
  },
});
