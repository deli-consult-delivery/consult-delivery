import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createCharge, AsaasApiError } from "../_shared/asaas";
import { logAgentRun } from "../_shared/audit";
import { getSupabase } from "../_shared/supabase";
import { notify } from "../_shared/notify";

// ── OBRIGATÓRIO: Schema de entrada ───────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  asaas_customer_id: z.string(), // ID do cliente no Asaas (cus_xxx)
  customer_name: z.string(), // cache pro banco local
  customer_phone: z.string().optional(), // cache pro banco local
  valor: z.number().positive(),
  vencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  billing_type: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]),
  description: z.string().optional(),
  cliente_id: z.string().uuid().optional(), // nosso ID interno (CRM)
  triggered_by: z.string().uuid().optional(),
});

// ── OBRIGATÓRIO: Schema de saída ─────────────────────────────────────────────

const OutputSchema = z.object({
  ok: z.boolean(),
  cobranca_id: z.string().uuid(), // ID na tabela cobrancas
  asaas_charge_id: z.string(), // ID retornado pelo Asaas (pay_xxx)
  status: z.string(), // "pending"
  invoice_url: z.string().nullable(), // link de pagamento (todos os tipos)
  bank_slip_url: z.string().nullable(), // URL do boleto (só BOLETO)
  pix_payload: z.string().nullable(), // PIX copia-e-cola (só PIX)
  due_date: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

export const coraCriarCobranca = task({
  id: "cora-criar-cobranca",
  // Asaas já tem retry interno em _shared/asaas — maxAttempts: 2 aqui
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },
  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);

    const startMs = Date.now();

    logger.info("cora-criar-cobranca: iniciando", {
      tenant_id: input.tenant_id,
      billing_type: input.billing_type,
      valor: input.valor,
      vencimento: input.vencimento,
    });

    // ── 1. Criar cobrança no Asaas ─────────────────────────────────────────

    let charge: Awaited<ReturnType<typeof createCharge>>;

    try {
      charge = await createCharge({
        customer: input.asaas_customer_id,
        billingType: input.billing_type,
        value: input.valor,
        dueDate: input.vencimento,
        description: input.description,
        externalReference: `${input.tenant_id}-${Date.now()}`,
      });
    } catch (err) {
      if (err instanceof AsaasApiError) {
        throw new Error(
          `Asaas recusou a criação da cobrança (HTTP ${err.status}): ${JSON.stringify(err.body)}`
        );
      }
      throw err;
    }

    logger.info("cora-criar-cobranca: cobrança criada no Asaas", {
      asaas_charge_id: charge.id,
      status: charge.status,
    });

    // ── 2. Inserir em `cobrancas` ──────────────────────────────────────────

    const supabase = getSupabase();

    const { data: cobrancaRow, error: insertCobrancaError } = await supabase
      .from("cobrancas")
      .insert({
        tenant_id: input.tenant_id,
        cliente_id: input.cliente_id ?? null,
        asaas_charge_id: charge.id,
        valor: input.valor,
        vencimento: input.vencimento,
        status: "pending",
        billing_type: input.billing_type,
        invoice_url: charge.invoiceUrl ?? null,
        bank_slip_url: charge.bankSlipUrl ?? null,
        pix_qr_code: charge.pixQrCode?.payload ?? null,
        customer_name: input.customer_name,
        customer_phone: input.customer_phone ?? null,
        metadata: { asaas_raw: charge },
      })
      .select("id")
      .single();

    if (insertCobrancaError || !cobrancaRow) {
      throw new Error(
        `Falha ao inserir cobrança no banco local: ${insertCobrancaError?.message ?? "resultado vazio"}`
      );
    }

    const cobrancaId: string = cobrancaRow.id;

    logger.info("cora-criar-cobranca: registro salvo em cobrancas", {
      cobranca_id: cobrancaId,
    });

    // ── 3. Inserir em `cobranca_eventos` ───────────────────────────────────
    // Se falhar, logamos warning mas NÃO relançamos — a cobrança já foi criada
    // no Asaas e não pode ser desfeita. O audit trail pode ser reconstruído.

    const { error: insertEventoError } = await supabase
      .from("cobranca_eventos")
      .insert({
        cobranca_id: cobrancaId,
        tenant_id: input.tenant_id,
        event_type: "created",
        old_status: null,
        new_status: "pending",
        triggered_by: "cora",
        metadata: {
          asaas_charge_id: charge.id,
          billing_type: input.billing_type,
        },
      });

    if (insertEventoError) {
      logger.warn("cora-criar-cobranca: falha ao inserir cobranca_eventos (não crítico)", {
        cobranca_id: cobrancaId,
        error: insertEventoError.message,
      });
    }

    // ── 4. Audit log (agent_runs) ──────────────────────────────────────────

    const durationMs = Date.now() - startMs;

    const output = OutputSchema.parse({
      ok: true,
      cobranca_id: cobrancaId,
      asaas_charge_id: charge.id,
      status: "pending",
      invoice_url: charge.invoiceUrl ?? null,
      bank_slip_url: charge.bankSlipUrl ?? null,
      pix_payload: charge.pixQrCode?.payload ?? null,
      due_date: charge.dueDate,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "cora",
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      input,
      output,
      status: "success",
      durationMs,
    });

    logger.info("cora-criar-cobranca: concluído com sucesso", {
      cobranca_id: cobrancaId,
      asaas_charge_id: charge.id,
      duration_ms: durationMs,
    });

    await notify({
      tenantId:        input.tenant_id,
      kind:            "agent_completed",
      agent:           "cora",
      title:           "CORA criou cobrança no Asaas",
      body:            `${input.customer_name} · R$ ${input.valor.toFixed(2)} · venc. ${input.vencimento}`,
      link:            "/cora",
      recipientUserId: input.triggered_by ?? null,
      metadata:        { cobranca_id: cobrancaId, run_id: ctx.run.id },
    });

    return output;
  },
});
