import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { buildLojaContexto } from "../_shared/loja-contexto";
import { calcularCustoUsd } from "../_shared/pricing";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  analise_id: z.string().uuid(),
});

const TarefaItemSchema = z.object({
  bloco: z.enum([
    "identidade",
    "cardapio",
    "operacao",
    "avaliacoes",
    "marketing",
    "suporte",
  ]),
  ordem: z.number().int().min(1),
  titulo: z.string().min(3),
  situacao: z.string().min(3),
  o_que_sera_feito: z.string().min(3),
  prioridade: z
    .enum(["quick_win", "estrutural", "material_cliente"])
    .default("estrutural"),
});

const ClaudeOutputSchema = z.object({
  relatorio_markdown: z.string().min(50),
  resumo_executivo: z.string().min(10),
  tarefas: z.array(TarefaItemSchema).min(5),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  analise_id: z.string().uuid(),
  tarefas_geradas: z.number().int(),
  relatorio_markdown: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ── Task ──────────────────────────────────────────────────────────────────────

export const analiseGerarRelatorio = task({
  id: "analise-gerar-relatorio",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);
    const startedAt = Date.now();

    logger.info("Iniciando analise-gerar-relatorio", {
      analise_id: input.analise_id,
    });

    const sb = getSupabase();

    // ── 1. Buscar análise ────────────────────────────────────────────────────
    const { data: analise, error: analiseError } = await sb
      .from("analises")
      .select("id, loja_id, transcricao, tipo, criado_por")
      .eq("id", input.analise_id)
      .single();

    if (analiseError || !analise) {
      throw new Error(
        `Análise não encontrada: ${input.analise_id}${analiseError ? ` — ${analiseError.message}` : ""}`
      );
    }

    if (!analise.transcricao || analise.transcricao.trim() === "") {
      throw new Error("transcricao ausente — não é possível gerar relatório sem transcrição");
    }

    const { loja_id, transcricao, criado_por } = analise as {
      loja_id: string;
      transcricao: string;
      criado_por: string | null;
      tipo: string | null;
    };

    // ── 2. Obter tenant_id da loja ───────────────────────────────────────────
    const { data: lojaRow, error: lojaError } = await sb
      .from("lojas")
      .select("tenant_id")
      .eq("id", loja_id)
      .single();

    if (lojaError || !lojaRow) {
      throw new Error(
        `Loja não encontrada para analise ${input.analise_id}: ${lojaError?.message ?? "sem resultado"}`
      );
    }

    const tenant_id: string = lojaRow.tenant_id;

    // ── 3. Montar contexto da loja ───────────────────────────────────────────
    logger.info("Carregando contexto da loja", { loja_id, tenant_id });
    const contexto = await buildLojaContexto(loja_id);

    // ── 4. Marcar análise como processando ───────────────────────────────────
    await sb
      .from("analises")
      .update({ status: "processando" })
      .eq("id", input.analise_id);

    // ── 5. Construir prompts ─────────────────────────────────────────────────
    const systemPrompt = `Você é um consultor especialista em food delivery da Consult Delivery.
Sua tarefa: analisar a transcrição de uma reunião de consultoria com uma loja do iFood e gerar:
1. Um relatório executivo em Markdown (3-5 parágrafos, máximo 600 palavras)
2. Um resumo_executivo curto (2-3 frases para enviar via WhatsApp)
3. Uma lista estruturada de tarefas de melhoria organizadas em 6 blocos

Blocos disponíveis: identidade, cardapio, operacao, avaliacoes, marketing, suporte
Prioridades disponíveis: quick_win (resultado rápido), estrutural (base importante), material_cliente (entregável para cliente)

Retorne SOMENTE o JSON abaixo:
{
  "relatorio_markdown": "...",
  "resumo_executivo": "...",
  "tarefas": [
    {
      "bloco": "identidade",
      "ordem": 1,
      "titulo": "Atualizar foto de capa",
      "situacao": "Foto atual está desatualizada",
      "o_que_sera_feito": "Nova foto profissional com branding atualizado",
      "prioridade": "quick_win"
    }
  ]
}
Gere pelo menos 10 tarefas distribuídas nos blocos relevantes.`;

    const metricaStr = contexto.ultima_metrica
      ? `Pedidos (30d): ${contexto.ultima_metrica.pedidos_30d ?? "N/D"} | Nota: ${contexto.ultima_metrica.nota_media ?? "N/D"} | Ticket médio: R$ ${contexto.ultima_metrica.ticket_medio ?? "N/D"} | Taxa cancelamento: ${contexto.ultima_metrica.taxa_cancelamento ?? "N/D"}%`
      : "Métricas não disponíveis";

    const userPrompt = `Loja: ${contexto.loja.nome}
Segmento: ${contexto.loja.segmento ?? "N/D"}
Cidade: ${contexto.loja.cidade ?? "N/D"}
Ticket médio: R$ ${contexto.loja.ticket_medio ?? "N/D"}
Métricas recentes: ${metricaStr}

Transcrição da reunião de consultoria:
${transcricao}

Gere o relatório, resumo executivo e lista de tarefas conforme instruído.`;

    // ── 6. Chamar Anthropic diretamente ─────────────────────────────────────
    logger.info("Chamando Claude para gerar relatório", { analise_id: input.analise_id });

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    let costUsd = calcularCustoUsd("claude-sonnet-4-6", response.usage) ?? 0;

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    if (!rawText) {
      throw new Error("Claude retornou resposta sem bloco de texto");
    }

    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    logger.info("Parseando output do Claude", { analise_id: input.analise_id });

    let parsedClaude: z.infer<typeof ClaudeOutputSchema>;
    try {
      const json = JSON.parse(cleaned);
      parsedClaude = ClaudeOutputSchema.parse(json);
    } catch (parseErr) {
      // 1 retry de correção com instrução explícita
      logger.warn("Falha ao validar output do Claude — tentando correção", {
        error: (parseErr as Error).message,
      });

      const fixResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: rawText },
          {
            role: "user",
            content: `O JSON retornado não passou na validação: ${(parseErr as Error).message}. Por favor, corrija e retorne SOMENTE o JSON válido, sem nenhum texto adicional, sem blocos de código markdown.`,
          },
        ],
      });

      costUsd += calcularCustoUsd("claude-sonnet-4-6", fixResponse.usage) ?? 0;

      const fixBlock = fixResponse.content.find((b) => b.type === "text");
      const fixText = fixBlock && fixBlock.type === "text" ? fixBlock.text : "";
      const fixCleaned = fixText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      const fixJson = JSON.parse(fixCleaned);
      parsedClaude = ClaudeOutputSchema.parse(fixJson);
    }

    // ── 7. Inserir tarefas em batch ──────────────────────────────────────────
    logger.info("Inserindo tarefas na tabela tarefas_loja", {
      quantidade: parsedClaude.tarefas.length,
    });

    const tarefasPayload = parsedClaude.tarefas.map((tarefa) => ({
      loja_id,
      analise_id: input.analise_id,
      bloco: tarefa.bloco,
      ordem_no_bloco: tarefa.ordem,
      titulo: tarefa.titulo,
      situacao: tarefa.situacao,
      o_que_sera_feito: tarefa.o_que_sera_feito,
      prioridade: tarefa.prioridade ?? "estrutural",
      status: "rascunho",
      created_by: criado_por,
    }));

    const { data: tarefasInseridas, error: tarefasError } = await sb
      .from("tarefas_loja")
      .insert(tarefasPayload)
      .select("id");

    if (tarefasError) {
      // Marcar erro e repassar para retry
      await sb
        .from("analises")
        .update({ status: "erro" })
        .eq("id", input.analise_id);
      throw new Error(`Erro ao inserir tarefas: ${tarefasError.message}`);
    }

    const totalTarefas = (tarefasInseridas ?? []).length;

    // ── 8. Atualizar análise com resultado ───────────────────────────────────
    logger.info("Atualizando análise com relatório gerado", {
      analise_id: input.analise_id,
      total_tarefas: totalTarefas,
    });

    const { error: updateError } = await sb
      .from("analises")
      .update({
        status: "processada",
        relatorio_markdown: parsedClaude.relatorio_markdown,
        resumo_executivo: parsedClaude.resumo_executivo,
        total_tarefas_geradas: totalTarefas,
        agent_run_id: ctx.run.id,
      })
      .eq("id", input.analise_id);

    if (updateError) {
      throw new Error(`Erro ao atualizar análise: ${updateError.message}`);
    }

    // ── 9. Audit log ─────────────────────────────────────────────────────────
    const output = OutputSchema.parse({
      ok: true,
      analise_id: input.analise_id,
      tarefas_geradas: totalTarefas,
      relatorio_markdown: parsedClaude.relatorio_markdown,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "analise-gerar-relatorio",
      input: { analise_id: input.analise_id },
      output: { ok: true, tarefas_geradas: totalTarefas },
      tenantId: tenant_id,
      triggeredBy: criado_por ?? undefined,
      durationMs: Date.now() - startedAt,
      costUsd,
      status: "success",
    });

    logger.info("analise-gerar-relatorio concluído", {
      analise_id: input.analise_id,
      tarefas_geradas: totalTarefas,
      duration_ms: Date.now() - startedAt,
    });

    return output;
  },
});

// ── Handler de erro centralizado ─────────────────────────────────────────────
// Nota: o Trigger.dev fará retry automático em caso de throw.
// O status "erro" na tabela analises é marcado dentro do bloco catch
// de cada operação crítica acima. Para erros não capturados internamente,
// adicione um wrapper externo se necessário via onFailure hook.
