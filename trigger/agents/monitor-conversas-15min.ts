/**
 * MIA-02: Worker — Monitor IA de Conversas (cron 15min)
 *
 * A cada 15 minutos:
 * 1. Lê vínculos ativos (loja_whatsapp_vinculo onde monitorar=true)
 * 2. Para cada vínculo, busca conversa correspondente em conversations
 * 3. Pula conversas com status='finalizado'
 * 4. Busca mensagens novas desde ultimo_run_em
 * 5. Chama LLM (Ollama Cloud / fallback Anthropic)
 * 6. Insere sugestoes_ia
 * 7. Atualiza ultimo_run_em no vínculo
 * 8. Registra em mia_audit_log
 *
 * Anti-padrões evitados:
 * - ❌ throw no topo do módulo (lazy getters em tudo)
 * - ❌ escrita direta em client_facts/tarefas_loja (só via aprovação humana)
 * - ❌ analisar conversas finalizadas (status='finalizado' ignorado)
 * - ❌ sugestão sem evidencia literal
 */

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { chat } from "./llm-client";
import { MIA_MONITOR_PROMPT } from "./prompts/mia-monitor";

const MAX_MSGS_POR_CHAMADA = 50;
const MIN_MSGS_PARA_ANALISAR = 3;

// ── Schemas de output do LLM ──────────────────────────────────────────────────
interface Fato {
  texto: string;
  evidencia: string;
}

interface TarefaSugerida {
  titulo: string;
  evidencia: string;
  prioridade: "alta" | "media" | "baixa";
  responsavel_sugerido: "consultor" | "cliente" | "indefinido";
}

interface MiaOutput {
  fatos: Fato[];
  tarefas_sugeridas: TarefaSugerida[];
  confianca: "alta" | "media" | "baixa";
}

// ── Validação do output do LLM ────────────────────────────────────────────────
function parseMiaOutput(raw: string): MiaOutput | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw.trim());
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { obj = JSON.parse(match[0]); } catch { return null; }
  }

  if (typeof obj !== "object" || obj === null) return null;
  const r = obj as Record<string, unknown>;

  if (!Array.isArray(r.fatos))           return null;
  if (!Array.isArray(r.tarefas_sugeridas)) return null;
  if (!["alta", "media", "baixa"].includes(r.confianca as string)) return null;

  // Filtra itens sem evidencia (anti-alucinação)
  const fatos = (r.fatos as Fato[]).filter((f) => f.texto && f.evidencia);
  const tarefas = (r.tarefas_sugeridas as TarefaSugerida[]).filter(
    (t) => t.titulo && t.evidencia
  );

  return {
    fatos:             fatos.slice(0, 5),
    tarefas_sugeridas: tarefas.slice(0, 5),
    confianca:         r.confianca as "alta" | "media" | "baixa",
  };
}

// ── Audit helper ──────────────────────────────────────────────────────────────
async function audit(
  sb: ReturnType<typeof getSupabase>,
  vinculo: { id: string; tenant_id: string; loja_id: string; remote_jid: string },
  msgCount: number,
  latenciaMs: number | undefined,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
  modelo: string,
  runId: string,
  sugestoesGeradas: number,
  erro?: string
) {
  await sb.from("mia_audit_log").insert({
    tenant_id:         vinculo.tenant_id,
    loja_id:           vinculo.loja_id,
    vinculo_id:        vinculo.id,
    remote_jid:        vinculo.remote_jid,
    msg_count:         msgCount,
    modelo_usado:      modelo,
    latencia_ms:       latenciaMs ?? null,
    tokens_in:         tokensIn ?? null,
    tokens_out:        tokensOut ?? null,
    sugestoes_geradas: sugestoesGeradas,
    erro:              erro ?? null,
    run_id:            runId,
  });
}

