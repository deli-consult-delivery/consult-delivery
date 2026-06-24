import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { chat } from "../agents/llm-client";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  cobranca_id: z.string().uuid(),
  dias_atraso: z.number().int(), // negativo = antes do vencimento
});

const OutputSchema = z.object({
  ok: z.boolean(),
  draft_id: z.string().uuid().nullable(),
  tom: z.string(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

function tomParaDias(dias: number): "amigavel" | "neutro" | "formal" | "urgente" {
  if (dias <= 0) return "amigavel";   // pré-vencimento ou no dia
  if (dias <= 7)  return "neutro";
  if (dias <= 14) return "formal";
  return "urgente";
}

const tomInstrucoes: Record<string, string> = {
  amigavel: "Tom caloroso e empático. Lembrete antes do vencimento. Use emoji com moderação (1-2). Mencione que está disponível para ajudar.",
  neutro:   "Tom profissional e cordial. Cobrança logo após o vencimento. Objetivo e claro. Sem emoji.",
  formal:   "Tom formal e direto. Mencione as consequências de forma educada mas clara. Sem emoji.",
  urgente:  "Tom sério e direto. É urgente. Mencione que pode afetar o relacionamento comercial. Sem emoji. Curto.",
};

export const coraProcessarCobranca = task({
  id: "cora-processar-cobranca",
  retry: { maxAttempts: 2, minTimeoutInMs: 2_000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    logger.info("cora-processar-cobranca: iniciando", {
      cobranca_id: input.cobranca_id,
      dias_atraso: input.dias_atraso,
    });

    // Lê modo do tenant
    const { data: agentCfg } = await sb
      .from("tenant_agent_config")
      .select("modo_override")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "cora")
      .maybeSingle();
    const modo = (agentCfg?.modo_override as "humano" | "hibrido" | "ia") ?? "hibrido";
    const autonomyLevel = modo === "ia" ? "verde" : modo === "hibrido" ? "amarelo" : "vermelho";

    // Lê cobrança V2
    const { data: cob, error } = await sb
      .from("cobrancas")
      .select("id, customer_name, customer_phone, valor, vencimento, status, billing_type, invoice_url, bank_slip_url, pix_qr_code, ignorar_cobranca")
      .eq("id", input.cobranca_id)
      .eq("tenant_id", input.tenant_id)
      .single();

    if (error || !cob) {
      logger.error("cora-processar-cobranca: cobrança não encontrada", { id: input.cobranca_id });
      return { ok: false, draft_id: null, tom: "", skipped: true, reason: "cobranca_not_found" };
    }

    if (cob.ignorar_cobranca) {
      logger.info("cora-processar-cobranca: cobrança marcada como ignorada — pulando", { id: input.cobranca_id });
      return { ok: false, draft_id: null, tom: "", skipped: true, reason: "cobranca_ignorada" };
    }

    if (!cob.customer_name) {
      logger.warn("cora-processar-cobranca: sem customer_name, pulando", { id: input.cobranca_id });
      return { ok: false, draft_id: null, tom: "", skipped: true, reason: "no_customer_name" };
    }

    const tom = tomParaDias(input.dias_atraso);
    const valorFmt = `R$ ${Number(cob.valor).toFixed(2).replace(".", ",")}`;
    const linkPagamento = cob.invoice_url ?? cob.bank_slip_url ?? cob.pix_qr_code ?? null;
    const diasLabel =
      input.dias_atraso <= 0
        ? `vence em ${Math.abs(input.dias_atraso)} dia(s)`
        : `${input.dias_atraso} dia(s) em atraso`;

    const prompt = `Você é CORA, especialista em cobrança amigável para pequenos negócios de food service.
Escreva uma mensagem de cobrança via WhatsApp personalizada.

**Dados:**
- Cliente: ${cob.customer_name}
- Valor: ${valorFmt}
- Situação: ${diasLabel}
- Vencimento: ${cob.vencimento}
${linkPagamento ? `- Link de pagamento: ${linkPagamento}` : "- Sem link de pagamento disponível"}

**Tom:** ${tom}
${tomInstrucoes[tom]}

**Formato WhatsApp:** curto (máx 3 parágrafos pequenos), use negrito (*texto*) com moderação.
${linkPagamento ? "Inclua o link de pagamento de forma natural na mensagem." : ""}

Retorne APENAS JSON válido:
{
  "mensagem": "texto completo da mensagem",
  "dica_envio": "melhor horário/contexto para enviar"
}

NÃO use markdown ao redor do JSON. Responda SOMENTE o JSON.`;

    const llmResult = await chat([
      { role: "system", content: "Você é CORA. Responda SOMENTE em JSON válido sem markdown." },
      { role: "user", content: prompt },
    ]);
    const rawText = llmResult.content;

    let mensagem: string;
    let dicaEnvio: string = "Enviar entre 10h-11h ou 19h-20h";

    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : rawText);
      mensagem = parsed.mensagem ?? "";
      dicaEnvio = parsed.dica_envio ?? dicaEnvio;
    } catch {
      mensagem = `Olá ${cob.customer_name}! Passando para lembrar que temos ${valorFmt} ${diasLabel}.${linkPagamento ? ` Para sua comodidade, segue o link de pagamento: ${linkPagamento}` : ""} Qualquer dúvida, estou aqui! 😊`;
    }

    if (!mensagem) {
      return { ok: false, draft_id: null, tom, skipped: true, reason: "empty_message" };
    }

    // Dedup diário: evita 2 drafts para o mesmo telefone E mesma fatura no mesmo dia.
    // Mesmo telefone com fatura diferente (serviço diferente) não é bloqueado.
    if (cob.customer_phone) {
      const todayStart = new Date();
      todayStart.setUTCHours(3, 0, 0, 0); // meia-noite BRT (UTC-3)
      // Guarda: se for antes das 03:00 UTC, "hoje BRT" ainda é o dia UTC anterior
      if (new Date() < todayStart) todayStart.setUTCDate(todayStart.getUTCDate() - 1);
      const { data: dup } = await sb
        .from("agent_drafts")
        .select("id")
        .eq("tenant_id", input.tenant_id)
        .in("status", ["pending", "sent"])
        .filter("metadata->>customer_phone", "eq", cob.customer_phone)
        .filter("metadata->>cobranca_v2_id", "eq", input.cobranca_id)
        .gte("created_at", todayStart.toISOString())
        .limit(1)
        .maybeSingle();
      if (dup) {
        logger.info("cora-processar-cobranca: draft/envio já existe para este número e fatura hoje — pulando", { phone: cob.customer_phone, cobranca_id: input.cobranca_id });
        return { ok: false, draft_id: null, tom, skipped: true, reason: "draft_duplicado_hoje" };
      }
    }

    // Insere draft para aprovação humana
    const { data: draft, error: draftErr } = await sb
      .from("agent_drafts")
      .insert({
        tenant_id:      input.tenant_id,
        agent_name:     "cora",
        channel:        "whatsapp",
        subject:        `Cobrança — ${cob.customer_name}`,
        content:        mensagem,
        status:         "pending",
        autonomy_level: autonomyLevel,
        metadata: {
          cobranca_v2_id:    input.cobranca_id,
          cobranca_id:       input.cobranca_id,
          customer_name:     cob.customer_name,
          customer_phone:    cob.customer_phone,
          valor:             cob.valor,
          dias_atraso:       input.dias_atraso,
          tom,
          dica_envio:        dicaEnvio,
          link_pagamento:    linkPagamento,
          requires_approval: modo !== "ia",
          modo,
        },
      })
      .select("id")
      .single();

    if (draftErr || !draft) {
      logger.error("cora-processar-cobranca: falha ao criar draft", { error: draftErr?.message });
      return { ok: false, draft_id: null, tom, skipped: false, reason: "draft_insert_failed" };
    }

    // Registra ação em cora_acoes com referência V2
    await sb.from("cora_acoes").insert({
      tenant_id:       input.tenant_id,
      cobranca_id:     null,
      cobranca_v2_id:  input.cobranca_id,
      tipo:            "draft_criado",
      acao:            "draft_criado",
      canal:           "whatsapp",
      agente:          "cora",
      conteudo:        mensagem,
      mensagem_enviada: null,
    });

    const coraScores: Record<string, number> = { amigavel: 0.90, neutro: 0.80, formal: 0.75, urgente: 0.85 };
    const diasLabel2 = input.dias_atraso <= 0
      ? `${Math.abs(input.dias_atraso)}d antes do vencimento`
      : `${input.dias_atraso}d em atraso`;

    await logAgentRun({
      runId:      ctx.run.id,
      agentSlug:  "cora-processar-cobranca",
      tenantId:   input.tenant_id,
      input:      { cobranca_id: input.cobranca_id, dias_atraso: input.dias_atraso },
      output:     { ok: true, draft_id: draft.id, tom },
      status:     "success",
      durationMs: Date.now() - start,
      explanation: `Draft de cobrança criado para ${cob.customer_name} (${diasLabel2}). Tom ${tom} aplicado. Valor: R$ ${(cob.valor / 100).toFixed(2).replace('.', ',')}.`,
      confidenceScore: coraScores[tom] ?? 0.80,
      pipelineStage: "cobranca",
    });

    logger.info("cora-processar-cobranca: draft criado", { draft_id: draft.id, tom });
    return { ok: true, draft_id: draft.id, tom };
  },
});
