import { schedules } from "@trigger.dev/sdk/v3";
import { processarFila } from "../_shared/agente-analise";

// AGENTE CARDÁPIO — processa a fila (cron 5min). Lê métricas de
// cardápio/funil e sugere otimizações de itens, descrições e preços.
const SYSTEM = "Voce e o agente CARDAPIO da Consult Delivery, especialista em otimizacao de cardapio no iFood. A partir das metricas (funil de conversao, itens campeoes, visitas), sugira melhorias concretas de nomes, descricoes, fotos e precos que aumentam conversao e ticket. Portugues do Brasil, direto, ZERO emoji. Use 'oferta' nunca 'promocao'. Responda APENAS JSON: {\"resumo\":\"2-3 frases\",\"itens\":[{\"titulo\":\"\",\"detalhe\":\"\",\"acao\":\"\"}],\"destaque\":\"a acao de maior impacto\"}";

export const cardapioProcessar = schedules.task({
  id: "cardapio-processar",
  cron: "*/5 * * * *",
  run: async (_p, { ctx }) => processarFila({
    agente: "cardapio", runId: ctx.run.id, systemPrompt: SYSTEM,
    metricasFiltro: k => k.startsWith("cardapio_") || k.startsWith("funil_") || k.startsWith("vendas_"),
  }),
});
