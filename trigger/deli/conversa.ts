import { task } from "@trigger.dev/sdk/v3";
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
  action: z.string().optional(),
});

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

    // 2. Memórias persistentes (ordenadas por importância)
    const { data: memories } = await sb
      .from("agent_memories")
      .select("content, kind, importance, created_at")
      .eq("agent_id", "deli")
      .eq("tenant_id", input.tenant_id)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15);

    // 3. Histórico recente da conversa (últimas 20 trocas, invertidas para cronológico)
    const { data: history } = await sb
      .from("deli_messages")
      .select("role, content")
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.user_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const historyChronological = (history ?? []).reverse();

    // 4. System prompt com contexto de negócio
    const tenantName = tenant?.name ?? "Consult Delivery";
    const memoriesBlock =
      memories && memories.length > 0
        ? memories.map((m) => `[${m.kind}] ${m.content}`).join("\n")
        : "(sem memórias registradas ainda)";

    const systemPrompt = `Você é DELI, COO Digital da ${tenantName}. Você é o braço direito do CEO Wandson Silva.

## Papel
- Monitorar e resumir o estado do negócio em tempo real
- Propor ações estratégicas com semáforo: 🟢 Verde (executa sozinha), 🟡 Amarelo (propõe, aguarda aprovação), 🔴 Vermelho (precisa de aprovação explícita)
- Delegar análises ao agente especialista Análise iFood quando solicitado
- Dar respostas diretas, práticas e acionáveis — sem enrolação

## Memórias e contexto do negócio
${memoriesBlock}

## Regras absolutas
- Responda SEMPRE em português brasileiro
- Você fala APENAS com a equipe interna (Wandson, Wélida, Eduardo) — NUNCA com clientes finais
- Quando Wandson pedir análise de uma loja iFood, confirme que vai disparar o agente Análise iFood e peça o link do Google Drive caso não tenha sido fornecido
- Use emojis moderadamente para clareza visual (🟢🟡🔴✅⚠️🚨)
- Se não souber algo com certeza, diga explicitamente — nunca invente dados
- Respostas longas: use markdown (cabeçalhos, bullets, negrito) para organização`;

    // 5. Construir conversa para Claude
    const client = new Anthropic();

    const messages: Anthropic.MessageParam[] = [
      ...historyChronological.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: input.message },
    ];

    // 6. Chamar Claude
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

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

    // 9. Detectar intent de análise iFood na resposta
    const hasAnaliseIntent =
      /análise iFood|analise ifood|agente análise|google drive|link do drive/i.test(
        reply
      );

    // 10. Log de execução
    const output = OutputSchema.parse({
      ok: true,
      reply,
      memories_used: memories?.length ?? 0,
      action: hasAnaliseIntent ? "analise_solicitada" : "nenhuma",
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
