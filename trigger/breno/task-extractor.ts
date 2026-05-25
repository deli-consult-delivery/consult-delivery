import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { executeAgent } from "../../src/agents/shared/runtime";

export const brenoTaskExtractor = schedules.task({
  id: "breno-task-extractor",
  cron: "*/30 * * * *",
  retry: { maxAttempts: 3, minTimeoutInMs: 30_000, maxTimeoutInMs: 90_000 },

  run: async (_payload, { ctx }) => {
    logger.info("breno-task-extractor: início");
    const sb = getSupabase();
    const start = Date.now();
    const since30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // 1. Buscar mensagens inbound das últimas 30 min — filtrar bots (anti-padrão G02)
    let recentMessages: {
      conversation_id: string;
      content: string;
      sender_name: string | null;
      tenant_id: string;
    }[] = [];

    try {
      const { data } = await sb
        .from("messages")
        .select("conversation_id, content, sender_name, tenant_id")
        .gte("created_at", since30min)
        .eq("direction", "inbound")
        .not("sender_name", "ilike", "%bot%")
        .not("sender_name", "ilike", "%breno%")
        .not("sender_name", "ilike", "%deli%")
        .order("created_at", { ascending: false })
        .limit(100);
      recentMessages = (data ?? []) as typeof recentMessages;
    } catch (err) {
      logger.warn("breno-task-extractor: erro ao buscar messages", {
        error: (err as Error).message,
      });
    }

    if (recentMessages.length === 0) {
      logger.info("breno-task-extractor: sem mensagens novas, encerrando");
      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "breno-task-extractor",
        input: { since: since30min },
        output: { tarefas_extraidas: 0 },
        status: "success",
        durationMs: Date.now() - start,
      });
      return { tarefas_extraidas: 0 };
    }

    // 2. Agrupar mensagens por conversa
    const byConversation = new Map<string, typeof recentMessages>();
    for (const msg of recentMessages) {
      const msgs = byConversation.get(msg.conversation_id) ?? [];
      msgs.push(msg);
      byConversation.set(msg.conversation_id, msgs);
    }

    logger.info("breno-task-extractor: conversas a processar", {
      total: byConversation.size,
    });

    const allExtracted: unknown[] = [];

    // 3. Para cada conversa: extrair tarefas via runtime.executeAgent
    for (const [conversationId, msgs] of byConversation) {
      const tenantId = msgs[0].tenant_id;
      try {
        const result = await executeAgent("breno", {
          task: "extract_tasks",
          conversation_id: conversationId,
          mensagens: msgs.map((m) => ({
            sender: m.sender_name ?? "Cliente",
            conteudo: m.content,
          })),
          instrucoes:
            'Analise as mensagens e retorne APENAS JSON com array de tarefas: [{"titulo":"...","descricao":"...","prioridade":"alta|media|baixa"}]. Se não houver tarefas, retorne [].',
        }, { runId: ctx.run.id, tenantId });

        const rawOutput = String(result.output).trim();
        try {
          const arrMatch = rawOutput.match(/\[[\s\S]*\]/);
          const parsed = JSON.parse(arrMatch ? arrMatch[0] : "[]");
          const tarefas = Array.isArray(parsed) ? parsed : [];

          // 4. INSERT em tarefas_loja requer loja_id (não disponível via conversation_id diretamente)
          // Registramos no output do agent_run conforme spec "ou log em agent_runs"
          allExtracted.push(
            ...tarefas.map((t: unknown) => ({ ...(t as object), conversation_id: conversationId }))
          );
        } catch {
          logger.warn("breno-task-extractor: parse JSON falhou", {
            conversation_id: conversationId,
          });
        }
      } catch (err) {
        logger.warn("breno-task-extractor: executeAgent falhou para conversa", {
          conversation_id: conversationId,
          error: (err as Error).message,
        });
      }
    }

    const tarefasExtraidas = allExtracted.length;
    logger.info("breno-task-extractor: concluído", { tarefas_extraidas: tarefasExtraidas });

    // 5. logAgentRun com tarefas_extraidas
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-task-extractor",
      input: { since: since30min, conversas: byConversation.size },
      output: { tarefas_extraidas: tarefasExtraidas, tarefas: allExtracted },
      status: "success",
      durationMs: Date.now() - start,
    });

    return { tarefas_extraidas: tarefasExtraidas };
  },
});
