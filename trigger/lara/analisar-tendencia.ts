import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { logAgentRun } from "../_shared/audit";
import { notifyDeli } from "../_shared/notify-deli";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  segmento: z.string().describe("Ex: pizza, hambúrguer, açaí, japonesa, árabe, saudável"),
  cidade: z.string().optional(),
  foco: z.string().optional().describe("Ex: cardápio, marketing, preços, embalagem"),
  triggered_by: z.string().uuid().optional(),
});

const TendenciaSchema = z.object({
  titulo: z.string(),
  descricao: z.string(),
  como_aplicar: z.string(),
  urgencia: z.enum(["alta", "media", "baixa"]),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  segmento: z.string(),
  cidade: z.string().nullable(),
  tendencias: z.array(TendenciaSchema),
  oportunidades_rapidas: z.array(z.string()),
  alertas: z.array(z.string()),
  resumo: z.string(),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const laraAnalisarTendencia = task({
  id: "lara-analisar-tendencia",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const startedAt = Date.now();

    const cidadeInfo = input.cidade ? ` em ${input.cidade}` : " no Brasil";
    const focoInfo   = input.foco   ? `\nFoco específico: ${input.foco}` : "";

    const systemPrompt = `Você é LARA, especialista sênior de CRM para food service da Consult Delivery.

## Sua missão agora
Analisar tendências atuais do mercado de delivery para um segmento específico e traduzir em ações práticas para nossos clientes.

## O que pesquisar
- Tendências de cardápio e produtos em alta neste segmento
- Estratégias de marketing que estão funcionando (campanhas, cupons, sazonalidade)
- Comportamento do consumidor (horários, frequência, ticket médio)
- O que os líderes de mercado estão fazendo
- Oportunidades ainda pouco exploradas

## Formato de saída
Retorne SOMENTE JSON válido:
{
  "ok": true,
  "segmento": "pizza",
  "cidade": "São Paulo ou null",
  "tendencias": [
    {
      "titulo": "Bordas recheadas criativas",
      "descricao": "Bordas com catupiry, chocolate, doce de leite crescendo 40% nas buscas",
      "como_aplicar": "Adicionar 2-3 opções de borda premium no cardápio com precificação 15% acima",
      "urgencia": "alta"
    }
  ],
  "oportunidades_rapidas": [
    "Campanha de quinta-feira (dia de menor pedido) com desconto 10% — ROI rápido",
    "Combo família para fim de semana — ticket médio sobe 30%"
  ],
  "alertas": [
    "Alta nos preços de queijo mussarela — revisar precificação em até 30 dias"
  ],
  "resumo": "Parágrafo de 3-4 linhas com o diagnóstico geral e recomendação principal"
}`;

    const userPrompt = `Analise tendências atuais para o segmento de ${input.segmento}${cidadeInfo}.${focoInfo}

Use web_search para buscar:
- iFood, Rappi, Ifood insights, notícias recentes do setor
- Instagram e TikTok de lojas líderes neste segmento
- Google Trends para termos do segmento
- Matérias recentes (últimos 6 meses) sobre o mercado de delivery neste nicho

Retorne tendências acionáveis e específicas, não genéricas.`;

    const resultado = await runClaudeWithWebSearch({
      systemPrompt,
      userPrompt,
      outputSchema: OutputSchema,
      maxRetries: 1,
      useWebSearch: true,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "lara",
      input,
      output: resultado,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - startedAt,
    });

    const locLabel = resultado.cidade ?? "Brasil";
    await notifyDeli({
      tenantId: input.tenant_id,
      content: `📊 **LARA** analisou tendências de **${resultado.segmento}** (${locLabel}) — ${resultado.tendencias.length} tendência(s), ${resultado.alertas.length} alerta(s).\n\n${resultado.resumo.slice(0, 280)}${resultado.resumo.length > 280 ? "..." : ""}`,
      sourceAgent: "lara",
      sourceTask: "lara-analisar-tendencia",
      runId: ctx.run.id,
    });

    return resultado;
  },
});
