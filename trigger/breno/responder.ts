import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const anthropic = new Anthropic();

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
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
});

export const brenoResponder = task({
  id: "breno-responder",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    // Busca contexto da loja do cliente
    const { data: conv } = await sb
      .from("conversations")
      .select("id, contact_name, phone_number")
      .eq("id", input.conversation_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    const ctxMessages = input.context_messages.slice(-10)
      .map(m => `${m.role === "client" ? "Cliente" : "Equipe"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é BRENO, assistente de atendimento da Consult Delivery. Ajuda a equipe a responder clientes de delivery com simpatia e eficiência.

**Contexto da conversa:**
Cliente: ${conv?.contact_name || input.sender_name || "Cliente"}
${ctxMessages ? `\nHistórico recente:\n${ctxMessages}` : ""}

**Nova mensagem do cliente:**
"${input.message}"

Analise a mensagem e retorne APENAS JSON:
{
  "resposta": "resposta sugerida para o cliente (natural, em português brasileiro, máx 3 frases)",
  "tom": "amigavel|informativo|empático|urgente",
  "precisa_humano": false,
  "motivo_humano": null
}

Regras:
- Se o cliente reclamar de algo sério (produto estragado, cobrança errada, acidente) → precisa_humano: true com motivo
- Se for pergunta simples (horário, cardápio, status pedido) → responda diretamente
- Se for elogio → agradeça brevemente
- Se não souber responder → precisa_humano: true
- NUNCA prometa o que não pode cumprir
- Tom sempre cordial, como pequeno negócio brasileiro`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: "Você é BRENO, assistente de atendimento. JSON apenas, sem markdown.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let parsed: { resposta: string; tom: string; precisa_humano: boolean; motivo_humano?: string | null };
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
    } catch {
      parsed = {
        resposta: "Olá! Obrigado pelo contato. Nossa equipe está verificando e responde em instantes! 😊",
        tom: "amigavel",
        precisa_humano: true,
        motivo_humano: "Erro no processamento automático",
      };
    }

    // Cria draft para aprovação
    const { data: draft } = await sb.from("agent_drafts").insert({
      tenant_id: input.tenant_id,
      agent_id: "breno",
      draft_type: "resposta_cliente",
      content: parsed.resposta,
      metadata: {
        conversation_id: input.conversation_id,
        sender_name: conv?.contact_name || input.sender_name,
        tom: parsed.tom,
        precisa_humano: parsed.precisa_humano,
        motivo_humano: parsed.motivo_humano,
        mensagem_original: input.message,
      },
      status: parsed.precisa_humano ? "flagged" : "pending",
    }).select("id").single();

    await sb.from("agent_runs").insert({
      tenant_id: input.tenant_id,
      agent_id: "breno",
      trigger_dev_run_id: ctx.run.id,
      status: "completed",
      input: { conversation_id: input.conversation_id, message: input.message.slice(0, 100) },
      output: { ok: true, resposta: parsed.resposta, precisa_humano: parsed.precisa_humano },
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-responder",
      input: { conversation_id: input.conversation_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
    });

    return OutputSchema.parse({
      ok: true,
      resposta: parsed.resposta,
      tom: parsed.tom,
      draft_id: draft?.id,
      precisa_humano: parsed.precisa_humano,
      motivo_humano: parsed.motivo_humano ?? undefined,
    });
  },
});
