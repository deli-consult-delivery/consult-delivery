import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { executeAgent } from "../../src/agents/shared/runtime";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id:       z.string().uuid(),
  task_id:         z.string().uuid(),
  conversation_id: z.string().uuid(),
  triggered_by:    z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:          z.boolean(),
  draft_id:    z.string().uuid().optional(),
  action_taken: z.enum(["sent", "pending_approval", "skipped"]),
  mode:        z.string(),
  loop_status: z.string(),
});

export const agentResponderConclusao = task({
  id: "agent-responder-conclusao",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    // 1. Carregar tarefa (deve estar em loop_state='done')
    const { data: tarefa, error: tarefaErr } = await sb
      .from("client_tasks")
      .select("id, title, description, target_system, loop_state, execution_result, conversation_id")
      .eq("id", input.task_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    if (tarefaErr || !tarefa) {
      throw new Error(`agent-responder-conclusao: tarefa não encontrada: ${tarefaErr?.message ?? input.task_id}`);
    }

    if (tarefa.loop_state !== "done") {
      logger.warn("agent-responder-conclusao: tarefa ainda não concluída", {
        task_id: input.task_id, loop_state: tarefa.loop_state,
      });
      return OutputSchema.parse({
        ok: false, action_taken: "skipped", mode: "n/a", loop_status: "task_pending",
      });
    }

    // 2. Resolver modo do tenant (COALESCE modo_override → modo_padrao → 'humano')
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
    const autonomyLevel = mode === "ia" ? "verde" : mode === "hibrido" ? "amarelo" : "vermelho";

    // 3. Carregar contexto da conversa
    const { data: conv } = await sb
      .from("conversations")
      .select("contact_name, phone_number, whatsapp_chat_id, instance_id")
      .eq("id", input.conversation_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    const executionResult = tarefa.execution_result as Record<string, unknown> | null;
    const resultadoTexto = executionResult
      ? JSON.stringify(executionResult, null, 2).slice(0, 1000)
      : "Tarefa concluída sem resultado detalhado.";

    // 4. Gerar resposta via LLM
    const agentResult = await executeAgent("breno", {
      task: "reply_after_execution",
      cliente: conv?.contact_name ?? "Cliente",
      titulo_tarefa: tarefa.title,
      sistema_alvo: tarefa.target_system ?? "nenhum",
      resultado_execucao: resultadoTexto,
      instrucoes: `Retorne APENAS JSON (sem markdown): {"resposta":"...","tom":"amigavel|informativo|empatico|urgente"}.

REGRAS:
- Máximo 3 linhas curtas. Tom humano, sem scripts corporativos.
- Informe o cliente sobre o resultado da consulta/ação de forma clara e direta.
- Se houve erro no sistema externo, seja honesto mas tranquilizador.
- NUNCA exponha dados técnicos brutos (JSON, IDs internos).`,
    }, { runId: ctx.run.id, tenantId: input.tenant_id });

    let respostaFinal: string;
    let tomFinal: string;
    try {
      const m = (agentResult.output as string).match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : (agentResult.output as string)) as { resposta: string; tom: string };
      respostaFinal = parsed.resposta;
      tomFinal = parsed.tom;
    } catch {
      respostaFinal = "Verificamos sua solicitação! ✅\n\nRetornamos com mais detalhes em breve.";
      tomFinal = "amigavel";
    }

    // 5. Criar draft
    const { data: draft, error: draftErr } = await sb
      .from("agent_drafts")
      .insert({
        tenant_id:     input.tenant_id,
        agent_name:    "breno",
        channel:       "whatsapp",
        subject:       `Resposta conclusão: ${tarefa.title}`,
        content:       respostaFinal,
        autonomy_level: autonomyLevel,
        status:        "pending",
        metadata:      { task_id: input.task_id, conversation_id: input.conversation_id, tom: tomFinal },
      })
      .select("id")
      .single();

    if (draftErr) {
      logger.warn("agent-responder-conclusao: falha ao criar draft", { error: draftErr.message });
    }

    const draftId = draft?.id;
    let actionTaken: "sent" | "pending_approval" = "pending_approval";
    let loopStatus = "task_pending";

    // 6. Modo ia → auto-enviar via Evolution
    if (mode === "ia" && conv?.whatsapp_chat_id && conv?.instance_id) {
      const { data: inst } = await sb
        .from("evolution_instances")
        .select("evolution_url, api_key, instance_name")
        .eq("id", conv.instance_id)
        .maybeSingle();

      if (inst) {
        try {
          const sendRes = await fetch(
            `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: inst.api_key },
              body: JSON.stringify({ number: conv.whatsapp_chat_id, text: respostaFinal }),
              signal: AbortSignal.timeout(10_000),
            }
          );

          if (sendRes.ok) {
            if (draftId) {
              await sb.from("agent_drafts")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", draftId);
            }
            actionTaken = "sent";
            loopStatus = "replied";

            await sb.from("messages").insert({
              tenant_id:       input.tenant_id,
              conversation_id: input.conversation_id,
              direction:       "outbound",
              sender_name:     "BRENO",
              content:         respostaFinal,
              created_at:      new Date().toISOString(),
            });
          } else {
            logger.warn("agent-responder-conclusao: falha ao enviar via Evolution", {
              status: sendRes.status, conversation_id: input.conversation_id,
            });
          }
        } catch (err) {
          logger.warn("agent-responder-conclusao: erro Evolution", { error: (err as Error).message });
        }
      }
    } else if (mode !== "ia") {
      // hibrido ou humano → draft pendente, aguarda aprovação
      loopStatus = "task_pending";
    }

    // 7. Atualizar loop_status na conversa
    await sb.from("conversations")
      .update({ loop_status: loopStatus })
      .eq("id", input.conversation_id)
      .eq("tenant_id", input.tenant_id);

    await logAgentRun({
      runId: ctx.run.id, agentSlug: "agent-responder-conclusao",
      input:  { task_id: input.task_id, conversation_id: input.conversation_id },
      output: { ok: true, action_taken: actionTaken, draft_id: draftId, mode, loop_status: loopStatus },
      tenantId: input.tenant_id, triggeredBy: input.triggered_by,
      durationMs: Date.now() - start, status: "success",
    });

    return OutputSchema.parse({
      ok: true, draft_id: draftId, action_taken: actionTaken, mode, loop_status: loopStatus,
    });
  },
});
