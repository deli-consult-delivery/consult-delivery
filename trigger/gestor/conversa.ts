import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { getPrompt } from "../../src/agents/shared/runtime";
import { getClientContext } from "../../src/agents/shared/runtime";
import { chatWithTools, ollamaWebSearch, ollamaWebFetch, type ToolDef, type OAIMessage } from "../_shared/llm-tools";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  loja_id: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  reply: z.string(),
});

// ── Ferramentas ───────────────────────────────────────────────────────────────

const proporDraftTool: ToolDef = {
  type: "function",
  function: {
    name: "propor_draft",
    description: "Cria uma PROPOSTA (draft pendente) de mensagem/ação para o Wandson aprovar. NUNCA envia nada — só propõe. Use quando quiser sugerir uma resposta a cliente, contestação ou ação concreta sobre uma loja.",
    parameters: {
      type: "object",
      properties: {
        loja_id: { type: "string", description: "UUID da loja relacionada à proposta" },
        channel: { type: "string", description: "Canal da proposta (ex.: painel, whatsapp_pv, whatsapp_group)" },
        content: { type: "string", description: "Conteúdo/corpo da proposta" },
        reasoning: { type: "string", description: "Por que você está propondo isto" },
      },
      required: ["loja_id", "channel", "content", "reasoning"],
    },
  },
};

const consultarMetricasTool: ToolDef = {
  type: "function",
  function: {
    name: "consultar_metricas",
    description: "Consulta as métricas diárias (loja_metricas) de uma loja nos últimos N dias — faturamento, pedidos, avaliação, cancelamentos.",
    parameters: {
      type: "object",
      properties: {
        loja_id: { type: "string", description: "UUID da loja" },
        dias: { type: "number", description: "Quantos dias olhar para trás (default 14)" },
      },
      required: ["loja_id"],
    },
  },
};

const pesquisarWebTool: ToolDef = {
  type: "function",
  function: {
    name: "pesquisar_web",
    description: "Pesquisa na web informações atualizadas (concorrência, tendências de delivery, práticas de iFood). Use quando precisar de dados externos que não estão no banco. Devolve os títulos/URLs/trechos dos resultados.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "O que pesquisar" },
      },
      required: ["query"],
    },
  },
};

const abrirPaginaTool: ToolDef = {
  type: "function",
  function: {
    name: "abrir_pagina",
    description: "Abre uma URL específica (ex.: um resultado de pesquisar_web) e devolve o conteúdo da página. Use quando um resumo curto não for suficiente.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL completa da página a abrir" },
      },
      required: ["url"],
    },
  },
};

const salvarConhecimentoTool: ToolDef = {
  type: "function",
  function: {
    name: "salvar_conhecimento",
    description: "Salva um aprendizado ou boa prática na base de conhecimento do GESTOR, para reutilizar em conversas futuras.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto do conhecimento" },
        conteudo: { type: "string", description: "Conteúdo completo" },
        tags: { type: "array", items: { type: "string" }, description: "Tags para busca futura" },
      },
      required: ["titulo", "conteudo"],
    },
  },
};

const allTools = [proporDraftTool, consultarMetricasTool, pesquisarWebTool, abrirPaginaTool, salvarConhecimentoTool];

// ── Task ──────────────────────────────────────────────────────────────────────

