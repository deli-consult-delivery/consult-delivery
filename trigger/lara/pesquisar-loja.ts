import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  loja_id: z.string().uuid().optional(),
  loja_nome: z.string().min(2),
  cidade: z.string().optional(),
  ifood_link: z.string().optional(),
  instagram: z.string().optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  loja_nome: z.string(),
  ifood: z.object({
    categorias: z.array(z.string()),
    nota: z.number().nullable(),
    avaliacoes: z.number().nullable(),
    ticket_medio: z.string().nullable(),
    diferenciais: z.array(z.string()),
  }),
  cardapio: z.object({
    destaques: z.array(z.string()),
    especialidades: z.array(z.string()),
  }),
  instagram: z.object({
    handle: z.string().nullable(),
    estilo: z.string().nullable(),
    frequencia: z.string().nullable(),
  }),
  posicionamento: z.string(),
  tom_de_voz: z.string(),
  oportunidades: z.array(z.string()),
  concorrentes: z.array(z.object({
    nome: z.string(),
    diferencial: z.string(),
  })),
  resumo_executivo: z.string(),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const laraPesquisarLoja = task({
  id: "lara-pesquisar-loja",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const startedAt = Date.now();

    const cidadeInfo = input.cidade ? ` em ${input.cidade}` : "";
    const idfoodInfo = input.ifood_link ? `\nLink iFood: ${input.ifood_link}` : "";
    const instaInfo  = input.instagram ? `\nInstagram: ${input.instagram}` : "";

    const systemPrompt = `Você é LARA, especialista sênior de CRM para food service da Consult Delivery.

Sua missão agora: pesquisar dados completos de uma loja para alimentar a régua de disparo.

## Regras de pesquisa
- Busque a loja no iFood, Google, Instagram e Google Maps
- Analise cardápio, avaliações, diferenciais e concorrência local
- NÃO invente dados — se não encontrar, coloque null ou array vazio
- Seja específico e acionável nos "oportunidades"

## Formato de saída
Retorne SOMENTE JSON válido, sem texto adicional:
{
  "ok": true,
  "loja_nome": "nome real da loja",
  "ifood": {
    "categorias": ["Pizza", "Lanches"],
    "nota": 4.8,
    "avaliacoes": 1240,
    "ticket_medio": "R$ 45",
    "diferenciais": ["entrega rápida", "embalagem premium"]
  },
  "cardapio": {
    "destaques": ["Pizza de Calabresa", "Combo Família"],
    "especialidades": ["bordas recheadas", "massa artesanal"]
  },
  "instagram": {
    "handle": "@nomedaloja",
    "estilo": "fotos de produto + bastidores",
    "frequencia": "3x por semana"
  },
  "posicionamento": "descrição do posicionamento atual da loja",
  "tom_de_voz": "informal e próximo / formal e premium / etc",
  "oportunidades": [
    "Sem campanha de reativação — clientes inativos 30d sem abordagem",
    "Instagram desatualizado — potencial para stories de bastidores"
  ],
  "concorrentes": [
    { "nome": "Pizza do Zé", "diferencial": "preço menor, sem borda recheada" }
  ],
  "resumo_executivo": "Parágrafo curto (3-4 linhas) resumindo o diagnóstico e próximas ações prioritárias"
}`;

    const userPrompt = `Pesquise dados completos desta loja de delivery:

Loja: ${input.loja_nome}${cidadeInfo}${idfoodInfo}${instaInfo}

Use web_search para encontrar o iFood, Instagram, Google Maps e qualquer presença digital.
Retorne o JSON estruturado conforme solicitado.`;

    const resultado = await runClaudeWithWebSearch({
      systemPrompt,
      userPrompt,
      outputSchema: OutputSchema,
      maxRetries: 1,
      useWebSearch: true,
    });

    // Salvar fatos na memória do cliente (se loja_id fornecido)
    if (input.loja_id) {
      const sb = getSupabase();
      await sb.from("client_facts").upsert({
        loja_id: input.loja_id,
        key: "pesquisa_lara",
        value: JSON.stringify(resultado),
        ts: new Date().toISOString(),
      }, { onConflict: "loja_id,key" }).catch(() => {});
    }

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "lara",
      input,
      output: resultado,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - startedAt,
    });

    return resultado;
  },
});
