import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { executeAgent, getClientContext, recordFact, logTimeline } from "../../src/agents/shared/runtime";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { createLoopTask } from "../_shared/loop-tasks";
import { agentExecutarTarefa } from "../agents/executar-tarefa";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid(),
  message: z.string().min(1),
  sender_name: z.string().optional(),
  context_messages: z.array(z.object({
    role: z.enum(["client", "team"]),
    content: z.string(),
  })).default([]),
  triggered_by: z.string().uuid().optional(),
});

const TarefaSchema = z.object({
  titulo: z.string(),
  descricao: z.string(),
  prioridade: z.enum(["urgent", "high", "normal", "low"]),
  sistema_alvo: z.enum(["vendaerp", "asaas", "nenhum"]),
  operacao: z.string().nullable().optional(),
  parametros: z.record(z.unknown()).nullable().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  resposta: z.string(),
  tom: z.string(),
  draft_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  precisa_humano: z.boolean(),
  motivo_humano: z.string().optional(),
  action_taken: z.enum(["sent", "suggested", "skipped", "task_created"]),
  mode: z.string(),
});

export const brenoResponder = task({
  id: "breno-responder",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    const { data: configRow } = await sb
      .from("tenant_agent_config")
      .select("modo_override")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "breno")
      .maybeSingle();

    const { data: tenantRow } = await sb
      .from("tenants")
      .select("modo_padrao")
      .eq("id", input.tenant_id)
      .maybeSingle();

    const mode = configRow?.modo_override ?? tenantRow?.modo_padrao ?? "humano";

    if (mode === "humano") {
      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "breno-responder",
        input: { conversation_id: input.conversation_id, message_id: input.message_id },
        output: { action_taken: "skipped", mode },
        tenantId: input.tenant_id,
        triggeredBy: input.triggered_by,
        durationMs: Date.now() - start,
        status: "success",
        explanation: "Modo humano ativo: agente não interferiu nesta conversa.",
        confidenceScore: 1.0,
        pipelineStage: "triagem",
      });

      await sb.from("breno_interactions").insert({
        tenant_id: input.tenant_id,
        conversation_id: input.conversation_id,
        inbound_message_id: input.message_id,
        outbound_message_id: null,
        mode,
        breno_response: "",
        action_taken: "skipped",
        agent_run_id: null,
        requires_review: false,
      });

      return OutputSchema.parse({
        ok: true,
        resposta: "",
        tom: "",
        precisa_humano: false,
        action_taken: "skipped",
        mode,
      });
    }

    const { data: conv } = await sb
      .from("conversations")
      .select("id, contact_name, customer_id, whatsapp_chat_id, instance_id")
      .eq("id", input.conversation_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    // Memória Central — resolver loja via customer_id e carregar contexto
    let lojaId: string | null = null;
    if (conv?.customer_id) {
      const { data: lojaRow } = await sb
        .from("lojas")
        .select("id")
        .eq("client_id", conv.customer_id)
        .eq("tenant_id", input.tenant_id)
        .maybeSingle();
      lojaId = lojaRow?.id ?? null;
    }
    const clientCtx = lojaId
      ? await getClientContext(lojaId, input.tenant_id)
      : { facts: [], timeline: [] };

    const ctxMessages = input.context_messages.slice(-10)
      .map(m => `${m.role === "client" ? "Cliente" : "Equipe"}: ${m.content}`)
      .join("\n");

    const contextoLoja = clientCtx.facts.length > 0
      ? clientCtx.facts.map(f => `${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join("; ")
      : null;

    const agentResult = await executeAgent('breno', {
      task: 'respond_or_classify',
      cliente: conv?.contact_name || input.sender_name || "Cliente",
      mensagem: input.message,
      historico: ctxMessages || "",
      contexto_loja: contextoLoja,
      instrucoes: `Retorne APENAS JSON (sem markdown):
{
  "acao": "resolver" | "criar_tarefa",
  "resposta": "...",
  "tom": "amigavel|informativo|empatico|urgente",
  "precisa_humano": false,
  "motivo_humano": null,
  "tarefa": null
}

Quando acao="criar_tarefa", preencha tarefa:
{
  "tarefa": {
    "titulo": "...",
    "descricao": "...",
    "prioridade": "urgent|high|normal|low",
    "sistema_alvo": "vendaerp|asaas|nenhum",
    "operacao": null,
    "parametros": null
  }
}

REGRAS:
- resolver: problema simples, resposta imediata em até 3 linhas curtas.
- criar_tarefa: demanda que exige consulta a sistema externo (ERP, financeiro) ou ação complexa.
- Tom humano, sem scripts corporativos. Máximo 3 linhas na resposta.
- Se problema sério (cobrança errada, acidente, produto estragado): precisa_humano:true.
- NUNCA prometa o que não pode cumprir.`,
    }, { runId: ctx.run.id, tenantId: input.tenant_id });
    const rawText = agentResult.output as string;

    let parsed: {
      acao: "resolver" | "criar_tarefa";
      resposta: string;
      tom: string;
      precisa_humano: boolean;
      motivo_humano?: string | null;
      tarefa?: {
        titulo: string;
        descricao: string;
        prioridade: "urgent" | "high" | "normal" | "low";
        sistema_alvo: "vendaerp" | "asaas" | "nenhum";
        operacao?: string | null;
        parametros?: Record<string, unknown> | null;
      } | null;
    };
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
      if (!parsed.acao) parsed.acao = "resolver";
    } catch {
      parsed = {
        acao: "resolver",
        resposta: "Oi! Recebemos sua mensagem. ✅\n\nRetornamos em instantes!",
        tom: "amigavel",
        precisa_humano: true,
        motivo_humano: "Erro no processamento automático",
      };
    }

    // Branch criar_tarefa — abre client_task e encerra sem draft
    if (parsed.acao === "criar_tarefa" && parsed.tarefa && conv?.customer_id) {
      let taskId: string | undefined;
      try {
        const tarefaData = TarefaSchema.parse(parsed.tarefa);
        const result = await createLoopTask({
          tenantId:      input.tenant_id,
          conversationId: input.conversation_id,
          customerId:    conv.customer_id,
          agentId:       "breno",
          titulo:        tarefaData.titulo,
          descricao:     tarefaData.descricao,
          prioridade:    tarefaData.prioridade,
          sistemaAlvo:   tarefaData.sistema_alvo,
          operacao:      tarefaData.operacao ?? null,
          parametros:    tarefaData.parametros ?? null,
        });
        taskId = result.taskId;
        logger.info("breno-responder: tarefa loop criada", { taskId, conversation_id: input.conversation_id });

        // Disparar execução imediatamente — elo que fecha o loop
        await agentExecutarTarefa.trigger({
          tenant_id:    input.tenant_id,
          task_id:      taskId,
          triggered_by: ctx.run.id,
        });
        logger.info("breno-responder: agent-executar-tarefa disparado", { taskId });
      } catch (err) {
        logger.warn("breno-responder: falha ao criar loop task", { error: (err as Error).message });
      }

      await sb.from("breno_interactions").insert({
        tenant_id: input.tenant_id,
        conversation_id: input.conversation_id,
        inbound_message_id: input.message_id,
        outbound_message_id: null,
        mode,
        breno_response: parsed.resposta || "",
        action_taken: "task_created",
        agent_run_id: null,
        requires_review: false,
      });

      if (lojaId) {
        await logTimeline(lojaId, input.tenant_id, "breno", "loop_task_created",
          `Tarefa de loop criada: ${parsed.tarefa.titulo}`,
          { payload: { conversation_id: input.conversation_id, task_id: taskId, run_id: ctx.run.id } }
        );
      }

      await logAgentRun({
        runId: ctx.run.id, agentSlug: "breno-responder",
        input: { conversation_id: input.conversation_id, message_id: input.message_id },
        output: { ok: true, action_taken: "task_created", task_id: taskId, mode },
        tenantId: input.tenant_id, triggeredBy: input.triggered_by,
        durationMs: Date.now() - start, status: "success",
        explanation: `Demanda requer acesso a sistema externo — tarefa criada: "${parsed.tarefa?.titulo}". Cliente: ${conv?.contact_name || input.sender_name || "desconhecido"}.`,
        confidenceScore: 0.85,
        pipelineStage: "criacao_tarefa",
      });

      return OutputSchema.parse({
        ok: true, resposta: parsed.resposta || "", tom: parsed.tom || "amigavel",
        task_id: taskId, precisa_humano: false, action_taken: "task_created", mode,
      });
    }

    const action_taken: "sent" | "suggested" = mode === "ia" ? "sent" : "suggested";

    let draft_id: string | undefined;
    if (mode === "hibrido") {
      // autonomy_level tem CHECK constraint (verde|amarelo|vermelho).
      // Draft que aguarda aprovação humana = amarelo (agente propõe, humano aprova).
      // "hibrido" violava a constraint e o insert falhava em silêncio → nenhum draft criado.
      const { data: draft, error: draftErr } = await sb.from("agent_drafts").insert({
        tenant_id: input.tenant_id,
        agent_name: "breno",
        channel: "whatsapp",
        subject: `Resposta sugerida para conversa ${input.conversation_id}`,
        content: parsed.resposta,
        autonomy_level: "amarelo",
        status: "pending",
        target_id: conv?.whatsapp_chat_id ?? null,
        metadata: {
          conversation_id: input.conversation_id,
          whatsapp_chat_id: conv?.whatsapp_chat_id ?? null,
          instance_id: conv?.instance_id ?? null,
        },
      }).select("id").single();
      if (draftErr) {
        logger.error("breno-responder: falha ao criar draft", {
          error: draftErr.message,
          conversation_id: input.conversation_id,
        });
      }
      draft_id = draft?.id;
    }

    let outboundMessageId: string | null = null;

    if (mode === "ia") {
      const { data: convRow } = await sb
        .from("conversations")
        .select("whatsapp_chat_id, instance_id")
        .eq("id", input.conversation_id)
        .maybeSingle();

      if (convRow?.whatsapp_chat_id && convRow?.instance_id) {
        const { data: inst } = await sb
          .from("evolution_instances")
          .select("evolution_url, api_key, instance_name")
          .eq("id", convRow.instance_id)
          .maybeSingle();

        if (inst) {
          try {
            const sendRes = await fetch(
              `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: inst.api_key },
                body: JSON.stringify({ number: convRow.whatsapp_chat_id, text: parsed.resposta }),
                signal: AbortSignal.timeout(10_000),
              }
            );

            if (sendRes.ok) {
              const sendData = await sendRes.json();
              outboundMessageId = sendData?.key?.id ?? null;

              await sb.from("messages").insert({
                tenant_id:       input.tenant_id,
                conversation_id: input.conversation_id,
                direction:       "outbound",
                sender_name:     "BRENO",
                content:         parsed.resposta,
                whatsapp_msg_id: outboundMessageId,
                created_at:      new Date().toISOString(),
              });

              await sb.from("conversations")
                .update({ last_breno_handled_at: new Date().toISOString() })
                .eq("id", input.conversation_id);
            } else {
              logger.warn("breno-responder: falha ao enviar via Evolution", {
                status: sendRes.status,
                conversation_id: input.conversation_id,
              });
            }
          } catch (err) {
            logger.warn("breno-responder: erro ao chamar Evolution API", {
              error: (err as Error).message,
              conversation_id: input.conversation_id,
            });
          }
        }
      }
    }

    await sb.from("breno_interactions").insert({
      tenant_id: input.tenant_id,
      conversation_id: input.conversation_id,
      inbound_message_id: input.message_id,
      outbound_message_id: outboundMessageId,
      mode,
      breno_response: parsed.resposta,
      action_taken,
      agent_run_id: null,
      requires_review: mode === "hibrido",
    });

    // Memória Central — registrar interação na timeline da loja
    if (lojaId) {
      await Promise.all([
        recordFact(
          lojaId,
          input.tenant_id,
          "support_pattern",
          `precisa_humano_${new Date().toISOString().slice(0, 7)}`,
          { precisa_humano: parsed.precisa_humano, motivo: parsed.motivo_humano ?? null },
          { sourceAgent: "breno", confidence: 0.6 }
        ),
        logTimeline(
          lojaId,
          input.tenant_id,
          "breno",
          "support_message_handled",
          `Mensagem respondida via WhatsApp (${action_taken})`,
          { description: parsed.precisa_humano ? `Escalado: ${parsed.motivo_humano}` : undefined, payload: { conversation_id: input.conversation_id, mode, run_id: ctx.run.id } }
        ),
      ]);
    }

    const brenoScore = parsed.precisa_humano ? 0.55 : action_taken === "sent" ? 0.90 : 0.78;
    const brenoExpl = parsed.precisa_humano
      ? `Escalado para humano: ${parsed.motivo_humano || "problema complexo identificado"}. Tom: ${parsed.tom}.`
      : `Respondido automaticamente (${action_taken}). Cliente: ${conv?.contact_name || input.sender_name || "desconhecido"}. Tom: ${parsed.tom}.`;

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-responder",
      input: { conversation_id: input.conversation_id, message_id: input.message_id },
      output: { ok: true, action_taken, mode },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
      status: "success",
      explanation: brenoExpl,
      confidenceScore: brenoScore,
      pipelineStage: "resposta",
    });

    return OutputSchema.parse({
      ok: true,
      resposta: parsed.resposta,
      tom: parsed.tom,
      draft_id,
      precisa_humano: parsed.precisa_humano,
      motivo_humano: parsed.motivo_humano ?? undefined,
      action_taken,
      mode,
    });
  },
});
