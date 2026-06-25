import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:       z.string().uuid().optional(),
  lookback_minutes: z.number().int().min(1).max(60).default(10),
});

const ResultItemSchema = z.object({
  conversation_id: z.string(),
  contact_name:    z.string().optional(),
  status:          z.enum(["ok", "falhou", "sem_config", "ja_processado", "cooldown_ativo"]),
  detalhe:         z.string().optional(),
});

const OutputSchema = z.object({
  total_verificados: z.number().int(),
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

const DATACRAZY_BASE = process.env.DATACRAZY_API_URL || "https://api.g1.datacrazy.io";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

interface DatacrazyConversation {
  id:        string;
  name:      string;
  finished:  boolean;
  updatedAt: string;
  contact?: {
    name:        string;
    phoneNumber: string;
    platform:    string;
  };
}

async function fetchRecentFinishedConversations(
  apiKey: string,
  lookbackMinutes: number
): Promise<DatacrazyConversation[]> {
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
  const url = `${DATACRAZY_BASE}/api/v1/conversations?limit=100&updatedAtStart=${cutoff}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    throw new Error(`Datacrazy API error: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as { data: DatacrazyConversation[] };
  return (data.data ?? []).filter((c) => c.finished === true);
}

async function sendDatacrazyNpsMessage(
  apiKey: string,
  conversationId: string,
  messageBody: string
): Promise<{ ok: boolean; detail?: unknown }> {
  const resp = await fetch(
    `${DATACRAZY_BASE}/api/v1/conversations/${conversationId}/messages`,
    {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ body: messageBody, isInternal: false }),
    }
  );
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, detail: resp.ok ? undefined : body };
}

// ─── Task principal ──────────────────────────────────────────────────────────

/**
 * Polling de conversas finalizadas no Datacrazy CRM para envio de NPS.
 * Roda a cada 30 min, busca conversas finalizadas nos últimos `lookback_minutes`.
 * Verifica cooldown por contato antes de enviar.
 */
