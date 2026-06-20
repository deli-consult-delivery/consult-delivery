import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  cobranca_v2_id: z.string().uuid(),
  tom: z.enum(["amigavel", "neutro", "formal", "urgente"]).optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  draft_id: z.string(),
  mensagem: z.string(),
  tom_usado: z.string(),
});

export const coraGerarMensagemAsaas = task({
  id: "cora-gerar-mensagem-asaas",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const anthropic = new Anthropic();

    const { data: agentCfg } = await sb
      .from("tenant_agent_config")
      .select("mode")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "cora")
      .maybeSingle();
    const modo = (agentCfg?.mode as "humano" | "hibrido" | "ia") ?? "hibrido";
    const autonomyLevel = modo === "ia" ? "verde" : modo === "humano" ? "vermelho" : "amarelo";

    const { data: cob, error } = await sb
      .from("cobrancas")
      .select("id, customer_name, customer_phone, valor, vencimento, status")
      .eq("id", input.cobranca_v2_id)
      .eq("tenant_id", input.tenant_id)
      .single();

    if (error || !cob) throw new Error(`Cobrança não encontrada: ${input.cobranca_v2_id}`);

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const venc = new Date(cob.vencimento + "T00:00:00");
    const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
    const isLembrete = diasAtraso < 0;

    const tomFinal = input.tom ?? (
      isLembrete ? "amigavel" :
      diasAtraso <= 7  ? "neutro" :
      diasAtraso <= 14 ? "formal" : "urgente"
    );

    const valor = `R$ ${Number(cob.valor).toFixed(2).replace(".", ",")}`;

    const tomInstrucoes: Record<string, string> = {
      amigavel: "Tom caloroso, empático. Use emoji com moderação (1-2 no máximo). Mencione que está aqui para ajudar.",
      neutro:   "Tom profissional mas cordial. Objetivo e claro. Sem emoji.",
      formal:   "Tom formal e direto. Mencione as consequências de forma educada mas clara. Sem emoji.",
      urgente:  "Tom sério e direto. Mencione urgência. Sem emoji. Curto.",
    };

    const contexto = isLembrete
      ? `Vence em ${Math.abs(diasAtraso)} dias (${cob.vencimento}). É um lembrete preventivo.`
      : `Venceu há ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""} (${cob.vencimento}).`;

    const prompt = `Você é CORA, especialista em cobrança amigável. Escreva uma mensagem de cobrança personalizada para WhatsApp.

**Dados:**
- Cliente: ${cob.customer_name ?? "Cliente"}
- Valor: ${valor}
- Situação: ${contexto}
- Tom: ${tomFinal} — ${tomInstrucoes[tomFinal]}

**Formato WhatsApp:** Curto (máx 3 parágrafos pequenos). Use negrito (*texto*) com moderação. Português brasileiro natural. Linguagem para pequenos empresários de delivery.

Retorne APENAS JSON válido (sem markdown):
{
  "mensagem": "texto completo",
  "tom_usado": "${tomFinal}",
  "dica_envio": "dica de quando/como enviar"
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: "Você é CORA, especialista em cobrança amigável. Responda SEMPRE em JSON válido sem markdown.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let parsed: { mensagem: string; tom_usado: string; dica_envio: string };
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
    } catch {
      parsed = {
        mensagem: `Olá${cob.customer_name ? ` ${cob.customer_name}` : ""}! Temos um valor de *${valor}* ${isLembrete ? `com vencimento em ${Math.abs(diasAtraso)} dias` : `em aberto há ${diasAtraso} dias`}. Podemos ajudar a regularizar? 😊`,
        tom_usado: tomFinal,
        dica_envio: "Enviar entre 10h-11h ou 19h-20h para melhor resposta",
      };
    }

    const { data: draft, error: draftErr } = await sb
      .from("agent_drafts")
      .insert({
        tenant_id:      input.tenant_id,
        agent_name:     "cora",
        channel:        "whatsapp",
        subject:        `${isLembrete ? "Lembrete" : "Cobrança"} — ${cob.customer_name ?? "Cliente"}`,
        content:        parsed.mensagem,
        status:         "pending",
        autonomy_level: autonomyLevel,
        metadata: {
          cobranca_v2_id:    input.cobranca_v2_id,
          customer_name:     cob.customer_name,
          customer_phone:    cob.customer_phone,
          valor,
          dias_atraso:       diasAtraso,
          tom:               parsed.tom_usado,
          dica_envio:        parsed.dica_envio,
          requires_approval: modo !== "ia",
          modo,
        },
      })
      .select("id")
      .single();

    if (draftErr || !draft) throw new Error(`Falha ao criar draft: ${draftErr?.message}`);

    await sb.from("cora_acoes").insert({
      tenant_id:        input.tenant_id,
      cobranca_v2_id:   input.cobranca_v2_id,
      tipo:             "draft_criado",
      acao:             "draft_criado",
      canal:            "whatsapp",
      agente:           "cora",
      conteudo:         parsed.mensagem,
      mensagem_enviada: null,
    });

    await logAgentRun({
      runId:       ctx.run.id,
      agentSlug:   "cora-gerar-mensagem-asaas",
      input:       { cobranca_v2_id: input.cobranca_v2_id, tom: tomFinal },
      output:      { ok: true, draft_id: draft.id },
      tenantId:    input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs:  Date.now() - start,
    });

    return OutputSchema.parse({
      ok:       true,
      draft_id: draft.id,
      mensagem: parsed.mensagem,
      tom_usado: parsed.tom_usado,
    });
  },
});
