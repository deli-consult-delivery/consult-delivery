import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

const ResultItemSchema = z.object({
  avaliacao_id:  z.string().uuid(),
  tenant_id:     z.string().uuid(),
  status:        z.enum(["ok", "falhou", "sem_instancia", "sem_config"]),
  detalhe:       z.string().optional(),
});

const OutputSchema = z.object({
  total_processados: z.number().int(),
  enviados:          z.number().int(),
  falhas:            z.number().int(),
  resultados:        z.array(ResultItemSchema),
});

type Output = z.infer<typeof OutputSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  "https://app.consultdelivery.com.br";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

interface EvolutionInstance {
  evolution_url: string;
  api_key:       string;
  instance_name: string;
}

async function sendEvolutionText(inst: EvolutionInstance, number: string, text: string): Promise<{ ok: boolean; detail?: unknown }> {
  const phone = number.replace(/\D/g, "");
  if (!phone) return { ok: false, detail: "numero_invalido" };

  try {
    const resp = await fetch(
      `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body:    JSON.stringify({ number: phone, text }),
      }
    );
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, detail: data };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

// ─── Task principal (também pode ser cron) ───────────────────────────────────

/**
 * Busca CSATs pendentes de envio (criados há menos de 2h, sem msg_enviada_at)
 * e envia a mensagem WhatsApp de avaliação via Evolution API do tenant.
 *
 * Acionado:
 *  - Pelo webhook crm-atendimento-webhook.js (via trigger.send)
 *  - Como cron a cada 15min (safety net para conversas internas)
 */
export const csatEnviarTask = task({
  id:    "csat-enviar-avaliacao",
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});
    const sb    = getSupabase();

    logger.info("csat-enviar-avaliacao: iniciando", { tenantId: input.tenant_id });

    // Buscar avaliações pendentes de envio (até 2h de idade, safety net máximo)
    const agora      = new Date();
    const doasHorasAtras = new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString();

    let query = sb
      .from("atendimento_avaliacoes")
      .select("id, tenant_id, public_token, contact_identifier, nome_cliente, status")
      .is("msg_enviada_at", null)
      .eq("status", "pendente")
      .gte("created_at", doasHorasAtras)
      .order("created_at", { ascending: true })
      .limit(50);

    if (input.tenant_id) {
      query = query.eq("tenant_id", input.tenant_id);
    }

    const { data: avaliacoes, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Erro ao buscar avaliações: ${fetchErr.message}`);
    if (!avaliacoes?.length) {
      logger.info("csat-enviar-avaliacao: nenhuma avaliação pendente");
      return OutputSchema.parse({ total_processados: 0, enviados: 0, falhas: 0, resultados: [] });
    }

    logger.info(`csat-enviar-avaliacao: ${avaliacoes.length} avaliação(ões) para processar`);

    const resultados: z.infer<typeof ResultItemSchema>[] = [];
    let enviados = 0;
    let falhas   = 0;

    // Agrupa por tenant para reduzir chamadas ao banco
    const porTenant = new Map<string, typeof avaliacoes>();
    for (const av of avaliacoes) {
      const lista = porTenant.get(av.tenant_id) ?? [];
      lista.push(av);
      porTenant.set(av.tenant_id, lista);
    }

    for (const [tenantId, lista] of porTenant) {
      // Buscar configuração do tenant
      const { data: configRows } = await sb
        .from("avaliacao_config")
        .select("csat_auto_envio, csat_mensagem_template")
        .eq("tenant_id", tenantId)
        .limit(1);

      const config = configRows?.[0];
      if (!config?.csat_auto_envio) {
        for (const av of lista) {
          resultados.push({ avaliacao_id: av.id, tenant_id: tenantId, status: "sem_config" });
        }
        continue;
      }

      // Buscar instância Evolution do tenant
      const { data: instRows } = await sb
        .from("evolution_instances")
        .select("evolution_url, api_key, instance_name, status")
        .eq("tenant_id", tenantId)
        .limit(1);

      const inst = instRows?.[0];
      if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
        logger.warn("csat-enviar-avaliacao: sem instância Evolution", { tenantId });
        for (const av of lista) {
          resultados.push({ avaliacao_id: av.id, tenant_id: tenantId, status: "sem_instancia" });
        }
        continue;
      }

      const template = config.csat_mensagem_template ||
        "Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Avalie como foi: {link_avaliacao}";

      for (const av of lista) {
        if (!av.contact_identifier) {
          resultados.push({ avaliacao_id: av.id, tenant_id: tenantId, status: "falhou", detalhe: "sem_contact_identifier" });
          falhas++;
          continue;
        }

        const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${av.public_token}`;
        const text = renderTemplate(template, {
          nome_cliente:   av.nome_cliente || "cliente",
          link_avaliacao: linkAvaliacao,
        });

        const { ok, detail } = await sendEvolutionText(inst, av.contact_identifier, text);
        const statusStr = ok ? "ok" : "falhou";

        const { error: updateErr } = await sb
          .from("atendimento_avaliacoes")
          .update({
            msg_enviada_at:     new Date().toISOString(),
            msg_enviada_status: statusStr,
          })
          .eq("id", av.id);
        if (updateErr) {
          logger.error("csat-enviar: falha ao atualizar msg_enviada", { err: updateErr.message });
        }

        resultados.push({ avaliacao_id: av.id, tenant_id: tenantId, status: ok ? "ok" : "falhou", detalhe: ok ? undefined : String(detail) });
        ok ? enviados++ : falhas++;

        logger.info("csat-enviar-avaliacao: avaliação processada", { id: av.id, status: statusStr });
      }
    }

    const output = OutputSchema.parse({ total_processados: avaliacoes.length, enviados, falhas, resultados });

    await logAgentRun({
      runId:     ctx.run.id,
      agentSlug: "csat-enviar-avaliacao",
      tenantId:  input.tenant_id,
      input,
      output,
      status:    falhas > 0 && enviados === 0 ? "failed" : "success",
    });

    return output;
  },
});

// ─── Cron: safety net a cada 15 minutos ──────────────────────────────────────
// Pega CSATs criados por trigger do banco (origem='interno') que ainda não
// tiveram a mensagem enviada. O webhook do CRM já envia imediatamente;
// este cron é o fallback.

// ⚠️ CRON DESATIVADO (2026-06-26) — incidente de envio em massa.
// Era o sender que ignorava o flag csat_auto_envio. Reativar só após o
// disparo por evento (webhook DataCrazy) estar no ar.
// export const csatEnviarCron = schedules.task({
//   id:   "csat-enviar-avaliacao-cron",
//   cron: "*/15 * * * *",
//   run:  async (_payload, { ctx }) => {
//     logger.info("csat-enviar-avaliacao-cron: disparando task principal");
//     return csatEnviarTask.triggerAndWait({}).unwrap();
//   },
// });
