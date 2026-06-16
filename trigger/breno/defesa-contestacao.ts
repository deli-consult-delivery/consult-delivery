import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getAnthropic } from "../_shared/claude";
import { logAgentRun } from "../_shared/audit";
import { getSupabase } from "../_shared/supabase";

// OBRIGATÓRIO: Schema de entrada
const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  loja_id: z.string().uuid(),
  pedido_ref: z.string().min(1),
  valor_centavos: z.number().int().min(0),
  tipo_logistica: z.enum(["ifood", "propria"]),
  historico_ocorrido: z.string().min(10),
  triggered_by: z.string().uuid().optional(),
});

// OBRIGATÓRIO: Schema de saída
const OutputSchema = z.object({
  ok: z.boolean(),
  caso_id: z.string().uuid(),
  is_contestavel: z.boolean(),
  chance_vitoria: z.enum(["alta", "media", "baixa", "nao_contestavel"]),
  draft_resposta: z.string(),
  argumentos_principais: z.array(z.string()),
  motivo_elegibilidade: z.string(),
});

type Input = z.infer<typeof InputSchema>;

const POLITICA_IFOOD_CONTESTACAO = `
POLÍTICA DE CONTESTAÇÃO DE CANCELAMENTOS - IFOOD (2025)

## PLANOS E RESPONSABILIDADES

### Plano Entrega (logística iFood)
- iFood responsável pela entrega
- Cancelamentos por problema de entrega: responsabilidade do iFood
- Restaurante pode contestar se: produto preparado corretamente, entregue ao entregador, problema foi na entrega

### Plano Básico (logística própria)
- Restaurante responsável pela entrega
- Restaurante tem mais argumentos para contestar cancelamentos por entrega
- Evidências do entregador próprio têm peso maior

## MOTIVOS CONTESTÁVEIS

1. **Produto entregue mas cliente alega não recebimento**
   - Evidências: foto da entrega, confirmação do motoboy, GPS do entregador
   - Chance: alta (logística própria) / média (logística iFood)

2. **Produto em conformidade mas cliente alega divergência**
   - Evidências: foto do produto antes do envio, receita padrão, ingredientes listados
   - Chance: média-alta

3. **Cancelamento após início do preparo sem justificativa válida**
   - Regra: cliente pode cancelar em até 5 minutos após confirmação do pedido
   - Se cancelou depois do preparo iniciado: restaurante tem direito de contestar
   - Chance: alta

4. **Cancelamento por demora não justificada**
   - Se tempo dentro do prazo acordado: contestável
   - Chance: média

5. **Pedido parcial cancelado com produto já enviado**
   - Se item foi enviado e cliente nega: altamente contestável
   - Evidências: foto do pacote completo, nota fiscal
   - Chance: alta

## MOTIVOS NÃO CONTESTÁVEIS

1. Cliente cancelou dentro de 5 minutos (antes do preparo)
2. Produto com problema real de qualidade (objeto estranho, contaminação)
3. Pedido não chegou por problema do entregador próprio sem evidências
4. Cancelamento aceito automaticamente pelo restaurante

## PROCESSO DE CONTESTAÇÃO

- **Prazo:** até 7 dias corridos após o cancelamento
- **Canal:** Central de ajuda iFood > Meus pedidos > Selecionar pedido > Contestar
- **Documentos aceitos:** fotos, vídeos, nota fiscal, comprovante de entrega
- **Prazo de resposta iFood:** até 7 dias úteis

## FERRAMENTAS DE NEGOCIAÇÃO

- Proposta de reembolso parcial ao cliente (evitar cancelamento total)
- Crédito em conta para o cliente (em vez de estorno)
- Mediação iFood (arbitragem neutra)

## TEXTO DA CONTESTAÇÃO — BOAS PRÁTICAS

1. Seja objetivo e factual — sem emoção
2. Cite os fatos cronologicamente
3. Mencione as evidências disponíveis
4. Referencie a política do iFood quando aplicável
5. Tom profissional, cordial
6. Máximo 400 palavras
7. Estrutura: [Referência ao pedido] + [O que aconteceu] + [Evidências] + [Pedido de revisão]

## ARBITRAGEM

- Se contestação negada: solicitar revisão por arbitragem
- Arbitragem analisa evidências de ambos os lados
- Decisão final em até 10 dias úteis
- Valor máximo disputável: sem limite oficial

## CASOS ESPECIAIS

- **Sob Demanda ON:** entregador chega e loja fechada → restaurante paga
- **Sob Demanda OFF:** restaurante escolheu não aceitar pedidos → não há cancelamento
- **Alta demanda:** atrasos por volume não isentam o restaurante automaticamente
`;

