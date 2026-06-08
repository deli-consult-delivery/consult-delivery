import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { notify } from "../_shared/notify";
import { listarPagamentosDaAssinatura } from "../_shared/asaas-defesa";

// =====================================================
// PR10 — Sincroniza assinaturas da Defesa com o Asaas (cron 15min).
// Pagamento CONFIRMED/RECEIVED → status 'ativa' + HABILITA a Defesa
// (tenant_agents). 1 cobrança OVERDUE → 'atrasada' + alerta.
// 2+ OVERDUE → DESABILITA a Defesa (volta ao Radar grátis).
// O toggle manual da tela Clientes segue como override.
// =====================================================

export const defesaSyncAssinaturas = schedules.task({
  id: "defesa-sync-assinaturas",
  cron: "*/15 * * * *",
  run: async () => {
    const sb = getSupabase();
    const { data: assinaturas, error } = await sb
      .from("defesa_assinaturas")
      .select("id, tenant_id, status, asaas_subscription_id, link_pagamento")
      .not("asaas_subscription_id", "is", null)
      .neq("status", "cancelada")
      .limit(100);
    if (error) throw new Error(`sync assinaturas: ${error.message}`);
    if (!assinaturas?.length) return { ok: true, sincronizadas: 0 };

    let sincronizadas = 0;

    for (const a of assinaturas) {
      try {
        const pags = await listarPagamentosDaAssinatura(a.asaas_subscription_id!);
        const lista: any[] = pags?.data ?? [];
        if (!lista.length) continue;
        const pagas = lista.filter(p => p.status === "CONFIRMED" || p.status === "RECEIVED");
        const vencidas = lista.filter(p => p.status === "OVERDUE");
        const pendente = lista.find(p => p.status === "PENDING");

        let novoStatus = a.status;
        if (vencidas.length >= 2) novoStatus = "atrasada";
        else if (vencidas.length === 1) novoStatus = "atrasada";
        else if (pagas.length > 0) novoStatus = "ativa";

        const updates: Record<string, unknown> = {
          ultima_cobranca_status: lista[0]?.status ?? null,
          link_pagamento: pendente?.invoiceUrl ?? a.link_pagamento,
          updated_at: new Date().toISOString(),
        };
        if (novoStatus !== a.status) updates.status = novoStatus;
        await sb.from("defesa_assinaturas").update(updates).eq("id", a.id);

        if (novoStatus !== a.status) {
          if (novoStatus === "ativa") {
            // Habilita a Defesa no tenant (idempotente)
            await sb.from("tenant_agents").upsert({ tenant_id: a.tenant_id, agent_id: "defesa" }, { onConflict: "tenant_id,agent_id", ignoreDuplicates: true });
            await notify({ tenantId: a.tenant_id, kind: "system", agent: "defesa", title: "Pagamento confirmado — Defesa Comercial ATIVADA", body: "O vigia começa a atuar na próxima varredura (até 5 minutos).", metadata: { assinatura_id: a.id } });
          }
          if (novoStatus === "atrasada") {
            await notify({ tenantId: a.tenant_id, kind: "system", agent: "defesa", title: "Assinatura da Defesa ATRASADA", body: vencidas.length >= 2 ? "Duas cobranças vencidas — a Defesa foi desativada (volta ao Radar grátis) até regularizar." : "Primeira cobrança vencida — regularize para manter a Defesa ativa.", metadata: { assinatura_id: a.id } });
          }
        }
        if (vencidas.length >= 2) {
          // Desabilita a Defesa (volta ao Radar) — idempotente
          await sb.from("tenant_agents").delete().eq("tenant_id", a.tenant_id).eq("agent_id", "defesa");
        }
        sincronizadas++;
      } catch (err) {
        logger.warn("sync falhou para assinatura", { id: a.id, erro: (err as Error).message });
      }
    }

    logger.info("sync de assinaturas concluído", { sincronizadas });
    return { ok: true, sincronizadas };
  },
});
