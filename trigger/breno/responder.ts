import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { executeAgent, getClientContext, recordFact, logTimeline } from "../../src/agents/shared/runtime";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

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

const OutputSchema = z.object({
  ok: z.boolean(),
  resposta: z.string(),
  tom: z.string(),
  draft_id: z.string().uuid().optional(),
  precisa_humano: z.boolean(),
  motivo_humano: z.string().optional(),
  action_taken: z.enum(["sent", "suggested", "skipped"]),
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
      .select("id, contact_name, phone_number, customer_id")
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
      task: 'respond_to_client',
      cliente: conv?.contact_name || input.sender_name || "Cliente",
      mensagem: input.message,
      historico: ctxMessages || "",
      contexto_loja: contextoLoja,
      instrucoes: 'Retorne APENAS JSON (sem markdown): {"resposta":"resposta natural em pt-BR máx 3 frases","tom":"amigavel|informativo|empático|urgente","precisa_humano":false,"motivo_humano":null}. Se problema sério (produto estragado, cobrança errada, acidente): precisa_humano:true com motivo. NUNCA prometa o que não pode cumprir.',
    }, { runId: ctx.run.id, tenantId: input.tenant_id });
    const rawText = agentResult.output as string;

    let parsed: { resposta: string; tom: string; precisa_humano: boolean; motivo_humano?: string | null };
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
    } catch {
      parsed = {
        resposta: "Olá! Obrigado pelo contato. Nossa equipe está verificando e responde em instantes!",
        tom: "amigavel",
        precisa_humano: true,
        motivo_humano: "Erro no processamento automático",
      };
    }

    const action_taken: "sent" | "suggested" = mode === "ia" ? "sent" : "suggested";

    let draft_id: string | undefined;
    if (mode === "hibrido") {
      const { data: draft } = await sb.from("agent_drafts").insert({
        tenant_id: input.tenant_id,
        agent_name: "breno",
        channel: "whatsapp",
        subject: `Resposta sugerida para conversa ${input.conversation_id}`,
        content: parsed.resposta,
        autonomy_level: "hibrido",
        status: "pending",
      }).select("id").single();
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

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-responder",
      input: { conversation_id: input.conversation_id, message_id: input.message_id },
      output: { ok: true, action_taken, mode },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
      status: "success",
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