export const gestorConversa = task({
  id: "gestor-conversa",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Prompt base do agente
    const systemPromptBase = await getPrompt("gestor", input.tenant_id);

    // 2. Contexto da loja (se selecionada) + últimos 14 dias de loja_metricas + knowledge base
    let contextoLoja = "";
    if (input.loja_id) {
      const clientContext = await getClientContext(input.loja_id, input.tenant_id);

      const desde = new Date();
      desde.setDate(desde.getDate() - 14);
      const { data: metricas } = await sb
        .from("loja_metricas")
        .select("data, faturamento, pedidos, ticket_medio, avaliacao, cancelamentos")
        .eq("loja_id", input.loja_id)
        .gte("data", desde.toISOString().slice(0, 10))
        .order("data", { ascending: false });

      const { data: knowledge } = await sb
        .from("agent_knowledge_base")
        .select("title, content, tags")
        .eq("agent_slug", "gestor")
        .eq("tenant_id", input.tenant_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      const factsBlock = clientContext.facts.length
        ? clientContext.facts.map((f) => `[${f.category}] ${f.key}: ${JSON.stringify(f.value)}`).join("\n")
        : "(sem fatos registrados)";
      const metricasBlock = metricas?.length
        ? metricas.map((m) => `${m.data}: faturamento=${m.faturamento ?? "?"} pedidos=${m.pedidos ?? "?"} avaliacao=${m.avaliacao ?? "?"} cancelamentos=${m.cancelamentos ?? "?"}`).join("\n")
        : "(sem métricas nos últimos 14 dias)";
      const knowledgeBlock = knowledge?.length
        ? knowledge.map((k) => `[${k.title}] ${k.content}`).join("\n")
        : "(sem itens na base de conhecimento)";

      contextoLoja = `\n\n## Contexto da loja selecionada (${input.loja_id})\n### Fatos conhecidos\n${factsBlock}\n\n### Métricas — últimos 14 dias\n${metricasBlock}\n\n### Base de conhecimento do GESTOR\n${knowledgeBlock}`;
    }

    const systemPrompt = `${systemPromptBase}${contextoLoja}\n\n## Regras absolutas\n- Responda SEMPRE em português brasileiro\n- Nunca envie nada a cliente — toda ação vira draft pendente via \`propor_draft\`\n- Use \`consultar_metricas\` para números reais antes de dar diagnóstico\n- Use \`salvar_conhecimento\` quando aprender algo reutilizável sobre a loja ou o mercado`;

    // 3. Histórico recente (mesma loja selecionada, ou sem loja quando loja_id null)
    let historyQuery = sb
      .from("agent_chat_messages")
      .select("role, content")
      .eq("agent_id", "gestor")
      .eq("tenant_id", input.tenant_id)
      .order("created_at", { ascending: false })
      .limit(25);
    historyQuery = input.loja_id
      ? historyQuery.eq("loja_id", input.loja_id)
      : historyQuery.is("loja_id", null);
    const { data: history } = await historyQuery;
    const historyChronological = (history ?? []).reverse();

    let messages: OAIMessage[] = [
      ...historyChronological.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: input.message },
    ];

    // 4. Loop agentico
    let reply = "";
    const maxTurns = 5;
    // null até o 1º turno com custo calculável — nunca soma 0 fake quando todos
    // os turnos caem no Ollama (sem custo por token, ver llm-tools.ts).
    let costUsd: number | null = null;

    for (let turn = 0; turn < maxTurns; turn++) {
      const { message, cost_usd } = await chatWithTools({
        system: systemPrompt,
        messages,
        tools: allTools,
        maxTokens: 1536,
      });
      if (cost_usd != null) costUsd = (costUsd ?? 0) + cost_usd;

      if (message.tool_calls?.length) {
        const toolCall = message.tool_calls[0];
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        let toolResult = "";

        if (toolCall.function.name === "propor_draft") {
          const toolInput = toolArgs as {
            loja_id: string;
            channel: string;
            content: string;
            reasoning: string;
          };
          try {
            const { data: created, error } = await sb
              .from("agent_drafts")
              .insert({
                tenant_id: input.tenant_id,
                agent_name: "gestor",
                origin: "gestor-conversa",
                channel: toolInput.channel,
                content: toolInput.content,
                reasoning: toolInput.reasoning,
                loja_id: toolInput.loja_id,
                status: "pending",
                autonomy_level: "amarelo",
                metadata: { proposto_por: "gestor-conversa" },
              })
              .select("id")
              .single();
            if (error) throw error;
            toolResult = `Draft pendente criado id=${created.id}. Aguarda aprovação do Wandson no painel.`;
          } catch (err) {
            toolResult = `Erro ao criar draft: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "consultar_metricas") {
          const toolInput = toolArgs as { loja_id: string; dias?: number };
          try {
            const desde = new Date();
            desde.setDate(desde.getDate() - (toolInput.dias ?? 14));
            const { data, error } = await sb
              .from("loja_metricas")
              .select("data, faturamento, pedidos, ticket_medio, avaliacao, cancelamentos")
              .eq("loja_id", toolInput.loja_id)
              .gte("data", desde.toISOString().slice(0, 10))
              .order("data", { ascending: false });
            if (error) throw error;
            toolResult = JSON.stringify(data ?? [], null, 2);
          } catch (err) {
            toolResult = `Erro ao consultar métricas: ${(err as Error).message}`;
          }
        } else if (toolCall.function.name === "pesquisar_web") {
          const toolInput = toolArgs as { query: string };
          try {
            const resultados = await ollamaWebSearch(toolInput.query);
            toolResult = resultados.length
              ? resultados
                  .map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`)
                  .join("\n\n")
              : "Nenhum resultado encontrado.";
          } catch (err) {
            console.warn(`[gestor-conversa] pesquisar_web falhou: ${(err as Error).message}`);
            toolResult = JSON.stringify({ erro: "pesquisa indisponível" });
          }
        } else if (toolCall.function.name === "abrir_pagina") {
          const toolInput = toolArgs as { url: string };
          try {
            const pagina = await ollamaWebFetch(toolInput.url);
            toolResult = `${pagina.title}\n\n${pagina.content}`;
          } catch (err) {
            console.warn(`[gestor-conversa] abrir_pagina falhou: ${(err as Error).message}`);
            toolResult = JSON.stringify({ erro: "pesquisa indisponível" });
          }
        } else if (toolCall.function.name === "salvar_conhecimento") {
          const toolInput = toolArgs as { titulo: string; conteudo: string; tags?: string[] };
          try {
            const { error } = await sb.from("agent_knowledge_base").insert({
              tenant_id: input.tenant_id,
              agent_slug: "gestor",
              title: toolInput.titulo,
              content: toolInput.conteudo,
              tags: toolInput.tags ?? [],
              source: "gestor-conversa",
              is_active: true,
              created_by: input.user_id,
            });
            if (error) throw error;
            toolResult = "Conhecimento salvo com sucesso.";
          } catch (err) {
            toolResult = `Erro ao salvar conhecimento: ${(err as Error).message}`;
          }
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

      reply = message.content ?? "";
      break;
    }

    if (!reply) reply = "Desculpa, não consegui gerar uma resposta. Tente novamente.";

    // 5. Salvar user + assistant no histórico
    await sb.from("agent_chat_messages").insert([
      {
        tenant_id: input.tenant_id,
        agent_id: "gestor",
        user_id: input.user_id,
        loja_id: input.loja_id ?? null,
        role: "user",
        content: input.message,
      },
      {
        tenant_id: input.tenant_id,
        agent_id: "gestor",
        user_id: null,
        loja_id: input.loja_id ?? null,
        role: "assistant",
        content: reply,
      },
    ]);

    // 6. Log de execução
    const output = OutputSchema.parse({ ok: true, reply });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "gestor",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.user_id,
      durationMs: Date.now() - startedAt,
      costUsd,
    });

    return output;
  },
});
