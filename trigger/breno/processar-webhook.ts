import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";
import { brenoResponder } from "./responder";

// OBRIGATÓRIO: Schema de entrada
const InputSchema = z.object({
  tenant_id:       z.string().uuid(),
  instance_name:   z.string(),
  sender_jid:      z.string(), // ex: "5511999990000@s.whatsapp.net"
  message_body:    z.string(),
  message_id:      z.string().optional(),
  conversation_id: z.string().uuid().optional(), // id na tabela conversations
  triggered_by:    z.string().uuid().optional(),
});

// OBRIGATÓRIO: Schema de saída
const OutputSchema = z.object({
  ok:     z.boolean(),
  action: z.enum(["ignored", "draft_created", "auto_replied", "human_mode"]),
  reason: z.string(),
  run_id: z.string().optional(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export const brenoProcessarWebhook = task({
  id: "breno-processar-webhook",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },
  run: async (payload: unknown, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);
    const start = Date.now();

    logger.info("breno-processar-webhook: início", {
      tenant_id:    input.tenant_id,
      sender_jid:   input.sender_jid,
      instance_name: input.instance_name,
    });

    // 1. Ignorar mensagens enviadas pelo próprio bot (fromMe)
    // A Evolution API indica mensagens próprias com JID terminando em ":0@" ou
    // com prefixo idêntico ao da instance. Convenção usada: o campo sender_jid
    // chega vazio ou igual ao número da própria instância quando fromMe === true.
    // Quem chama esta task deve filtrar no webhook handler; mas fazemos
    // uma segunda verificação aqui para segurança.
    if (!input.sender_jid || input.sender_jid.trim() === "") {
      logger.info("breno-processar-webhook: ignorado — sender_jid vazio (fromMe)", {
        tenant_id: input.tenant_id,
      });

      const result: Output = OutputSchema.parse({
        ok:     true,
        action: "ignored",
        reason: "sender_jid vazio indica mensagem própria (fromMe)",
      });

      await logAgentRun({
        runId:      ctx.run.id,
        agentSlug:  "breno",
        tenantId:   input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:     result,
        durationMs: Date.now() - start,
        status:     "success",
      });

      return result;
    }

    // 2. Ignorar grupos — BRENO só responde PVs (@s.whatsapp.net)
    if (input.sender_jid.endsWith("@g.us")) {
      logger.info("breno-processar-webhook: ignorado — mensagem de grupo", {
        tenant_id:  input.tenant_id,
        sender_jid: input.sender_jid,
      });

      const result: Output = OutputSchema.parse({
        ok:     true,
        action: "ignored",
        reason: "Mensagens de grupo ignoradas — BRENO só atende PVs",
      });

      await logAgentRun({
        runId:      ctx.run.id,
        agentSlug:  "breno",
        tenantId:   input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:     result,
        durationMs: Date.now() - start,
        status:     "success",
      });

      return result;
    }

    // 3. Verificar modo BRENO no tenant_agent_config
    const sb = getSupabase();

    logger.info("breno-processar-webhook: consultando modo do agente", {
      tenant_id: input.tenant_id,
    });

    const { data: config } = await sb
      .from("tenant_agent_config")
      .select("modo_override")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_slug", "breno")
      .maybeSingle();

    const modo: string = config?.modo_override ?? "hibrido"; // default hibrido

    logger.info("breno-processar-webhook: modo resolvido", {
      tenant_id:      input.tenant_id,
      modo,
      from_override:  config?.modo_override != null,
    });

    // 4a. Modo "humano" — só registra, não age
    if (modo === "humano") {
      const result: Output = OutputSchema.parse({
        ok:     true,
        action: "human_mode",
        reason: "Tenant em modo humano — BRENO não age automaticamente",
      });

      await logAgentRun({
        runId:      ctx.run.id,
        agentSlug:  "breno",
        tenantId:   input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:     result,
        durationMs: Date.now() - start,
        status:     "success",
      });

      return result;
    }

    // Garantir que conversation_id existe antes de chamar breno-responder
    // (ambos os modos restantes precisam dele)
    if (!input.conversation_id) {
      logger.warn("breno-processar-webhook: conversation_id ausente para modo não-humano", {
        tenant_id: input.tenant_id,
        modo,
        sender_jid: input.sender_jid,
      });

      const result: Output = OutputSchema.parse({
        ok:     false,
        action: "ignored",
        reason: "conversation_id obrigatório para modos hibrido e ia",
      });

      await logAgentRun({
        runId:      ctx.run.id,
        agentSlug:  "breno",
        tenantId:   input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:     result,
        durationMs: Date.now() - start,
        status:     "failed",
      });

      return result;
    }

    // 4b. Modos "hibrido" e "ia" — chamar breno-responder em background
    // Precisamos de um message_id para o responder; geramos um UUID determinístico
    // baseado no message_id do webhook quando disponível ou usamos o run.id.
    const messageIdForResponder = input.message_id ?? ctx.run.id;

    logger.info("breno-processar-webhook: disparando breno-responder", {
      tenant_id:       input.tenant_id,
      conversation_id: input.conversation_id,
      modo,
      message_id:      messageIdForResponder,
    });

    let responderHandle: { id: string } | undefined;
    try {
      // brenoResponder espera message_id como UUID; se vier do webhook pode não ser
      // UUID válido. Validamos antes de passar.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeMessageId = uuidRegex.test(messageIdForResponder)
        ? messageIdForResponder
        : ctx.run.id; // fallback para UUID do próprio run

      responderHandle = await brenoResponder.trigger({
        tenant_id:       input.tenant_id,
        conversation_id: input.conversation_id,
        message_id:      safeMessageId,
        message:         input.message_body,
        sender_name:     input.sender_jid,
        triggered_by:    input.triggered_by,
      });

      logger.info("breno-processar-webhook: breno-responder enfileirado", {
        responder_run_id: responderHandle.id,
        modo,
      });
    } catch (err) {
      // Soft-fail: falha no enqueue não derruba o webhook inteiro
      logger.warn("breno-processar-webhook: erro ao enfileirar breno-responder", {
        error: (err as Error).message,
        tenant_id:       input.tenant_id,
        conversation_id: input.conversation_id,
      });

      const result: Output = OutputSchema.parse({
        ok:     false,
        action: "ignored",
        reason: `Erro ao enfileirar breno-responder: ${(err as Error).message}`,
      });

      await logAgentRun({
        runId:      ctx.run.id,
        agentSlug:  "breno",
        tenantId:   input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:     result,
        durationMs: Date.now() - start,
        status:     "failed",
      });

      return result;
    }

    // 5. Notificar equipe se for modo "ia" (agiu de forma autônoma)
    if (modo === "ia") {
      await notify({
        tenantId:          input.tenant_id,
        kind:              "agent_invoked",
        agent:             "breno",
        title:             "BRENO respondeu automaticamente",
        body:              `Mensagem de ${input.sender_jid} tratada de forma autônoma.`,
        link:              input.conversation_id
          ? `/chat/${input.conversation_id}`
          : undefined,
        recipientUserId:   null, // broadcast para todos do tenant
        metadata: {
          conversation_id:  input.conversation_id,
          responder_run_id: responderHandle?.id,
          modo,
        },
      });
    }

    const action: Output["action"] = modo === "ia" ? "auto_replied" : "draft_created";

    const result: Output = OutputSchema.parse({
      ok:     true,
      action,
      reason: modo === "ia"
        ? "Modo IA: breno-responder disparado para resposta automática"
        : "Modo híbrido: breno-responder disparado para gerar sugestão (draft)",
      run_id: responderHandle?.id,
    });

    // OBRIGATÓRIO: audit log
    await logAgentRun({
      runId:      ctx.run.id,
      agentSlug:  "breno",
      tenantId:   input.tenant_id,
      triggeredBy: input.triggered_by,
      input,
      output:     result,
      durationMs: Date.now() - start,
      status:     "success",
    });

    logger.info("breno-processar-webhook: concluído", {
      tenant_id:        input.tenant_id,
      action,
      responder_run_id: responderHandle?.id,
    });

    return result;
  },
});
