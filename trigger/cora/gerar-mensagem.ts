import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  cobranca_id: z.string().uuid(),
  tom: z.enum(["amigavel", "neutro", "formal", "urgente"]).optional(),
  canal: z.enum(["whatsapp", "email"]).default("whatsapp"),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  mensagem: z.string(),
  tom_usado: z.string(),
  canal: z.string(),
  dica_envio: z.string(),
});

export const coraGerarMensagem = task({
  id: "cora-gerar-mensagem",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    // Instanciado dentro do run() para evitar throw no topo de módulo (anti-padrão #4)
    const anthropic = new Anthropic();

    // Lê modo do tenant em tenant_agent_config
    const { data: agentCfg } = await sb
      .from("tenant_agent_config")
      .select("mode")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "cora")
      .maybeSingle();
    const modo = (agentCfg?.mode as "humano" | "hibrido" | "ia") ?? "hibrido";

    const { data: cob, error } = await sb
      .from("cora_cobrancas")
      .select("*")
      .eq("id", input.cobranca_id)
      .eq("tenant_id", input.tenant_id)
      .single();

    if (error || !cob) throw new Error(`Cobrança não encontrada: ${input.cobranca_id}`);

    const diasAtraso = Math.max(0, Math.floor(
      (Date.now() - new Date(cob.data_vencimento).getTime()) / 86400000
    ));

    const analise = cob.cora_analise as Record<string, unknown> | null;
    const tomFinal = input.tom || (analise?.tom_recomendado as string) || "amigavel";
    const valor = `R$ ${Number(cob.valor_atual).toFixed(2).replace(".", ",")}`;

    const tomInstrucoes: Record<string, string> = {
      amigavel: "Tom caloroso, empático. Mencione que está aqui para ajudar. Use emoji com moderação (1-2 no máximo). Ofereça facilitar o pagamento.",
      neutro: "Tom profissional mas cordial. Objetivo e claro. Sem emoji.",
      formal: "Tom formal e direto. Mencione as consequências de forma educada mas clara. Sem emoji.",
      urgente: "Tom sério e direto. Mencione que é urgente e que pode afetar o relacionamento. Sem emoji. Curto.",
    };

    const canalInstrucoes: Record<string, string> = {
      whatsapp: "Formato WhatsApp: curto (máx 3 parágrafos pequenos), use negrito (*texto*) com moderação, sem formalidade excessiva.",
      email: "Formato e-mail: estruturado com saudação, corpo e encerramento. Pode ser mais longo e formal.",
    };

    const prompt = `Você é CORA, especialista em cobrança amigável. Escreva uma mensagem de cobrança personalizada.

**Dados da cobrança:**
- Cliente: ${cob.customer_name}
- Valor: ${valor}
- Dias em atraso: ${diasAtraso} dias
- Vencimento original: ${cob.data_vencimento}

**Tom:** ${tomFinal}
${tomInstrucoes[tomFinal]}

**Canal:** ${input.canal}
${canalInstrucoes[input.canal]}

**Contexto extra:** ${cob.notas || "Nenhum"}

Retorne APENAS JSON válido:
{
  "mensagem": "texto completo da mensagem (sem aspas extras dentro)",
  "tom_usado": "${tomFinal}",
  "canal": "${input.canal}",
  "dica_envio": "dica de como/quando enviar esta mensagem para melhor resultado"
}

NÃO inclua o JSON dentro de markdown. Retorne APENAS o JSON bruto.
A mensagem deve ser em português brasileiro natural, adequada ao relacionamento com pequenos empresários de delivery.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: "Você é CORA, especialista em cobrança amigável. Responda SEMPRE em JSON válido sem markdown.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let result: z.infer<typeof OutputSchema>;
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      result = JSON.parse(m ? m[0] : rawText);
    } catch {
      result = {
        ok: true,
        mensagem: `Olá ${cob.customer_name}! Passando para lembrar que temos um valor de ${valor} em aberto há ${diasAtraso} dias. Podemos conversar sobre o melhor jeito de regularizar? 😊`,
        tom_usado: tomFinal,
        canal: input.canal,
        dica_envio: "Enviar entre 10h-11h ou 19h-20h para melhor taxa de resposta",
      };
    }

    // Salva draft na tabela de drafts para aprovação humana
    // Colunas corretas conforme schema real de agent_drafts
    await sb.from("agent_drafts").insert({
      tenant_id:      input.tenant_id,
      agent_name:     "cora",
      channel:        input.canal,
      subject:        `Cobrança — ${cob.customer_name}`,
      body:           result.mensagem,
      status:         "pending",
      autonomy_level: modo,
      metadata: {
        cobranca_id:      input.cobranca_id,
        customer_name:    cob.customer_name,
        canal:            input.canal,
        tom:              tomFinal,
        dica_envio:       result.dica_envio,
        requires_approval: modo !== "ia",
        modo,
      },
    });

    // Registra ação (V1 + campos V2)
    await sb.from("cora_acoes").insert({
      cobranca_id:      input.cobranca_id,
      tenant_id:        input.tenant_id,
      tipo:             "mensagem_enviada",
      acao:             "mensagem_enviada",
      canal:            input.canal,
      agente:           "cora",
      conteudo:         result.mensagem,
      mensagem_enviada: result.mensagem,
    });

    await sb.from("agent_runs").insert({
      tenant_id:          input.tenant_id,
      agent_id:           "cora",
      trigger_dev_run_id: ctx.run.id,
      status:             "success",
      input:              { cobranca_id: input.cobranca_id, tom: tomFinal, modo },
      output:             { ...result, ok: true },
      duration_ms:        Date.now() - start,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "cora-gerar-mensagem",
      input: { cobranca_id: input.cobranca_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
    });

    return OutputSchema.parse({ ...result, ok: true });
  },
});
