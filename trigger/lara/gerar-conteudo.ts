import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { logAgentRun } from "../_shared/audit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const TipoConteudo = z.enum([
  "post_instagram",
  "stories_instagram",
  "mensagem_whatsapp",
  "email_marketing",
  "legenda_campanha",
]);

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  loja_nome: z.string(),
  tipo: TipoConteudo,
  objetivo: z.string().describe("Ex: reativar clientes inativos, promover novo produto, black friday"),
  contexto: z.string().optional().describe("Dados da loja, produto destaque, promoção ativa"),
  tom: z.string().optional().describe("Ex: informal e próximo, premium, divertido"),
  cupom: z.string().optional().describe("Ex: VOLTA10, FRETE0"),
  triggered_by: z.string().uuid().optional(),
});

const VariacaoSchema = z.object({
  titulo: z.string(),
  conteudo: z.string(),
  cta: z.string(),
  observacoes: z.string().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  loja_nome: z.string(),
  tipo: z.string(),
  objetivo: z.string(),
  variacoes: z.array(VariacaoSchema).min(1).max(3),
  dicas_uso: z.array(z.string()),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const laraGerarConteudo = task({
  id: "lara-gerar-conteudo",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const startedAt = Date.now();

    const tipoLabel: Record<string, string> = {
      post_instagram: "Post para Instagram (feed)",
      stories_instagram: "Stories do Instagram",
      mensagem_whatsapp: "Mensagem WhatsApp (máx 600 chars)",
      email_marketing: "E-mail marketing",
      legenda_campanha: "Legenda de campanha iFood/Repediu",
    };

    const systemPrompt = `Você é LARA, especialista sênior de CRM para food service da Consult Delivery.

## Sua missão agora
Criar conteúdo de marketing de alta qualidade para uma loja de delivery.

## Regras absolutas de linguagem
- PROIBIDO: "promoção" (use "oferta"), linguagem corporativa, jargão sem explicação
- Tom: amigável, direto, prático — igual a uma mensagem de amigo que entende do negócio
- WhatsApp: máximo 600 caracteres por mensagem, use *negrito* e _itálico_ do WhatsApp
- Instagram: gancho forte na primeira linha (sem "Olá" ou "Ei"), CTA claro no final
- Sempre inclua {nome_cliente} quando for mensagem de régua pessoal

## Estrutura de legenda (gancho → benefício → CTA → cupom)
1. Gancho: frase que prende em 1 linha
2. Benefício: o que o cliente ganha
3. CTA: o que ele deve fazer agora
4. Cupom: se houver, destaque no final

## Formato de saída
Retorne SOMENTE JSON válido:
{
  "ok": true,
  "loja_nome": "...",
  "tipo": "...",
  "objetivo": "...",
  "variacoes": [
    {
      "titulo": "Variação 1 — foco no produto",
      "conteudo": "texto completo aqui",
      "cta": "Peça agora pelo iFood",
      "observacoes": "use na terça-feira à noite"
    },
    {
      "titulo": "Variação 2 — foco no benefício/desconto",
      "conteudo": "...",
      "cta": "...",
      "observacoes": "..."
    },
    {
      "titulo": "Variação 3 — foco em urgência/escassez",
      "conteudo": "...",
      "cta": "...",
      "observacoes": "..."
    }
  ],
  "dicas_uso": [
    "Melhor horário: terça a quinta, 11h-12h e 18h-19h",
    "Teste Variação 1 primeiro — tom mais próximo performa melhor em delivery"
  ]
}`;

    const cupomInfo = input.cupom ? `\nCupom disponível: ${input.cupom}` : "";
    const tomInfo   = input.tom   ? `\nTom de voz desejado: ${input.tom}` : "";
    const ctxInfo   = input.contexto ? `\nContexto adicional: ${input.contexto}` : "";

    const userPrompt = `Crie conteúdo para:

Loja: ${input.loja_nome}
Tipo: ${tipoLabel[input.tipo] ?? input.tipo}
Objetivo: ${input.objetivo}${cupomInfo}${tomInfo}${ctxInfo}

Gere 3 variações com estilos diferentes (produto, benefício, urgência).
Retorne o JSON conforme solicitado.`;

    const resultado = await runClaudeWithWebSearch({
      systemPrompt,
      userPrompt,
      outputSchema: OutputSchema,
      maxRetries: 1,
      useWebSearch: false,
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

    return resultado;
  },
});
