import { task, tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

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
});

// ── Ferramenta: DELI pode acionar a LARA ─────────────────────────────────────

const acionarLaraTool: Anthropic.Tool = {
  name: "acionar_lara",
  description: "Aciona a LARA para executar uma task de marketing em background. Use quando o usuário pedir pesquisa de loja, geração de conteúdo ou análise de tendências. O resultado chegará no chat em alguns minutos.",
  input_schema: {
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
- Acionar a LARA quando o usuário pedir pesquisa de loja, geração de conteúdo ou análise de tendências
- Dar respostas diretas, práticas e acionáveis — sem enrolação

## Agentes sob sua supervisão
- **LARA** — CRM & Marketing food service. Você pode acionar via ferramenta \`acionar_lara\`.

## Memórias e contexto do negócio
${memoriesBlock}

## Regras absolutas
- Responda SEMPRE em português brasileiro
- Você fala APENAS com a equipe interna (Wandson, Wélida, Eduardo) — NUNCA com clientes finais
- Quando acionar a LARA, avise o usuário que o resultado chegará em alguns minutos no chat
- Use emojis moderadamente para clareza visual (🟢🟡🔴✅⚠️🚨)
- Se não souber algo com certeza, diga explicitamente — nunca invente dados
- Respostas longas: use markdown (cabeçalhos, bullets, negrito) para organização`;

    // 5. Construir histórico para o Claude
    const client = new Anthropic();

    // Formata mensagens do histórico — relatórios de agentes aparecem com prefixo
    const histMessages: Anthropic.MessageParam[] = historyChronological.map((h) => {
      const isAgentReport = h.metadata?.source_agent != null;
      const content = isAgentReport
        ? `[Relatório ${String(h.metadata.source_agent).toUpperCase()}] ${h.content}`
        : h.content;
      return { role: h.role as "user" | "assistant", content };
    });

    let messages: Anthropic.MessageParam[] = [
      ...histMessages,
      { role: "user", content: input.message },
    ];

    // 6. Loop agentico — suporte a tool_use da LARA
    let reply = "";
    let laraTriggered = false;
    const maxTurns = 3;

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: [acionarLaraTool],
        tool_choice: { type: "auto" },
      });

      if (response.stop_reason === "tool_use") {
        const toolBlock = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        if (toolBlock?.name === "acionar_lara") {
          const toolInput = toolBlock.input as {
            task: string;
            parametros: Record<string, unknown>;
            justificativa: string;
          };

          let toolResult = "";
          try {
            const handle = await tasks.trigger(`lara-${toolInput.task}`, {
              tenant_id: input.tenant_id,
              triggered_by: input.user_id,
              ...toolInput.parametros,
            });
            laraTriggered = true;
            toolResult = `LARA acionada com sucesso (run_id: ${handle.id}). O resultado chegará em alguns minutos no chat.`;
          } catch (err) {
            toolResult = `Erro ao acionar LARA: ${(err as Error).message}`;
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

      // Resposta final em texto
      reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
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
        })
        .catch(() => {});
    }

    // 9. Log de execução
    const output = OutputSchema.parse({
      ok: true,
      reply,
      memories_used: memories?.length ?? 0,
      lara_triggered: laraTriggered,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by ?? input.user_id,
      durationMs: Date.now() - startedAt,
    });

    return output;
  },
});
