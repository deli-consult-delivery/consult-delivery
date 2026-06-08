import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { notify } from "../_shared/notify";
import { criarCustomer, criarSubscription, listarPagamentosDaAssinatura, getAsaasDefesaConfig } from "../_shared/asaas-defesa";

// =====================================================
// PR10 — Processa a FILA de assinaturas da Defesa.
// A tela Clientes insere linha 'pendente' (sem subscription);
// este cron (5 min) cria customer + assinatura R$147/mês no
// Asaas e grava o link de pagamento. Idempotente: só processa
// linhas com asaas_subscription_id NULL.
// =====================================================

export const defesaCriarAssinatura = schedules.task({
  id: "defesa-criar-assinatura",
  cron: "*/5 * * * *",
  run: async () => {
    const sb = getSupabase();
    const { ambiente } = getAsaasDefesaConfig();

    const { data: fila, error } = await sb
      .from("defesa_assinaturas")
      .select("id, tenant_id, valor_centavos, payer_nome, payer_email, payer_cpf_cnpj")
      .eq("status", "pendente")
      .is("asaas_subscription_id", null)
      .limit(10);
    if (error) throw new Error(`fila de assinaturas: ${error.message}`);
    if (!fila?.length) return { ok: true, processadas: 0, ambiente };

    let processadas = 0;
    let falhas = 0;

    for (const a of fila) {
      try {
        if (!a.payer_nome || !a.payer_cpf_cnpj) {
          logger.warn("assinatura sem dados do pagador — pulando", { id: a.id });
          continue;
        }
        const customer = await criarCustomer({
          name: a.payer_nome,
          email: a.payer_email ?? undefined,
          cpfCnpj: String(a.payer_cpf_cnpj).replace(/\D/g, ""),
          externalReference: a.tenant_id,
        });
        const hoje = new Date();
        hoje.setDate(hoje.getDate() + 3);
        const sub = await criarSubscription({
          customer: customer.id,
          value: a.valor_centavos / 100,
          nextDueDate: hoje.toISOString().slice(0, 10),
          description: "Consult Delivery — Defesa Comercial (assinatura mensal por loja)",
          externalReference: a.id,
        });
        // link de pagamento da 1ª cobrança
        let link: string | null = null;
        try {
          const pags = await listarPagamentosDaAssinatura(sub.id);
          link = pags?.data?.[0]?.invoiceUrl ?? null;
        } catch { /* link fica pro sync */ }
        const { error: upErr } = await sb
          .from("defesa_assinaturas")
          .update({
            asaas_customer_id: customer.id,
            asaas_subscription_id: sub.id,
            link_pagamento: link,
            ultima_cobranca_status: "PENDING",
            updated_at: new Date().toISOString(),
          })
          .eq("id", a.id);
        if (upErr) throw new Error(upErr.message);
        await notify({
          tenantId: a.tenant_id,
          kind: "system",
          agent: "defesa",
          title: `Assinatura da Defesa criada (${ambiente}) — aguardando pagamento`,
          body: link ? `Link de pagamento disponível na tela Clientes.` : `Link de pagamento será atualizado em instantes.`,
          metadata: { assinatura_id: a.id },
        });
        processadas++;
        logger.info("assinatura criada", { id: a.id, subscription: sub.id, ambiente });
      } catch (err) {
        falhas++;
        logger.error("falha ao criar assinatura", { id: a.id, erro: (err as Error).message });
      }
    }

    return { ok: true, processadas, falhas, ambiente };
  },
});
