import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";
import { notifyDeli } from "../_shared/notify-deli";

// =====================================================
// AGENTE DEFESA — F1 (D6 aprovada 2026-06-07)
// Recebe um caso (cancelamento ou avaliação), analisa,
// escreve a contestação/resposta e grava em defesa_casos
// com status 'aguardando_ok'. NUNCA envia nada — copiloto.
// PR5: também cria draft no fluxo oficial (agent_drafts),
// notifica no sino e no feed da DELI.
// =====================================================

const DefesaAnalisarInput = z.object({
  tenant_id:      z.string().uuid(),
  loja_id:        z.string().uuid().optional(),
  canal:          z.string().default("ifood"),
  tipo:           z.enum(["cancelamento", "avaliacao"]),
  pedido_ref:     z.string().optional(),
  valor_centavos: z.number().int().min(0).default(0),
  motivo:         z.string().min(5),          // o que aconteceu, na visão do lojista/plataforma
  contexto:       z.string().optional(),      // evidências, histórico, prints transcritos etc.
  loja_nome:      z.string().optional(),
  triggered_by:   z.string().uuid().optional(),
});

const AnaliseClaudeSchema = z.object({
  chance_vitoria: z.enum(["alta", "media", "baixa"]),
  fundamentos:    z.array(z.string()).min(1),
  pontos_fracos:  z.array(z.string()),
  recomendacao:   z.enum(["contestar", "responder", "nao_contestar"]),
  draft_resposta: z.string().min(20),
});

const DefesaAnalisarOutput = z.object({
  ok:             z.boolean(),
  caso_id:        z.string().uuid(),
  status:         z.string(),
  chance_vitoria: z.string(),
  recomendacao:   z.string(),
});

type Input = z.infer<typeof DefesaAnalisarInput>;

const SYSTEM_PROMPT = `Você é o agente DEFESA da Consult Delivery — especialista em defesa comercial de restaurantes em marketplaces de delivery (iFood e similares).

Sua função: analisar um caso (cancelamento de pedido ou avaliação negativa) e preparar a melhor peça de defesa possível. Você NUNCA envia nada — um humano revisa e aprova.

Para CANCELAMENTO (contestação ao marketplace):
- Avalie a chance de reversão com base nas regras usuais (preparo já iniciado, evidência fotográfica inconsistente, padrão de golpe do estorno, cancelamento fora de prazo).
- Escreva a contestação formal: objetiva, com fatos verificáveis (horários, registros), pedido de estorno com valor exato, tom profissional.

Para AVALIAÇÃO (resposta pública ao cliente):
- A resposta protege o ranking e a conversão: empática, específica ao caso, sem confronto, com convite a voltar.
- Quando a falha não foi da loja (ex.: atraso do entregador do app), esclareça com elegância, sem atacar a plataforma.

Regras de linguagem (Brand Guard):
- Português brasileiro, profissional e direto. Zero emoji.
- Use "oferta", nunca "promoção".
- Nunca prometa o que a loja não confirmou (cortesias só se mencionadas no contexto).

Responda APENAS com JSON válido neste formato:
{
  "chance_vitoria": "alta" | "media" | "baixa",
  "fundamentos": ["fato/argumento 1", "..."],
  "pontos_fracos": ["fragilidade do caso, se houver"],
  "recomendacao": "contestar" | "responder" | "nao_contestar",
  "draft_resposta": "texto pronto para o humano aprovar e enviar"
}`;

