import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Régua de reengajamento CSAT ────────────────────────────────────────────
// Detecta atendimento_avaliacoes enviadas há N dias sem resposta e gera
// 1 draft de lembrete por pesquisa (nunca envia direto — DRAFTS/CLAUDE.md).

export const REENGAJAMENTO_DIAS_MIN = 3;

// Marca a própria avaliação como já reengajada e é EXCLUÍDA na query fonte —
// sem isso, limit(50) + dedup só em memória faz starvation: as mesmas 50 linhas
// mais antigas (order by msg_enviada_at asc) voltam todo dia como "ja_reengajado"
// e o resto da fila nunca é varrido em volume alto (ex. ~1000 pendentes).
export const MSG_STATUS_REENGAJADO = "reengajado";

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  "https://app.consultdelivery.com.br";

const TEMPLATE_PADRAO =
  "Oi {nome_cliente}! 😊 Vimos que você ainda não avaliou seu último atendimento. Leva menos de 1 minuto e ajuda muito a gente: {link_avaliacao}";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface AvaliacaoCandidata {
  id: string;
  tenant_id: string;
  status: string;
  msg_enviada_at: string | null;
  public_token: string;
  public_token_expires_at: string | null;
  nome_cliente: string | null;
  contact_identifier?: string | null;
  ticket_code?: number | null;
  msg_enviada_status?: string | null;
}

// ─── Schemas ──────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

const ResultItemSchema = z.object({
  avaliacao_id: z.string(),
  tenant_id: z.string(),
  status: z.enum(["draft_criado", "ja_reengajado", "nao_elegivel", "falhou"]),
  detalhe: z.string().optional(),
});

const OutputSchema = z.object({
  total_candidatos: z.number().int(),
  drafts_criados: z.number().int(),
  pulados: z.number().int(),
  falhas: z.number().int(),
  resultados: z.array(ResultItemSchema),
});

// ─── Decisão pura (testável sem rede — ver csat-reengajamento.test.ts) ──────

export type MotivoDecisao =
  | "elegivel"
  | "ja_respondida_ou_expirada"
  | "sem_envio"
  | "dentro_do_prazo"
  | "ja_reengajado";

export interface DecisaoReengajamento {
  criar: boolean;
  motivo: MotivoDecisao;
}

/**
 * Regra de reengajamento: pendente + enviada há >= diasMin + token ainda válido
 * + nunca reengajada antes (máx 1 por pesquisa — precedente do bug #526 de heartbeat).
 */
export function decidirReengajamento(
  av: Pick<
    AvaliacaoCandidata,
    "status" | "msg_enviada_at" | "public_token_expires_at" | "msg_enviada_status"
  >,
  agora: Date,
  jaReengajado: boolean,
  diasMin: number = REENGAJAMENTO_DIAS_MIN
): DecisaoReengajamento {
  if (av.status !== "pendente") return { criar: false, motivo: "ja_respondida_ou_expirada" };
  if (av.public_token_expires_at && new Date(av.public_token_expires_at) <= agora) {
    return { criar: false, motivo: "ja_respondida_ou_expirada" };
  }
  if (!av.msg_enviada_at) return { criar: false, motivo: "sem_envio" };

  const diasPassados = (agora.getTime() - new Date(av.msg_enviada_at).getTime()) / 86_400_000;
  if (diasPassados < diasMin) return { criar: false, motivo: "dentro_do_prazo" };

  // Fonte de verdade é msg_enviada_status='reengajado' (persistido na própria linha,
  // já excluído na query fonte); jaReengajado cobre o retry-safety-net via agent_drafts.
  if (av.msg_enviada_status === MSG_STATUS_REENGAJADO || jaReengajado) {
    return { criar: false, motivo: "ja_reengajado" };
  }

  return { criar: true, motivo: "elegivel" };
}

export function montarMensagemReengajamento(
  av: Pick<AvaliacaoCandidata, "nome_cliente" | "public_token">,
  publicBase: string = PUBLIC_BASE
): string {
  const link = `${publicBase}/avaliacao/${av.public_token}`;
  return renderTemplate(TEMPLATE_PADRAO, {
    nome_cliente: av.nome_cliente || "cliente",
    link_avaliacao: link,
  });
}

// ─── Task (cron diário — safety net, dispara via trigger.dev deploy) ───────