export const brenoDefesaContestacao = task({
  id: "breno-defesa-contestacao",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();

    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload) as Input;

    logger.info("breno-defesa-contestacao: iniciando", {
      tenant_id: input.tenant_id,
      loja_id: input.loja_id,
      pedido_ref: input.pedido_ref,
      valor_centavos: input.valor_centavos,
      tipo_logistica: input.tipo_logistica,
    });

    const sb = getSupabase();

    // Busca dados da loja
    const { data: loja, error: lojaError } = await sb
      .from("lojas")
      .select("nome, segmento, cidade, ifood_merchant_id, metadata")
      .eq("id", input.loja_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    if (lojaError) {
      logger.warn("breno-defesa-contestacao: erro ao buscar loja", {
        error: lojaError.message,
        loja_id: input.loja_id,
      });
    }

    logger.info("breno-defesa-contestacao: dados da loja obtidos, chamando Claude", {
      loja_nome: loja?.nome ?? "desconhecida",
      pedido_ref: input.pedido_ref,
    });

    const valorReais = (input.valor_centavos / 100).toFixed(2);

    const systemPrompt = `Você é um especialista em contestação de cancelamentos no iFood, com vasto conhecimento da política da plataforma e das melhores práticas para defesa de restaurantes.

Sua função é analisar o caso apresentado e determinar:
1. Se o caso é contestável segundo a política do iFood
2. A chance de vitória na contestação
3. Os argumentos mais sólidos para a defesa
4. Um texto de contestação profissional e objetivo

${POLITICA_IFOOD_CONTESTACAO}

Retorne APENAS um JSON válido (sem markdown, sem texto adicional) com exatamente este formato:
{
  "is_contestavel": boolean,
  "chance_vitoria": "alta" | "media" | "baixa" | "nao_contestavel",
  "draft_resposta": "texto da contestação em português, máximo 400 palavras",
  "argumentos_principais": ["argumento 1", "argumento 2", "argumento 3"],
  "motivo_elegibilidade": "explicação concisa de por que é ou não contestável"
}`;

    const userPrompt = JSON.stringify({
      loja: {
        nome: loja?.nome ?? "Restaurante",
        segmento: loja?.segmento ?? null,
        cidade: loja?.cidade ?? null,
        ifood_merchant_id: loja?.ifood_merchant_id ?? null,
      },
      pedido_ref: input.pedido_ref,
      valor: `R$ ${valorReais}`,
      tipo_logistica: input.tipo_logistica === "ifood" ? "Plano Entrega (logística iFood)" : "Plano Básico (logística própria)",
      historico_ocorrido: input.historico_ocorrido,
    }, null, 2);

    let claudeResult: {
      is_contestavel: boolean;
      chance_vitoria: "alta" | "media" | "baixa" | "nao_contestavel";
      draft_resposta: string;
      argumentos_principais: string[];
      motivo_elegibilidade: string;
    };

    try {
      const anthropic = getAnthropic();
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const match = rawText.match(/\{[\s\S]*\}/);
      claudeResult = JSON.parse(match ? match[0] : rawText);
    } catch (err) {
      logger.warn("breno-defesa-contestacao: erro no parse do Claude, usando fallback", {
        error: (err as Error).message,
        pedido_ref: input.pedido_ref,
      });
      claudeResult = {
        is_contestavel: false,
        chance_vitoria: "baixa",
        draft_resposta:
          "Não foi possível gerar a contestação automaticamente. Por favor, elabore manualmente.",
        argumentos_principais: [],
        motivo_elegibilidade: "Erro no processamento automático",
      };
    }

    logger.info("breno-defesa-contestacao: análise concluída", {
      pedido_ref: input.pedido_ref,
      is_contestavel: claudeResult.is_contestavel,
      chance_vitoria: claudeResult.chance_vitoria,
    });

    // Inserir em defesa_casos
    let caso_id: string = crypto.randomUUID();
    const { data: casoInserido, error: insertError } = await sb
      .from("defesa_casos")
      .insert({
        tipo: "cancelamento",
        canal: "ifood",
        pedido_ref: input.pedido_ref,
        valor_centavos: input.valor_centavos,
        loja_id: input.loja_id,
        tenant_id: input.tenant_id,
        motivo: input.historico_ocorrido,
        analise: {
          tipo_logistica: input.tipo_logistica,
          chance_vitoria: claudeResult.chance_vitoria,
          argumentos_principais: claudeResult.argumentos_principais,
          motivo_elegibilidade: claudeResult.motivo_elegibilidade,
        },
        draft_resposta: claudeResult.draft_resposta,
        status: "aguardando_ok",
        criado_por_agente: "breno-defesa",
      })
      .select("id")
      .single();

    if (insertError) {
      logger.warn("breno-defesa-contestacao: erro ao inserir defesa_casos", {
        error: insertError.message,
        pedido_ref: input.pedido_ref,
      });
    } else if (casoInserido?.id) {
      caso_id = casoInserido.id;
    }

    const output = {
      ok: !insertError,
      caso_id,
      is_contestavel: claudeResult.is_contestavel,
      chance_vitoria: claudeResult.chance_vitoria,
      draft_resposta: claudeResult.draft_resposta,
      argumentos_principais: claudeResult.argumentos_principais,
      motivo_elegibilidade: claudeResult.motivo_elegibilidade,
    };

    // OBRIGATÓRIO: audit log (sucesso)
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "breno-defesa",
      input: {
        loja_id: input.loja_id,
        pedido_ref: input.pedido_ref,
        tipo_logistica: input.tipo_logistica,
      },
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
      status: "success",
    });

    return OutputSchema.parse(output);
  },
});