export const defesaAnalisarCaso = task({
  id: "defesa-analisar-caso",
  retry: { maxAttempts: 3 },
  run: async (payload: unknown, { ctx }) => {
    const t0 = Date.now();
    const input: Input = DefesaAnalisarInput.parse(payload);

    logger.info("DEFESA — caso recebido", { tipo: input.tipo, tenant: input.tenant_id });

    const valorReais = (input.valor_centavos / 100).toFixed(2);
    const userPrompt = [
      `TIPO DO CASO: ${input.tipo}`,
      `CANAL: ${input.canal}`,
      input.loja_nome ? `LOJA: ${input.loja_nome}` : null,
      input.pedido_ref ? `PEDIDO: ${input.pedido_ref}` : null,
      input.valor_centavos > 0 ? `VALOR EM DISPUTA: R$ ${valorReais}` : null,
      `O QUE ACONTECEU: ${input.motivo}`,
      input.contexto ? `CONTEXTO/EVIDÊNCIAS: ${input.contexto}` : null,
    ].filter(Boolean).join("\n");

    // Chamada direta ao SDK para capturar usage (custo real no logAgentRun)
    const client = getAnthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const analise = AnaliseClaudeSchema.parse(JSON.parse(cleaned));

    // Custo aproximado claude-sonnet-4-6: $3/Mtok in, $15/Mtok out
    const costUsd =
      (response.usage.input_tokens / 1_000_000) * 3 +
      (response.usage.output_tokens / 1_000_000) * 15;

    // Grava o caso aguardando aprovação humana (service role)
    const { data: caso, error } = await getSupabase()
      .from("defesa_casos")
      .insert({
        tenant_id: input.tenant_id,
        loja_id: input.loja_id ?? null,
        canal: input.canal,
        tipo: input.tipo,
        pedido_ref: input.pedido_ref ?? null,
        valor_centavos: input.valor_centavos,
        motivo: input.motivo,
        analise: {
          chance_vitoria: analise.chance_vitoria,
          fundamentos: analise.fundamentos,
          pontos_fracos: analise.pontos_fracos,
          recomendacao: analise.recomendacao,
          loja_nome: input.loja_nome ?? null,
        },
        draft_resposta: analise.draft_resposta,
        status: "aguardando_ok",
        criado_por_agente: "defesa",
      })
      .select("id, status")
      .single();
    if (error) throw new Error(`defesa_casos insert falhou: ${error.message}`);

    // PR5 — fluxo oficial de aprovação: draft no painel (Disparos) + sino + feed DELI.
    // Soft-fail: o caso em defesa_casos é a fonte de verdade.
    const tituloCurto = `Defesa — ${input.tipo}${input.pedido_ref ? ` ${input.pedido_ref}` : ""}${input.valor_centavos > 0 ? ` (R$ ${valorReais})` : ""}`;
    try {
      await getSupabase().from("agent_drafts").insert({
        tenant_id: input.tenant_id,
        agent_name: "defesa",
        channel: "painel",
        loja_id: input.loja_id ?? null,
        subject: tituloCurto,
        content: analise.draft_resposta,
        status: "pending",
        autonomy_level: "amarelo",
        reasoning: analise.fundamentos.join(" · "),
        metadata: {
          caso_id: caso.id,
          tipo: input.tipo,
          canal: input.canal,
          valor_centavos: input.valor_centavos,
          chance_vitoria: analise.chance_vitoria,
          recomendacao: analise.recomendacao,
        },
      });
    } catch (err) {
      logger.warn("DEFESA — agent_drafts falhou (caso segue em defesa_casos)", { erro: (err as Error).message });
    }
    await notify({
      tenantId: input.tenant_id,
      kind: "draft_pending",
      agent: "defesa",
      title: `${tituloCurto} — aguardando seu OK`,
      body: `Chance de vitória: ${analise.chance_vitoria}. Recomendação: ${analise.recomendacao}. Revise no Console v2 › Defesa Comercial.`,
      metadata: { caso_id: caso.id },
    });
    await notifyDeli({
      tenantId: input.tenant_id,
      content: `DEFESA preparou um caso (${input.tipo}${input.pedido_ref ? ` ${input.pedido_ref}` : ""}): chance de vitória ${analise.chance_vitoria}, recomendação ${analise.recomendacao}. Aguardando OK humano na fila da Defesa.`,
      sourceAgent: "defesa",
      sourceTask: "defesa-analisar-caso",
      runId: ctx.run.id,
    });

    const durationMs = Date.now() - t0;
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "defesa",
      input: { tipo: input.tipo, canal: input.canal, pedido_ref: input.pedido_ref ?? null, valor_centavos: input.valor_centavos },
      output: { caso_id: caso.id, chance_vitoria: analise.chance_vitoria, recomendacao: analise.recomendacao },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs,
      costUsd,
      status: "success",
    });

    logger.info("DEFESA — caso preparado", { caso_id: caso.id, chance: analise.chance_vitoria, custo_usd: costUsd });

    return DefesaAnalisarOutput.parse({
      ok: true,
      caso_id: caso.id,
      status: caso.status,
      chance_vitoria: analise.chance_vitoria,
      recomendacao: analise.recomendacao,
    });
  },
});
