import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  lookback_minutes: z.number().int().min(1).max(60).default(10),
});

const ResultItemSchema = z.object({
  conversation_id: z.string(),
  contact_name:    z.string().optional(),
  status:          z.enum(["ok", "falhou", "sem_config", "ja_processado"]),
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
  id:         string;
  name:       string;
  finished:   boolean;
  updatedAt:  string;
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

async function sendDatacrazyCsatMessage(
  apiKey: string,
  conversationId: string,
  messageBody: string
): Promise<{ ok: boolean; detail?: unknown }> {
  const resp = await fetch(
    `${DATACRAZY_BASE}/api/v1/conversations/${conversationId}/messages`,
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ body: messageBody, isInternal: false }),
    }
  );
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, detail: resp.ok ? undefined : body };
}

// ─── Task principal ──────────────────────────────────────────────────────────

/**
 * Polling de conversas finalizadas no Datacrazy CRM.
 * Roda a cada 5 min, busca conversas finalizadas nos últimos `lookback_minutes`
 * e envia CSAT para as que ainda não foram processadas.
 */
export const datacrazyCsatPollerTask = task({
  id:    "datacrazy-csat-poller",
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});
    const sb    = getSupabase();

    logger.info("datacrazy-csat-poller: iniciando", {
      tenantId:        input.tenant_id,
      lookbackMinutes: input.lookback_minutes,
    });

    // ── 1. Carregar config do tenant ─────────────────────────────────────────
    let configQuery = sb
      .from("avaliacao_config")
      .select("tenant_id, csat_auto_envio, csat_mensagem_template, datacrazy_api_key, nome_empresa")
      .eq("csat_auto_envio", true)
      .not("datacrazy_api_key", "is", null);

    if (input.tenant_id) {
      configQuery = configQuery.eq("tenant_id", input.tenant_id);
    }

    const { data: configs, error: configErr } = await configQuery;
    if (configErr) throw new Error(`Erro ao buscar configs: ${configErr.message}`);
    if (!configs?.length) {
      logger.info("datacrazy-csat-poller: nenhum tenant com csat_auto_envio + datacrazy_api_key");
      return OutputSchema.parse({ total_verificados: 0, enviados: 0, falhas: 0, resultados: [] });
    }

    const resultados: z.infer<typeof ResultItemSchema>[] = [];
    let totalVerificados = 0;
    let enviados = 0;
    let falhas   = 0;

    for (const config of configs) {
      const tenantId = config.tenant_id;
      const apiKey   = config.datacrazy_api_key!;

      // ── 2. Buscar conversas finalizadas recentemente ─────────────────────
      let finishedConvs: DatacrazyConversation[];
      try {
        finishedConvs = await fetchRecentFinishedConversations(apiKey, input.lookback_minutes);
      } catch (err) {
        logger.error("datacrazy-csat-poller: erro ao buscar conversas", {
          tenantId,
          err: (err as Error).message,
        });
        continue;
      }

      totalVerificados += finishedConvs.length;
      logger.info(`datacrazy-csat-poller: ${finishedConvs.length} conv finalizadas (tenant ${tenantId})`);

      for (const conv of finishedConvs) {
        // ── 3. Idempotência: verificar se já foi processada ────────────────
        const { data: existing } = await sb
          .from("atendimento_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("external_ref", conv.id)
          .limit(1);

        if (existing?.length) {
          resultados.push({ conversation_id: conv.id, status: "ja_processado" });
          continue;
        }

        // ── 4. Criar registro CSAT ─────────────────────────────────────────
        const contactName = conv.contact?.name || conv.name || null;
        const { data: novaAv, error: insertErr } = await sb
          .from("atendimento_avaliacoes")
          .insert({
            tenant_id:          tenantId,
            external_ref:       conv.id,
            contact_identifier: conv.id,
            nome_cliente:       contactName,
            origem:             "datacrazy",
            status:             "pendente",
          })
          .select("id, public_token")
          .single();

        if (insertErr || !novaAv) {
          logger.error("datacrazy-csat-poller: erro ao inserir avaliação", {
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

        // ── 5. Enviar mensagem CSAT ────────────────────────────────────────
        const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${novaAv.public_token}`;
        const template = config.csat_mensagem_template ||
          "Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Como foi? Avalie aqui: {link_avaliacao}";

        const text = renderTemplate(template, {
          nome_cliente:   contactName || "cliente",
          link_avaliacao: linkAvaliacao,
          nome_empresa:   config.nome_empresa || "nossa empresa",
        });

        const { ok, detail } = await sendDatacrazyCsatMessage(apiKey, conv.id, text);
        const statusStr = ok ? "ok" : "falhou";

        const { error: updErr } = await sb
          .from("atendimento_avaliacoes")
          .update({
            msg_enviada_at:     new Date().toISOString(),
            msg_enviada_status: statusStr,
          })
          .eq("id", novaAv.id);

        if (updErr) {
          logger.error("datacrazy-csat-poller: erro ao atualizar msg_enviada", { err: updErr.message });
        }

        if (!ok) {
          logger.error("datacrazy-csat-poller: falha ao enviar mensagem", { convId: conv.id, detail });
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

        logger.info("datacrazy-csat-poller: CSAT processado", { convId: conv.id, status: statusStr });
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
      agentSlug: "datacrazy-csat-poller",
      tenantId:  input.tenant_id,
      input,
      output,
      status:    falhas > 0 && enviados === 0 ? "failed" : "success",
    });

    return output;
  },
});

// ─── Cron: a cada 5 minutos ──────────────────────────────────────────────────
export const datacrazyCsatPollerCron = schedules.task({
  id:   "datacrazy-csat-poller-cron",
  cron: "*/5 * * * *",
  run:  async (_payload, { ctx }) => {
    logger.info("datacrazy-csat-poller-cron: disparando");
    return datacrazyCsatPollerTask.triggerAndWait({ lookback_minutes: 10 }).unwrap();
  },
});
