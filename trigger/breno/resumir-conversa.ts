import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  resumo: z.object({
    assunto_principal: z.string(),
    sentimento_cliente: z.enum(["positivo", "neutro", "negativo", "critico"]),
    pontos_chave: z.array(z.string()),
    pendencias: z.array(z.string()),
    proxima_acao: z.string(),
    urgencia: z.enum(["baixa", "media", "alta"]),
  }),
});

export const brenoResumirConversa = task({
  id: "breno-resumir-conversa",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const anthropic = getAnthropic();
    const sb = getSupabase();

    const { data: conv } = await sb
      .from("conversations")
      .select("id, contact_name, phone_number")
      .eq("id", input.conversation_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    const { data: messages } = await sb
      .from("messages")
      .select("content, direction, created_at, sender_name")
      .eq("conversation_id", input.conversation_id)
      .order("created_at", { ascending: false })
      .limit(30);

    const msgText = (messages || [])
      .reverse()
      .filter(m => m.content)
      .map(m => `[${m.direction === "inbound" ? "Cliente" : "Equipe"}] ${m.content?.slice(0, 200)}`)
      .join("\n");

    if (!msgText) {
      const resumo = {
        assunto_principal: "Sem mensagens",
        sentimento_cliente: "neutro" as const,
        pontos_chave: [],
        pendencias: [],
        proxima_acao: "Aguardar mensagem do cliente",
        urgencia: "baixa" as const,
      };

      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "breno-resumir-conversa",
        input: { conversation_id: input.conversation_id },
        output: { ok: true, resumo },
        tenantId: input.tenant_id,
        triggeredBy: input.triggered_by,
        durationMs: Date.now() - start,
        status: "success",
      });

      return OutputSchema.parse({ ok: true, resumo });
    }

    const prompt = `Você é BRENO. Resuma esta conversa de atendimento para a equipe da Consult Delivery.

Cliente: ${conv?.contact_name || "Desconhecido"}

Conversa (últimas 30 mensagens):
${msgText}

Retorne APENAS JSON:
{
  "assunto_principal": "tema principal da conversa em 1 frase",
  "sentimento_cliente": "positivo|neutro|negativo|critico",
  "pontos_chave": ["ponto 1", "ponto 2", "ponto 3"],
  "pendencias": ["o que ainda precisa ser resolvido"],
  "proxima_acao": "próxima ação recomendada para a equipe",
  "urgencia": "baixa|media|alta"
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: "Você é BRENO, assistente de atendimento. JSON apenas.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const costUsd = calcularCustoUsd("claude-haiku-4-5-20251001", response.usage);

    let resumo: z.infer<typeof OutputSchema>["resumo"];
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      resumo = JSON.parse(m ? m[0] : rawText);
    } catch {
      resumo = {
        assunto_principal: "Conversa de atendimento",
        sentimento_cliente: "neutro",
        pontos_chave: ["Resumo automático indisponível"],
        pendencias: [],
        proxima_acao: "Revisar conversa manualmente",
        urgencia: "baixa",
      };
    }

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-resumir-conversa",
      input: { conversation_id: input.conversation_id },
      output: { ok: true, resumo },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
      costUsd,
      status: "success",
    });

    return OutputSchema.parse({ ok: true, resumo });
  },
});
