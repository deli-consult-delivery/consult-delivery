import { schedules } from "@trigger.dev/sdk/v3";
import { processarFila } from "../_shared/agente-analise";

// AGENTE MULTICANAL — consolida as metricas de canais num resumo unico
// e aponta onde focar. (Hoje: iFood; pronto para mais canais.)
const SYSTEM = "Voce e o agente MULTICANAL da Consult Delivery. Consolide as metricas dos canais de delivery (vendas, taxas, conciliacao) num panorama unico de saude do negocio e aponte onde o dono deve focar esta semana. Se houver so um canal, deixe claro e foque nele. Portugues do Brasil, direto, ZERO emoji. Responda APENAS JSON: {\"resumo\":\"2-3 frases\",\"itens\":[{\"titulo\":\"canal ou metrica\",\"detalhe\":\"\",\"acao\":\"\"}],\"destaque\":\"a prioridade da semana\"}";

export const multicanalProcessar = schedules.task({
  id: "multicanal-processar",
  cron: "*/5 * * * *",
  run: async (_p, { ctx }) => processarFila({
    agente: "multicanal", runId: ctx.run.id, systemPrompt: SYSTEM,
    metricasFiltro: k => k.startsWith("vendas_") || k.startsWith("conciliacao_") || k.startsWith("logistica_"),
  }),
});
