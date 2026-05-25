import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { executeAgent } from "../../src/agents/shared/runtime";

const InputSchema = z.object({
  sender_jid: z.string(),
  group_jid: z.string(),
  message: z.string(),
  tenant_id: z.string().uuid(),
  run_id: z.string().optional(),
});

const OutputSchema = z.object({
  action: z.enum(["draft_created", "ignored"]),
  draft_id: z.string().uuid().optional(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export const deliChatHandler = task({
  id: "deli-chat-handler",
  retry: { maxAttempts: 3 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    const input = InputSchema.parse(payload);

    // 1. Filtrar: só mensagens com @deli ou @DELI
    if (!/[@＠][Dd][Ee][Ll][Ii]\b/.test(input.message)) {
      logger.info("deli-chat-handler: mensagem sem @deli, ignorando", {
        sender: input.sender_jid,
      });
      return OutputSchema.parse({ action: "ignored" });
    }

    logger.info("deli-chat-handler: @deli detectado, processando", {
      tenant_id: input.tenant_id,
      sender: input.sender_jid,
    });

    // 2. executeAgent via runtime
    const result = await executeAgent(
      "deli",
      { message: input.message, sender_jid: input.sender_jid, group_jid: input.group_jid },
      { runId: ctx.run.id, tenantId: input.tenant_id }
    );

    // 3. Criar draft em agent_drafts (channel='whatsapp_grupo') — NUNCA enviar direto
    const { data: draft, error } = await getSupabase()
      .from("agent_drafts")
      .insert({
        tenant_id: input.tenant_id,
        agent_name: "deli",
        channel: "whatsapp_grupo",
        target_id: input.group_jid,
        content: String(result.output),
        status: "pending",
        metadata: {
          sender_jid: input.sender_jid,
          original_message: input.message,
          run_id: ctx.run.id,
          tokens: result.tokens,
        },
      })
      .select("id")
      .single();

    if (error) {
      logger.error("deli-chat-handler: falha ao criar draft", { error: error.message });
      throw new Error(`[deli-chat-handler] draft insert falhou: ${error.message}`);
    }

    // 4. logAgentRun
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "deli",
      tenantId: input.tenant_id,
      input,
      output: { draft_id: draft.id, tokens: result.tokens },
      status: "success",
    });

    logger.info("deli-chat-handler: draft criado", { draft_id: draft.id });

    return OutputSchema.parse({ action: "draft_created", draft_id: draft.id });
  },
});
