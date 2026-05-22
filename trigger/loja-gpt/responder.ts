import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { buildLojaContexto, type LojaContexto } from "../_shared/loja-contexto";
import { searchKnowledgeBase } from "../_shared/knowledge-base";

// ---------------------------------------------------------------------------
// Schemas Zod — OBRIGATÓRIO
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  conversation_id: z.string().uuid().nullable(),
  loja_id: z.string().uuid(),
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  pergunta: z.string().min(1).max(4000),
});

const FonteOutputSchema = z.object({
  path: z.string(),
});

const OutputSchema = z.object({
  message_id: z.string().uuid(),
  resposta: z.string(),
  fontes: z.array(FonteOutputSchema),
  tokens_input: z.number().int().nonnegative(),
  tokens_output: z.number().int().nonnegative(),
  custo_usd: z.number().nonnegative(),
  duracao_ms: z.number().int().nonnegative(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ---------------------------------------------------------------------------
// Preço claude-sonnet-4-6 (USD por token — valores públicos, não credenciais)
// ---------------------------------------------------------------------------
const PRECO_INPUT_POR_TOKEN = 3.0 / 1_000_000;
const PRECO_OUTPUT_POR_TOKEN = 15.0 / 1_000_000;

function calcularCusto(tokensInput: number, tokensOutput: number): number {
  return tokensInput * PRECO_INPUT_POR_TOKEN + tokensOutput * PRECO_OUTPUT_POR_TOKEN;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(contexto: LojaContexto, fontes_formatadas: string): string {
  const { loja, ultima_metrica, tarefas_em_aberto, memorias } = contexto;

  const memorias_formatted =
    memorias.length > 0
      ? memorias
          .map((m, i) => `${i + 1}. [${m.kind}] (importância ${m.importance}) ${m.content}`)
          .join("\n")
      : "Nenhuma memória registrada para esta loja.";

  const contexto_json = JSON.stringify(
    {
      loja,
      ultima_metrica,
      tarefas_em_aberto,
    },
    null,
    2
  );

  return `Você é Loja-GPT, agente especialista de delivery iFood. Atende consultores \
da Consult Delivery. Você conhece tudo sobre a loja ${loja.nome}, uma ${loja.segmento ?? "loja"} \
em ${loja.cidade ?? "localização não informada"}, posicionada como ${loja.posicionamento ?? "não definido"}.

CONTEXTO ATUAL DA LOJA:
${contexto_json}

MEMÓRIAS RELEVANTES:
${memorias_formatted}

BASE DE CONHECIMENTO iFOOD:
${fontes_formatadas}

REGRAS:
1. SEMPRE cite a fonte ao usar conhecimento da base no formato [REF:caminho]
2. Se não tiver certeza, diga 'não tenho essa informação na base atual'
3. NUNCA invente números, métricas ou datas
4. Considere o estado atual da loja ao recomendar
5. Tom profissional, técnico, prático
6. Respostas concisas (max 300 palavras se não pedirem detalhe)
7. Se a pergunta é sobre outra loja: 'sou especialista apenas da ${loja.nome}'`;
}

// ---------------------------------------------------------------------------
// Task principal
// ---------------------------------------------------------------------------

export const lojaGptResponder = task({
  id: "loja-gpt-responder",
  retry: { maxAttempts: 1 },
  run: async (payload: unknown, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const start = Date.now();

    logger.info("loja-gpt-responder: iniciando", {
      loja_id: input.loja_id,
      conversation_id: input.conversation_id,
      tenant_id: input.tenant_id,
    });

    const sb = getSupabase();
    // getAnthropic() dentro do run() — anti-padrão #4 evitado
    const anthropic = getAnthropic();

    let conversation_id: string | null = input.conversation_id;

    try {
      // ------------------------------------------------------------------
      // [1] Contexto da loja
      // ------------------------------------------------------------------
      const contexto = await buildLojaContexto(input.loja_id);
      logger.info("loja-gpt-responder: contexto carregado", {
        loja: contexto.loja.nome,
        memorias_count: contexto.memorias.length,
      });

      // ------------------------------------------------------------------
      // [2] Knowledge base
      // ------------------------------------------------------------------
      const kbResult = await searchKnowledgeBase(input.pergunta);
      logger.info("loja-gpt-responder: knowledge-base buscada", {
        fontes_count: kbResult.fontes.length,
        tokens_kb_estimados: kbResult.tokens_estimados,
      });

      const fontes_formatadas =
        kbResult.fontes.length > 0
          ? kbResult.fontes
              .map((f) => `[REF:${f.path}]\n${f.conteudo_relevante}`)
              .join("\n\n---\n\n")
          : "Nenhuma fonte relevante encontrada na base de conhecimento.";

      // ------------------------------------------------------------------
      // [3] Criar conversa se necessário (D4A: task gerencia o INSERT user)
      // ------------------------------------------------------------------
      if (conversation_id === null) {
        const { data: newConv, error: convError } = await sb
          .from("loja_gpt_conversations")
          .insert({
            loja_id: input.loja_id,
            iniciada_por: input.user_id,
          })
          .select("id")
          .single();

        if (convError || !newConv) {
          throw new Error(
            `Falha ao criar conversa: ${convError?.message ?? "sem dados retornados"}`
          );
        }

        conversation_id = newConv.id as string;
        logger.info("loja-gpt-responder: nova conversa criada", { conversation_id });
      }

      // ------------------------------------------------------------------
      // [4] Salvar mensagem do usuário (role='user') — D4A
      // ------------------------------------------------------------------
      await sb.from("loja_gpt_messages").insert({
        conversation_id,
        role: "user",
        conteudo: input.pergunta,
        autor_user_id: input.user_id,
        fontes_consultadas: [],
      });

      // ------------------------------------------------------------------
      // [5] Buscar histórico — últimas 11 mensagens, exclui a que acabou de inserir
      // ------------------------------------------------------------------
      const { data: historicoRaw, error: histError } = await sb
        .from("loja_gpt_messages")
        .select("role, conteudo")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(11);

      if (histError) {
        throw new Error(`Falha ao buscar histórico: ${histError.message}`);
      }

      // Inverte para cronológico e remove o último (a pergunta recém-inserida)
      const mensagensHistorico = (historicoRaw ?? [])
        .reverse()
        .slice(0, -1)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.conteudo as string,
        }));

      // ------------------------------------------------------------------
      // [6] Montar system prompt e chamar Anthropic
      // ------------------------------------------------------------------
      const systemPrompt = buildSystemPrompt(contexto, fontes_formatadas);

      logger.info("loja-gpt-responder: chamando Anthropic", {
        historico_msgs: mensagensHistorico.length,
        modelo: "claude-sonnet-4-6",
      });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          ...mensagensHistorico,
          { role: "user", content: input.pergunta },
        ],
      });

      // ------------------------------------------------------------------
      // [7] Extrair resposta de texto
      // ------------------------------------------------------------------
      const resposta = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      if (!resposta) {
        throw new Error("Anthropic retornou resposta vazia ou apenas tool_use sem texto");
      }

      const tokens_input = response.usage.input_tokens;
      const tokens_output = response.usage.output_tokens;
      const custo_usd = calcularCusto(tokens_input, tokens_output);
      const duracao_ms = Date.now() - start;

      logger.info("loja-gpt-responder: resposta recebida", {
        tokens_input,
        tokens_output,
        custo_usd,
        duracao_ms,
        stop_reason: response.stop_reason,
      });

      // ------------------------------------------------------------------
      // [8] Salvar resposta do assistente (role='assistant')
      // fontes_consultadas no banco: array completo com conteudo_relevante (auditoria)
      // ------------------------------------------------------------------
      const { data: msgAssistant, error: msgError } = await sb
        .from("loja_gpt_messages")
        .insert({
          conversation_id,
          role: "assistant",
          conteudo: resposta,
          fontes_consultadas: kbResult.fontes, // { path, conteudo_relevante } — auditoria completa
          contexto_loja_snapshot: contexto as unknown as Record<string, unknown>,
          tokens_input,
          tokens_output,
          custo_usd,
          duracao_ms,
          modelo: "claude-sonnet-4-6",
        })
        .select("id")
        .single();

      if (msgError || !msgAssistant) {
        throw new Error(
          `Falha ao salvar mensagem assistente: ${msgError?.message ?? "sem dados retornados"}`
        );
      }

      const message_id = msgAssistant.id as string;

      // ------------------------------------------------------------------
      // [9] Atualizar conversation — D2C: SELECT atual + soma no JS + UPDATE
      // Tech debt: race condition aceitável em v1 (baixo tráfego concorrente)
      // ------------------------------------------------------------------
      const { data: convAtual, error: convSelectError } = await sb
        .from("loja_gpt_conversations")
        .select("total_messages, custo_total_usd")
        .eq("id", conversation_id)
        .single();

      if (convSelectError || !convAtual) {
        // Falha não-bloqueante: loga e segue (conversa já existe, atualização é cosmética)
        logger.warn("loja-gpt-responder: falha ao ler conversation para update", {
          conversation_id,
          error: convSelectError?.message,
        });
      } else {
        const novoTotal = ((convAtual.total_messages as number) ?? 0) + 2; // user + assistant
        const novoCusto =
          (parseFloat(String(convAtual.custo_total_usd ?? "0")) + custo_usd);

        await sb
          .from("loja_gpt_conversations")
          .update({
            total_messages: novoTotal,
            ultima_message_em: new Date().toISOString(),
            custo_total_usd: novoCusto,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation_id);
      }

      // ------------------------------------------------------------------
      // [10] logAgentRun — SUCESSO (OBRIGATÓRIO)
      // ------------------------------------------------------------------
      const outputParsed = OutputSchema.parse({
        message_id,
        resposta,
        fontes: kbResult.fontes.map((f) => ({ path: f.path })), // D3B: só path no output
        tokens_input,
        tokens_output,
        custo_usd,
        duracao_ms,
      });

      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "loja-gpt",
        input,
        output: outputParsed,
        tenantId: input.tenant_id,
        durationMs: duracao_ms,
        costUsd: custo_usd,
        status: "success",
      });

      logger.info("loja-gpt-responder: concluido com sucesso", {
        message_id,
        custo_usd,
        duracao_ms,
      });

      return outputParsed;
    } catch (error) {
      const duracao_ms = Date.now() - start;

      // logAgentRun é soft-fail internamente (console.warn) — pode chamar direto
      await logAgentRun({
        runId: ctx.run.id,
        agentSlug: "loja-gpt",
        input,
        output: null,
        tenantId: input.tenant_id,
        durationMs: duracao_ms,
        status: "failed",
      });

      throw error;
    }
  },
});