// ── Task principal ────────────────────────────────────────────────────────────
export const monitorConversas15min = schedules.task({
  id:    "mia-monitor-conversas-15min",
  cron:  "*/15 * * * *",
  retry: { maxAttempts: 2 },

  run: async (_payload: unknown, { ctx }) => {
    const sb = getSupabase();
    const runId = ctx.run.id;

    // 1. Lê vínculos ativos
    const { data: vinculos, error: errVinculos } = await sb
      .from("loja_whatsapp_vinculo")
      .select("id, tenant_id, loja_id, remote_jid, tipo, ultimo_run_em")
      .eq("monitorar", true);

    if (errVinculos) {
      logger.error("MIA: erro ao buscar vínculos", { erro: errVinculos.message });
      throw new Error(errVinculos.message);
    }

    if (!vinculos?.length) {
      logger.info("MIA: nenhum vínculo ativo");
      return { vinculos_processados: 0, sugestoes_geradas: 0 };
    }

    logger.info(`MIA: ${vinculos.length} vínculo(s) ativo(s)`);

    let totalSugestoes = 0;

    for (const v of vinculos) {
      let latenciaMs: number | undefined;
      let tokensIn: number | undefined;
      let tokensOut: number | undefined;
      let modelo = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || "kimi-k2.6:cloud";

      try {
        // 2. Verifica se conversa existe e NÃO está finalizada
        const { data: conversa } = await sb
          .from("conversations")
          .select("id, status")
          .eq("remote_jid", v.remote_jid)
          .eq("tenant_id", v.tenant_id)
          .maybeSingle();

        if (!conversa) {
          logger.info(`MIA: sem conversa para jid=${v.remote_jid}`);
          continue;
        }

        // 3. Pula conversas finalizadas
        if (conversa.status === "finalizado") {
          logger.info(`MIA: conversa finalizada, pulando jid=${v.remote_jid}`);
          continue;
        }

        // 4. Busca mensagens novas desde ultimo_run_em
        const since = v.ultimo_run_em
          ? v.ultimo_run_em
          : new Date(Date.now() - 24 * 3600 * 1000).toISOString();

        const { data: msgs } = await sb
          .from("chat_messages")
          .select("id, role, content, created_at, from_jid")
          .eq("conversa_id", conversa.id)
          .gt("created_at", since)
          .order("created_at", { ascending: true })
          .limit(MAX_MSGS_POR_CHAMADA);

        if (!msgs || msgs.length < MIN_MSGS_PARA_ANALISAR) {
          logger.info(`MIA: mensagens insuficientes (${msgs?.length ?? 0}) para jid=${v.remote_jid}`);
          continue;
        }

        // 5. Monta prompt
        const conversaTexto = msgs
          .map((m) => `${m.role === "user" ? "Cliente" : "Consultor"}: ${m.content}`)
          .join("\n");

        // 6. Chama LLM
        const resp = await chat([
          { role: "system", content: MIA_MONITOR_PROMPT },
          { role: "user",   content: conversaTexto },
        ]);

        latenciaMs = resp.latencia_ms;
        tokensIn   = resp.tokens_in;
        tokensOut  = resp.tokens_out;
        modelo     = resp.modelo;

        // 7. Parse + validação
        const parsed = parseMiaOutput(resp.content);
        if (!parsed) {
          logger.error("MIA: JSON inválido ou schema errado", {
            vinculo: v.id,
            preview: resp.content.slice(0, 200),
          });
          await audit(sb, v, msgs.length, latenciaMs, tokensIn, tokensOut, modelo, runId, 0, "json_invalid");
          continue;
        }

        // 8. Insere sugestões
        const sugestoes = [
          ...parsed.fatos.map((f) => ({
            tenant_id:   v.tenant_id,
            loja_id:     v.loja_id,
            conversa_id: conversa.id,
            tipo:        "fact" as const,
            conteudo:    f.texto,
            evidencia:   { trecho: f.evidencia },
            confianca:   parsed.confianca,
            modelo_usado: modelo,
            run_id:      runId,
          })),
          ...parsed.tarefas_sugeridas.map((t) => ({
            tenant_id:   v.tenant_id,
            loja_id:     v.loja_id,
            conversa_id: conversa.id,
            tipo:        "tarefa" as const,
            conteudo:    t.titulo,
            evidencia:   {
              trecho:              t.evidencia,
              prioridade:          t.prioridade,
              responsavel_sugerido: t.responsavel_sugerido,
            },
            confianca:   parsed.confianca,
            modelo_usado: modelo,
            run_id:      runId,
          })),
        ];

        if (sugestoes.length > 0) {
          const { error: errInsert } = await sb.from("sugestoes_ia").insert(sugestoes);
          if (errInsert) {
            logger.error("MIA: erro ao inserir sugestões", { vinculo: v.id, erro: errInsert.message });
            await audit(sb, v, msgs.length, latenciaMs, tokensIn, tokensOut, modelo, runId, 0, errInsert.message);
            continue;
          }
        }

        // 9. Atualiza ultimo_run_em
        await sb
          .from("loja_whatsapp_vinculo")
          .update({ ultimo_run_em: new Date().toISOString() })
          .eq("id", v.id);

        // 10. Audit
        await audit(sb, v, msgs.length, latenciaMs, tokensIn, tokensOut, modelo, runId, sugestoes.length);

        totalSugestoes += sugestoes.length;
        logger.info(`MIA: vínculo ${v.id} processado — ${sugestoes.length} sugestão(ões)`);

      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error("MIA: erro em vínculo", { vinculo: v.id, erro: errMsg });
        await audit(sb, v, 0, latenciaMs, tokensIn, tokensOut, modelo, runId, 0, errMsg.slice(0, 500));
      }
    }

    logger.info("MIA: ciclo concluído", {
      vinculos_processados: vinculos.length,
      sugestoes_geradas:    totalSugestoes,
    });

    return { vinculos_processados: vinculos.length, sugestoes_geradas: totalSugestoes };
  },
});