export const laraCsatReengajamento = schedules.task({
  id: "lara-csat-reengajamento",
  cron: "0 14 * * *", // 11h BRT
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload ?? {});
    const sb = getSupabase();
    const agora = new Date();

    logger.info("lara-csat-reengajamento: iniciando", { tenantId: input.tenant_id });

    const cutoff = new Date(agora.getTime() - REENGAJAMENTO_DIAS_MIN * 86_400_000).toISOString();

    let query = sb
      .from("atendimento_avaliacoes")
      .select(
        "id, tenant_id, status, msg_enviada_at, msg_enviada_status, public_token, public_token_expires_at, nome_cliente, contact_identifier, ticket_code"
      )
      .eq("status", "pendente")
      .not("msg_enviada_at", "is", null)
      .lte("msg_enviada_at", cutoff)
      .gt("public_token_expires_at", agora.toISOString())
      // Exclui quem já foi reengajado — sem isso, order+limit sempre refaz a
      // mesma janela das 50 mais antigas e o restante da fila nunca é varrido.
      .neq("msg_enviada_status", MSG_STATUS_REENGAJADO)
      .order("msg_enviada_at", { ascending: true })
      .limit(50);

    if (input.tenant_id) query = query.eq("tenant_id", input.tenant_id);

    const { data: candidatos, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Erro ao buscar avaliações elegíveis: ${fetchErr.message}`);

    if (!candidatos?.length) {
      logger.info("lara-csat-reengajamento: nenhuma avaliação elegível");
      const output = OutputSchema.parse({
        total_candidatos: 0,
        drafts_criados: 0,
        pulados: 0,
        falhas: 0,
        resultados: [],
      });
      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "lara-csat-reengajamento",
        input,
        output,
        tenantId: input.tenant_id,
        status: "success",
      });
      return output;
    }

    const resultados: z.infer<typeof ResultItemSchema>[] = [];
    let draftsCriados = 0;
    let pulados = 0;
    let falhas = 0;

    for (const av of candidatos as AvaliacaoCandidata[]) {
      // Dedup: já existe reengajamento gerado para esta avaliação (qualquer status do draft)?
      // Retry-safety-net do msg_enviada_status (ex.: draft criado mas a marcação da linha
      // falhou antes de terminar o run). Erro transitório aqui NUNCA deve ser tratado como
      // "não existe" — fail-open criaria um 2º draft; classifica como falha e não prossegue.
      const { data: existente, error: dedupErr } = await sb
        .from("agent_drafts")
        .select("id")
        .eq("agent_name", "lara")
        .filter("metadata->>avaliacao_id", "eq", av.id)
        .filter("metadata->>tipo", "eq", "csat_reengajamento")
        .limit(1)
        .maybeSingle();

      if (dedupErr) {
        logger.error("lara-csat-reengajamento: falha ao checar dedup", {
          avaliacaoId: av.id,
          err: dedupErr.message,
        });
        falhas++;
        resultados.push({
          avaliacao_id: av.id,
          tenant_id: av.tenant_id,
          status: "falhou",
          detalhe: `dedup_check_falhou: ${dedupErr.message}`,
        });
        continue;
      }

      const decisao = decidirReengajamento(av, agora, !!existente);

      if (!decisao.criar) {
        pulados++;
        resultados.push({
          avaliacao_id: av.id,
          tenant_id: av.tenant_id,
          status: decisao.motivo === "ja_reengajado" ? "ja_reengajado" : "nao_elegivel",
          detalhe: decisao.motivo,
        });
        continue;
      }

      const diasSemResposta = Math.floor(
        (agora.getTime() - new Date(av.msg_enviada_at!).getTime()) / 86_400_000
      );
      const content = montarMensagemReengajamento(av);

      const { error: draftErr } = await sb.from("agent_drafts").insert({
        tenant_id: av.tenant_id,
        agent_name: "lara",
        channel: "whatsapp",
        target_id: av.contact_identifier ?? null,
        subject: `Reengajamento CSAT — ${av.nome_cliente || "cliente"}`,
        content,
        status: "pending",
        autonomy_level: "amarelo",
        metadata: {
          tipo: "csat_reengajamento",
          avaliacao_id: av.id,
          dias_sem_resposta: diasSemResposta,
          ticket_code: av.ticket_code ?? null,
          run_id: ctx.run.id,
        },
      });

      if (draftErr) {
        logger.error("lara-csat-reengajamento: falha ao criar draft", {
          avaliacaoId: av.id,
          err: draftErr.message,
        });
        falhas++;
        resultados.push({
          avaliacao_id: av.id,
          tenant_id: av.tenant_id,
          status: "falhou",
          detalhe: draftErr.message,
        });
        continue;
      }

      // Marca a linha como reengajada para sair da query fonte nas próximas execuções
      // (fix de starvation — ver comentário na query acima). Falha aqui não desfaz o
      // draft: o dedup via agent_drafts acima cobre esse caso na próxima execução.
      const { error: marcarErr } = await sb
        .from("atendimento_avaliacoes")
        .update({ msg_enviada_status: MSG_STATUS_REENGAJADO })
        .eq("id", av.id);
      if (marcarErr) {
        logger.error("lara-csat-reengajamento: falha ao marcar avaliação como reengajada", {
          avaliacaoId: av.id,
          err: marcarErr.message,
        });
      }

      draftsCriados++;
      resultados.push({ avaliacao_id: av.id, tenant_id: av.tenant_id, status: "draft_criado" });
      logger.info("lara-csat-reengajamento: draft criado", { avaliacaoId: av.id, diasSemResposta });
    }

    const output = OutputSchema.parse({
      total_candidatos: candidatos.length,
      drafts_criados: draftsCriados,
      pulados,
      falhas,
      resultados,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "lara-csat-reengajamento",
      input,
      output,
      tenantId: input.tenant_id,
      status: falhas > 0 && draftsCriados === 0 ? "failed" : "success",
    });

    return output;
  },
});