export const datacrazyNpsPollerTask = task({
  id:    "datacrazy-nps-poller",
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});
    const sb    = getSupabase();

    logger.info("datacrazy-nps-poller: iniciando", {
      tenantId:        input.tenant_id,
      lookbackMinutes: input.lookback_minutes,
    });

    // ── 1. Carregar configs de tenants com NPS habilitado ────────────────────
    let configQuery = sb
      .from("avaliacao_config")
      .select(
        "tenant_id, nps_auto_envio, nps_mensagem_template, nps_cooldown_dias, datacrazy_api_key, nome_empresa"
      )
      .eq("nps_auto_envio", true)
      .not("datacrazy_api_key", "is", null);

    if (input.tenant_id) {
      configQuery = configQuery.eq("tenant_id", input.tenant_id);
    }

    const { data: configs, error: configErr } = await configQuery;
    if (configErr) throw new Error(`Erro ao buscar configs: ${configErr.message}`);
    if (!configs?.length) {
      logger.info("datacrazy-nps-poller: nenhum tenant com nps_auto_envio + datacrazy_api_key");
      return OutputSchema.parse({ total_verificados: 0, enviados: 0, falhas: 0, resultados: [] });
    }

    const resultados: z.infer<typeof ResultItemSchema>[] = [];
    let totalVerificados = 0;
    let enviados = 0;
    let falhas   = 0;

    for (const config of configs) {
      const tenantId    = config.tenant_id;
      const apiKey      = config.datacrazy_api_key!;
      const cooldownDias = config.nps_cooldown_dias ?? 30;

      // ── 2. Buscar conversas finalizadas recentemente ─────────────────────
      let finishedConvs: DatacrazyConversation[];
      try {
        finishedConvs = await fetchRecentFinishedConversations(apiKey, input.lookback_minutes);
      } catch (err) {
        logger.error("datacrazy-nps-poller: erro ao buscar conversas", {
          tenantId,
          err: (err as Error).message,
        });
        continue;
      }

      totalVerificados += finishedConvs.length;
      logger.info(`datacrazy-nps-poller: ${finishedConvs.length} conv finalizadas (tenant ${tenantId})`);

      for (const conv of finishedConvs) {
        const contactIdentifier = conv.contact?.phoneNumber || conv.id;
        const contactName       = conv.contact?.name || conv.name || null;

        // ── 3. Idempotência: verificar se essa conversa já foi processada ──
        const { data: existingRef } = await sb
          .from("nps_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("external_ref", conv.id)
          .limit(1);

        if (existingRef?.length) {
          resultados.push({ conversation_id: conv.id, status: "ja_processado" });
          continue;
        }

        // ── 4. Verificar cooldown por contato ─────────────────────────────
        const cooldownCutoff = new Date(
          Date.now() - cooldownDias * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: cooldownCheck } = await sb
          .from("nps_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("contact_identifier", contactIdentifier)
          .gte("created_at", cooldownCutoff)
          .limit(1);

        if (cooldownCheck?.length) {
          logger.info("datacrazy-nps-poller: cooldown ativo", {
            convId:    conv.id,
            contato:   contactIdentifier,
            cooldown:  cooldownDias,
          });
          resultados.push({
            conversation_id: conv.id,
            contact_name:    contactName ?? undefined,
            status:          "cooldown_ativo",
            detalhe:         `cooldown de ${cooldownDias} dias ativo`,
          });
          continue;
        }

        // ── 5. Criar registro NPS ─────────────────────────────────────────
        const { data: novaAv, error: insertErr } = await sb
          .from("nps_avaliacoes")
          .insert({
            tenant_id:          tenantId,
            external_ref:       conv.id,
            contact_identifier: contactIdentifier,
            contact_nome:       contactName,
            status:             "pendente",
          })
          .select("id, public_token")
          .single();

        if (insertErr || !novaAv) {
          logger.error("datacrazy-nps-poller: erro ao inserir NPS", {
            convId: conv.id,
            err:    insertErr?.message,
          });
          resultados.push({
            conversation_id: conv.id,
            contact_name:    contactName ?? undefined,
            status:          "falhou",
            detalhe:         insertErr?.message,
          });
          falhas++;
          continue;
        }

        // ── 6. Montar e enviar mensagem NPS ───────────────────────────────
        const linkNps = `${PUBLIC_BASE}/nps/${novaAv.public_token}`;
        const template =
          config.nps_mensagem_template ||
          "Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}";

        const text = renderTemplate(template, {
          nome_cliente: contactName || "cliente",
          link_nps:     linkNps,
          nome_empresa: config.nome_empresa || "nossa empresa",
        });

        const { ok, detail } = await sendDatacrazyNpsMessage(apiKey, conv.id, text);
        const statusStr = ok ? "ok" : "falhou";

        const { error: updErr } = await sb
          .from("nps_avaliacoes")
          .update({
            msg_enviada_at:     new Date().toISOString(),
            msg_enviada_status: statusStr,
          })
          .eq("id", novaAv.id);

        if (updErr) {
          logger.error("datacrazy-nps-poller: erro ao atualizar msg_enviada", {
            err: updErr.message,
          });
        }

        if (!ok) {
          logger.error("datacrazy-nps-poller: falha ao enviar mensagem NPS", {
            convId: conv.id,
            detail,
          });
          falhas++;
        } else {
          enviados++;
        }

        resultados.push({
          conversation_id: conv.id,
          contact_name:    contactName ?? undefined,
          status:          ok ? "ok" : "falhou",
          detalhe:         ok ? undefined : String(detail),
        });

        logger.info("datacrazy-nps-poller: NPS processado", {
          convId: conv.id,
          status: statusStr,
        });
      }
    }

    const output = OutputSchema.parse({
      total_verificados: totalVerificados,
      enviados,
      falhas,
      resultados,
    });

    await logAgentRun({
      runId:     ctx.run.id,
      agentSlug: "datacrazy-nps-poller",
      tenantId:  input.tenant_id,
      input,
      output,
      status:    falhas > 0 && enviados === 0 ? "failed" : "success",
    });

    return output;
  },
});

// ─── Cron: a cada 30 minutos ─────────────────────────────────────────────────
export const datacrazyNpsPollerCron = schedules.task({
  id:   "datacrazy-nps-poller-cron",
  cron: "*/30 * * * *",
  run:  async (_payload, { ctx }) => {
    logger.info("datacrazy-nps-poller-cron: disparando");
    return datacrazyNpsPollerTask.triggerAndWait({ lookback_minutes: 35 }).unwrap();
  },
});
