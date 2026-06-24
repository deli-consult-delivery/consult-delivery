import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

const ResultItemSchema = z.object({
  nps_id:    z.string().uuid(),
  tenant_id: z.string().uuid(),
  status:    z.enum(["ok", "falhou", "sem_instancia", "sem_config"]),
  detalhe:   z.string().optional(),
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

// ─── Task principal ──────────────────────────────────────────────────────────

/**
 * Busca NPS pendentes de envio (qualquer idade, sem msg_enviada_at) e envia
 * a mensagem WhatsApp de NPS via Evolution API do tenant.
 *
 * O trigger do banco já controla o cooldown de 30 dias ao criar o registro.
 * Esta task apenas envia a mensagem para registros que ainda não foram enviados.
 */
export const npsEnviarTask = task({
  id:    "nps-enviar",
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});
    const sb    = getSupabase();

    logger.info("nps-enviar: iniciando", { tenantId: input.tenant_id });

    let query = sb
      .from("nps_avaliacoes")
      .select("id, tenant_id, public_token, contact_identifier, contact_nome, status")
      .is("msg_enviada_at", null)
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(50);

    if (input.tenant_id) {
      query = query.eq("tenant_id", input.tenant_id);
    }

    const { data: npsList, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Erro ao buscar NPS: ${fetchErr.message}`);
    if (!npsList?.length) {
      logger.info("nps-enviar: nenhum NPS pendente");
      return OutputSchema.parse({ total_processados: 0, enviados: 0, falhas: 0, resultados: [] });
    }

    logger.info(`nps-enviar: ${npsList.length} NPS para processar`);

    const resultados: z.infer<typeof ResultItemSchema>[] = [];
    let enviados = 0;
    let falhas   = 0;

    // Agrupa por tenant
    const porTenant = new Map<string, typeof npsList>();
    for (const nps of npsList) {
      const lista = porTenant.get(nps.tenant_id) ?? [];
      lista.push(nps);
      porTenant.set(nps.tenant_id, lista);
    }

    for (const [tenantId, lista] of porTenant) {
      // Configuração do tenant
      const { data: configRows } = await sb
        .from("avaliacao_config")
        .select("nps_auto_envio, nps_mensagem_template")
        .eq("tenant_id", tenantId)
        .limit(1);

      const config = configRows?.[0];
      if (!config?.nps_auto_envio) {
        for (const nps of lista) {
          resultados.push({ nps_id: nps.id, tenant_id: tenantId, status: "sem_config" });
        }
        continue;
      }

      // Nome da empresa para template
      const { data: tenantRows } = await sb
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .limit(1);
      const nomeEmpresa = tenantRows?.[0]?.name ?? "nossa empresa";

      // Instância Evolution
      const { data: instRows } = await sb
        .from("evolution_instances")
        .select("evolution_url, api_key, instance_name")
        .eq("tenant_id", tenantId)
        .limit(1);

      const inst = instRows?.[0];
      if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
        logger.warn("nps-enviar: sem instância Evolution", { tenantId });
        for (const nps of lista) {
          resultados.push({ nps_id: nps.id, tenant_id: tenantId, status: "sem_instancia" });
        }
        continue;
      }

      const template = config.nps_mensagem_template ||
        "Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}";

      for (const nps of lista) {
        if (!nps.contact_identifier) {
          resultados.push({ nps_id: nps.id, tenant_id: tenantId, status: "falhou", detalhe: "sem_contact_identifier" });
          falhas++;
          continue;
        }

        const linkNps = `${PUBLIC_BASE}/nps/${nps.public_token}`;
        const text = renderTemplate(template, {
          nome_cliente: nps.contact_nome || "cliente",
          nome_empresa: nomeEmpresa,
          link_nps:     linkNps,
        });

        const { ok, detail } = await sendEvolutionText(inst, nps.contact_identifier, text);
        const statusStr = ok ? "ok" : "falhou";

        await sb
          .from("nps_avaliacoes")
          .update({
            msg_enviada_at:     new Date().toISOString(),
            msg_enviada_status: statusStr,
          })
          .eq("id", nps.id)
          .catch((err: unknown) => logger.error("nps-enviar: falha ao atualizar msg_enviada", { err: (err as Error).message }));

        resultados.push({ nps_id: nps.id, tenant_id: tenantId, status: ok ? "ok" : "falhou", detalhe: ok ? undefined : String(detail) });
        ok ? enviados++ : falhas++;

        logger.info("nps-enviar: NPS processado", { id: nps.id, status: statusStr });
      }
    }

    const output = OutputSchema.parse({ total_processados: npsList.length, enviados, falhas, resultados });

    await logAgentRun({
      runId:     ctx.run.id,
      agentSlug: "nps-enviar",
      input,
      output,
      status:    falhas > 0 && enviados === 0 ? "failed" : "success",
    });

    return output;
  },
});

// ─── Cron: a cada hora (NPS tem cooldown de 30 dias, não é urgente) ──────────
export const npsEnviarCron = schedules.task({
  id:   "nps-enviar-cron",
  cron: "0 * * * *",
  run:  async (_payload, { ctx }) => {
    logger.info("nps-enviar-cron: disparando task principal");
    return npsEnviarTask.triggerAndWait({}).unwrap();
  },
});
