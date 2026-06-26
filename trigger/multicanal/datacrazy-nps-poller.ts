import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── F1: Snapshot de atendente/duração ───────────────────────────────────────

interface ConversationSnapshot {
  assigned_to:           string | null;
  attending_agent_id:    string | null;
  atendente_nome:        string | null;
  atendimento_inicio_at: string | null;
  atendimento_fim_at:    string | null;
  duracao_minutos:       number | null;
  qtd_mensagens:         number | null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function fetchConversationSnapshot(
  sb: ReturnType<typeof getSupabase>,
  convId: string,
  tenantId: string
): Promise<ConversationSnapshot | null> {
  // Datacrazy conv IDs são strings arbitrárias, não UUIDs do CD.
  // Se não for UUID, não há conversa correspondente na tabela conversations.
  if (!isUuid(convId)) return null;

  const { data: conv } = await (sb as any)
    .from("conversations")
    .select("assigned_to, attending_agent_id, started_at, finished_at, closed_at")
    .eq("id", convId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!conv) return null;

  const fimAt: string | null = conv.finished_at ?? conv.closed_at ?? null;
  let duracao_minutos: number | null = null;
  if (conv.started_at && fimAt) {
    const diffMs = new Date(fimAt).getTime() - new Date(conv.started_at).getTime();
    duracao_minutos = Math.max(0, Math.round(diffMs / 60_000));
  }

  let atendente_nome: string | null = null;
  if (conv.assigned_to) {
    const { data: profile } = await (sb as any)
      .from("profiles")
      .select("full_name")
      .eq("id", conv.assigned_to)
      .limit(1)
      .maybeSingle();
    atendente_nome = (profile as { full_name?: string } | null)?.full_name ?? null;
  }

  const { count: qtdMsg } = await (sb as any)
    .from("whatsapp_messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", convId);

  return {
    assigned_to:           conv.assigned_to ?? null,
    attending_agent_id:    conv.attending_agent_id ?? null,
    atendente_nome,
    atendimento_inicio_at: conv.started_at ?? null,
    atendimento_fim_at:    fimAt,
    duracao_minutos,
    qtd_mensagens:         qtdMsg ?? null,
  };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id:                 z.string().uuid().optional(),
  lookback_minutes:          z.number().int().min(1).max(10).default(7),
  contact_identifier_filter: z.string().optional(),
});

