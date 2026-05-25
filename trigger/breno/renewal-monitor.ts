import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { executeAgent } from "../../src/agents/shared/runtime";
import { listCharges } from "../_shared/asaas";

export const renewalMonitorTask = schedules.task({
  id: "breno-renewal-monitor",
  cron: "0 11 * * *",
  retry: { maxAttempts: 3, minTimeoutInMs: 60_000, maxTimeoutInMs: 180_000 },

  run: async (_payload, { ctx }) => {
    logger.info("breno-renewal-monitor: início");
    const sb = getSupabase();
    const start = Date.now();

    // 1. Contratos vencendo em ≤30 dias (tabela pode não existir)
    let contratosUrgentes: { id: string; vigencia_fim: string; tenant_id?: string }[] = [];
    try {
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from("contratos")
        .select("id, vigencia_fim, tenant_id")
        .lte("vigencia_fim", em30dias)
        .gt("vigencia_fim", new Date().toISOString())
        .order("vigencia_fim", { ascending: true })
        .limit(20);
      contratosUrgentes = (data ?? []) as typeof contratosUrgentes;
    } catch {
      logger.warn("breno-renewal-monitor: tabela contratos não existe, ignorando");
    }

    // 2. Cobranças vencidas no Asaas (OVERDUE) — anti-padrão: só draft, nunca enviar direto
    let overdueCharges: { id: string; customer: string; value: number; dueDate: string }[] = [];
    try {
      const asaasResp = await listCharges({ status: "OVERDUE", limit: 50 });
      overdueCharges = asaasResp.data.map((c) => ({
        id: c.id,
        customer: c.customer,
        value: c.value,
        dueDate: c.dueDate,
      }));
    } catch (err) {
      logger.warn("breno-renewal-monitor: Asaas OVERDUE falhou", {
        error: (err as Error).message,
      });
    }

    const totalAlertas = contratosUrgentes.length + overdueCharges.length;

    if (totalAlertas === 0) {
      logger.info("breno-renewal-monitor: sem alertas hoje");
      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "breno-renewal-monitor",
        input: { data: new Date().toISOString().slice(0, 10) },
        output: { alertas: 0 },
        status: "success",
        durationMs: Date.now() - start,
      });
      return { alertas: 0 };
    }

    // 3. Sintetizar alerta via executeAgent (runtime — anti-padrão: nunca SDK direto)
    let resumoTexto = "";
    try {
      const agentResult = await executeAgent("breno", {
        task: "renewal_alert",
        contratos_urgentes: contratosUrgentes.length,
        contratos_lista: contratosUrgentes.slice(0, 5),
        cobranças_vencidas: overdueCharges.length,
        valor_total_vencido: overdueCharges.reduce((s, c) => s + c.value, 0),
        instrucoes:
          "Você é BRENO, assistente interno. Gere um resumo conciso (máx 5 linhas) para a equipe interna sobre contratos próximos do vencimento e cobranças vencidas. Formato direto, sem saudações, em pt-BR.",
      }, { runId: ctx.run.id });
      resumoTexto = String(agentResult.output).trim();
    } catch (err) {
      logger.warn("breno-renewal-monitor: executeAgent falhou, usando resumo fallback", {
        error: (err as Error).message,
      });
      resumoTexto =
        `Alerta automático BRENO:\n` +
        `• ${contratosUrgentes.length} contrato(s) vencendo em ≤30 dias\n` +
        `• ${overdueCharges.length} cobrança(s) vencida(s) no Asaas\n` +
        `Total a vencer: R$ ${overdueCharges.reduce((s, c) => s + c.value, 0).toFixed(2)}`;
    }

    // 4. Criar draft telegram_interno (canal interno, não precisa aprovação humana)
    // agent_drafts.tenant_id NOT NULL — buscar tenant principal
    let draftId: string | undefined;
    try {
      const { data: tenantRow } = await sb
        .from("tenants")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (tenantRow?.id) {
        const { data: draft } = await sb
          .from("agent_drafts")
          .insert({
            tenant_id:      tenantRow.id,
            agent_name:     "breno",
            channel:        "telegram_interno",
            subject:        `Alerta de renovações — ${new Date().toISOString().slice(0, 10)}`,
            body:           resumoTexto,
            autonomy_level: "amarelo",
            status:         "pending",
          })
          .select("id")
          .single();
        draftId = draft?.id;
      } else {
        logger.warn("breno-renewal-monitor: nenhum tenant encontrado — draft não criado");
      }
    } catch (err) {
      logger.warn("breno-renewal-monitor: agent_drafts insert falhou", {
        error: (err as Error).message,
      });
    }

    logger.info("breno-renewal-monitor: concluído", {
      alertas: totalAlertas,
      draft_id: draftId,
    });

    // 5. logAgentRun
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-renewal-monitor",
      input: { data: new Date().toISOString().slice(0, 10) },
      output: {
        alertas: totalAlertas,
        contratos_urgentes: contratosUrgentes.length,
        cobranças_vencidas: overdueCharges.length,
        draft_id: draftId,
      },
      status: "success",
      durationMs: Date.now() - start,
    });

    return { alertas: totalAlertas, draft_id: draftId };
  },
});