const ResultItemSchema = z.object({
  conversation_id: z.string(),
  contact_name:    z.string().optional(),
  status:          z.enum(["ok", "falhou", "sem_config", "ja_processado", "cooldown_ativo", "filtrado"]),
  tipo:            z.enum(["nps", "csat"]).optional(),
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
    contactId:   string;
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
      tenantId:                input.tenant_id,
      lookbackMinutes:         input.lookback_minutes,
      contactIdentifierFilter: input.contact_identifier_filter,
    });

    // ── 1. Carregar configs de tenants com NPS habilitado ────────────────────
    let configQuery = sb
      .from("avaliacao_config")
      .select(
        "tenant_id, nps_auto_envio, nps_mensagem_template, csat_mensagem_template, nps_cooldown_dias, datacrazy_api_key, nome_empresa, piloto_telefone_teste"
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

      // ── 3. Filtro por contato (para testes isolados) ─────────────────────
      if (input.contact_identifier_filter) {
        const before = finishedConvs.length;
        finishedConvs = finishedConvs.filter(
          (c) =>
            c.contact?.phoneNumber === input.contact_identifier_filter ||
            c.contact?.contactId   === input.contact_identifier_filter
        );
        logger.info("datacrazy-nps-poller: filtro de contato aplicado", {
          tenantId,
          filtro: input.contact_identifier_filter,
          antes:  before,
          depois: finishedConvs.length,
        });
      }

      totalVerificados += finishedConvs.length;
      logger.info(`datacrazy-nps-poller: ${finishedConvs.length} conv finalizadas recentemente (tenant ${tenantId})`);

      for (const conv of finishedConvs) {
        const contactIdentifier = conv.contact?.phoneNumber || conv.id;
        const contactName       = conv.contact?.name || conv.name || null;

        // ── 3b. Whitelist de piloto ───────────────────────────────────────
        // Durante o piloto, só processa conversas do contato de teste.
        // Envia normal via DataCrazy (na própria conversa de teste).
        if (config.piloto_telefone_teste) {
          // Compara pelos últimos 8 dígitos — tolerante à variação do 9º dígito
          // do celular brasileiro (DataCrazy pode guardar com ou sem o 9).
          const sufixo = (s: string) => s.replace(/\D/g, "").slice(-8);
          const alvo  = sufixo(config.piloto_telefone_teste);
          const atual = sufixo(String(contactIdentifier));
          if (!atual || atual !== alvo) {
            resultados.push({
              conversation_id: conv.id,
              contact_name:    contactName ?? undefined,
              status:          "filtrado",
              detalhe:         "fora da whitelist de piloto",
            });
            continue;
          }
        }

        // ── 4. Idempotência: já processada em NPS ou CSAT? ────────────────
        const { data: jaNps } = await sb
          .from("nps_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("external_ref", conv.id)
          .limit(1);

        const { data: jaCsat } = await (sb as any)
          .from("atendimento_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("external_ref", conv.id)
          .limit(1);

        if (jaNps?.length || jaCsat?.length) {
          resultados.push({ conversation_id: conv.id, status: "ja_processado" });
          continue;
        }

        // ── 5. Decisão NPS × CSAT (nunca os dois) ─────────────────────────
        // Cliente recebeu NPS nos últimos `cooldownDias`? Sim → CSAT. Não → NPS.
        const cooldownCutoff = new Date(
          Date.now() - cooldownDias * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: npsRecente } = await sb
          .from("nps_avaliacoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("contact_identifier", contactIdentifier)
          .gte("created_at", cooldownCutoff)
          .limit(1);

        const enviarCsat = (npsRecente?.length ?? 0) > 0;

        if (enviarCsat) {
          // ── 5a. CSAT (pesquisa de atendimento) ──────────────────────────
          const { data: novaCsat, error: csatErr } = await (sb as any)
            .from("atendimento_avaliacoes")
            .insert({
              tenant_id:          tenantId,
              external_ref:       conv.id,
              contact_identifier: contactIdentifier,
              nome_cliente:       contactName,
              origem:             "datacrazy",
              status:             "pendente",
            })
            .select("id, public_token")
            .single();

          if (csatErr || !novaCsat) {
            logger.error("datacrazy-poller: erro ao inserir CSAT", { convId: conv.id, err: csatErr?.message });
            resultados.push({ conversation_id: conv.id, contact_name: contactName ?? undefined, status: "falhou", tipo: "csat", detalhe: csatErr?.message });
            falhas++;
            continue;
          }

          const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${novaCsat.public_token}`;
          const tplCsat = config.csat_mensagem_template ||
            "Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Como foi? Avalie aqui: {link_avaliacao}";
          const textCsat = renderTemplate(tplCsat, {
            nome_cliente:   contactName || "cliente",
            link_avaliacao: linkAvaliacao,
            nome_empresa:   config.nome_empresa || "nossa empresa",
          });

          const { ok, detail } = await sendDatacrazyNpsMessage(apiKey, conv.id, textCsat);
          await (sb as any)
            .from("atendimento_avaliacoes")
            .update({ msg_enviada_at: new Date().toISOString(), msg_enviada_status: ok ? "ok" : "falhou" })
            .eq("id", novaCsat.id);

          if (ok) enviados++; else falhas++;
          resultados.push({ conversation_id: conv.id, contact_name: contactName ?? undefined, status: ok ? "ok" : "falhou", tipo: "csat", detalhe: ok ? undefined : String(detail) });
          logger.info("datacrazy-poller: CSAT processado", { convId: conv.id, status: ok ? "ok" : "falhou" });
          continue;
        }

        // ── 5b. NPS ───────────────────────────────────────────────────────
        // F1: Snapshot de atendente/duração (conv.id não-UUID → snapshot null, ok)
        let snap: ConversationSnapshot | null = null;
        try {
          snap = await fetchConversationSnapshot(sb, conv.id, tenantId);
        } catch (snapErr) {
          logger.warn("datacrazy-poller: erro ao buscar snapshot", { convId: conv.id, err: (snapErr as Error).message });
        }

        const { data: novaAv, error: insertErr } = await sb
          .from("nps_avaliacoes")
          .insert({
            tenant_id:             tenantId,
            external_ref:          conv.id,
            contact_identifier:    contactIdentifier,
            contact_nome:          contactName,
            status:                "pendente",
            atendente_nome:        snap?.atendente_nome ?? null,
            assigned_to:           snap?.assigned_to ?? null,
            agent_id:              snap?.attending_agent_id ?? null,
            atendimento_inicio_at: snap?.atendimento_inicio_at ?? null,
            atendimento_fim_at:    snap?.atendimento_fim_at ?? null,
            duracao_minutos:       snap?.duracao_minutos ?? null,
            qtd_mensagens:         snap?.qtd_mensagens ?? null,
          } as any)
          .select("id, public_token")
          .single();

        if (insertErr || !novaAv) {
          logger.error("datacrazy-poller: erro ao inserir NPS", { convId: conv.id, err: insertErr?.message });
          resultados.push({ conversation_id: conv.id, contact_name: contactName ?? undefined, status: "falhou", tipo: "nps", detalhe: insertErr?.message });
          falhas++;
          continue;
        }

        const linkNps = `${PUBLIC_BASE}/nps/${novaAv.public_token}`;
        const tplNps =
          config.nps_mensagem_template ||
          "Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}";
        const textNps = renderTemplate(tplNps, {
          nome_cliente: contactName || "cliente",
          link_nps:     linkNps,
          nome_empresa: config.nome_empresa || "nossa empresa",
        });

        const { ok, detail } = await sendDatacrazyNpsMessage(apiKey, conv.id, textNps);
        await sb
          .from("nps_avaliacoes")
          .update({ msg_enviada_at: new Date().toISOString(), msg_enviada_status: ok ? "ok" : "falhou" })
          .eq("id", novaAv.id);

        if (ok) enviados++; else falhas++;
        resultados.push({ conversation_id: conv.id, contact_name: contactName ?? undefined, status: ok ? "ok" : "falhou", tipo: "nps", detalhe: ok ? undefined : String(detail) });
        logger.info("datacrazy-poller: NPS processado", { convId: conv.id, status: ok ? "ok" : "falhou" });
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

// Cron: a cada 5 min, janela de 7 min — só pega conversas finalizadas agora
export const datacrazyNpsPollerCron = schedules.task({
  id:   "datacrazy-nps-poller-cron",
  cron: "*/5 * * * *",
  run:  async (_payload, { ctx }) => {
    logger.info("datacrazy-nps-poller-cron: disparando", { runId: ctx.run.id });
    return datacrazyNpsPollerTask.triggerAndWait({ lookback_minutes: 7 }).unwrap();
  },
});
