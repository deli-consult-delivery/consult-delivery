import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  analise_id: z.string().uuid(),
  cliente_nome: z.string(),
  drive_link: z.string(),
  periodo: z.enum(["diaria", "semanal", "mensal"]).default("semanal"),
  correcoes: z.array(z.string()).optional().default([]),
  triggered_by: z.string().uuid().optional(),
});

const BlocoSchema = z.object({
  status: z.enum(["bom", "atencao", "critico"]),
  pontos: z.array(z.string()),
  sugestoes: z.array(z.string()),
});

const AnaliseOutputSchema = z.object({
  loja_nome: z.string(),
  saude_geral: z.enum(["saudavel", "atencao", "critica"]),
  mensagem_whatsapp: z.string(),
  blocos: z.object({
    identidade_visual: BlocoSchema,
    desempenho: BlocoSchema,
    operacao: BlocoSchema,
    funil_conversao: BlocoSchema,
    cardapio: BlocoSchema,
    concorrencia: BlocoSchema,
    marketing: BlocoSchema,
    avaliacoes: BlocoSchema,
    configuracoes: BlocoSchema,
  }),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  analise_id: z.string().uuid(),
  resultado_json: AnaliseOutputSchema,
  mensagem_whatsapp: z.string(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchDriveContent(driveLink: string): Promise<string | null> {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const folderId = match[1];

  if (googleApiKey) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&key=${googleApiKey}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!r.ok) throw new Error(`Drive API ${r.status}`);
      const { files } = (await r.json()) as {
        files: { id: string; name: string; mimeType: string }[];
      };
      if (!files?.length) return null;

      let out = "";
      for (const f of files.slice(0, 8)) {
        if (f.mimeType === "application/vnd.google-apps.folder") continue;
        const url =
          f.mimeType === "application/vnd.google-apps.document"
            ? `https://docs.google.com/document/d/${f.id}/export?format=txt`
            : `https://drive.google.com/uc?export=download&id=${f.id}`;
        try {
          const dr = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          if (dr.ok) {
            const text = await dr.text();
            if (text.length > 50) out += `\n--- ${f.name} ---\n${text.slice(0, 6000)}\n`;
          }
        } catch (_) {}
      }
      return out.trim() || null;
    } catch (err) {
      console.warn("[analise-ifood] Drive API falhou:", (err as Error).message);
    }
  }
  return null;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const analiseIfoodRun = task({
  id: "analise-ifood-run",
  retry: { maxAttempts: 2 },
  // Análise pode levar até 5min (Drive fetch + Claude)
  queue: { concurrencyLimit: 3 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Marcar análise como em processamento
    await sb
      .from("analises")
      .update({ status: "processing" })
      .eq("id", input.analise_id);

    // 2. Tentar carregar dados do Google Drive
    const driveData = await fetchDriveContent(input.drive_link);
    console.log(
      `[analise-ifood] cliente=${input.cliente_nome} drive=${driveData ? `${driveData.length} chars` : "não carregado"}`
    );

    // 3. Montar correcoes no prompt
    const periodoLabel =
      { diaria: "Diária", semanal: "Semanal", mensal: "Mensal" }[input.periodo] ?? input.periodo;

    const correcoesBlock =
      input.correcoes.length > 0
        ? `\nCORREÇÕES APRENDIDAS (aplique sempre):\n${input.correcoes.map((c) => `- ${c}`).join("\n")}`
        : "";

    const systemPrompt = `Você é um especialista em análise de lojas no iFood para a consultoria Consult Delivery.

Sua função: analisar os dados de uma loja e gerar um relatório estruturado em JSON com diagnóstico e ações.

TOM: Escreva na perspectiva da Consult Delivery. Use "Nossa equipe vai configurar...", "Vamos implementar...", "A consultoria irá ajustar...".
ORTOGRAFIA: Corrija silenciosamente erros de ortografia nos dados fornecidos.
TEMPO: NÃO inclua estimativas de tempo de execução.
${correcoesBlock}

Retorne SOMENTE o JSON abaixo, sem texto adicional:
{
  "loja_nome": "nome da loja",
  "saude_geral": "saudavel|atencao|critica",
  "mensagem_whatsapp": "mensagem curta (3-5 linhas) para enviar ao cliente com diagnóstico geral e próximos passos",
  "blocos": {
    "identidade_visual": {
      "status": "bom|atencao|critico",
      "pontos": ["ponto observado 1", "ponto observado 2"],
      "sugestoes": ["ação concreta 1", "ação concreta 2"]
    },
    "desempenho": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "operacao": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "funil_conversao": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "cardapio": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "concorrencia": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "marketing": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "avaliacoes": { "status": "...", "pontos": [...], "sugestoes": [...] },
    "configuracoes": { "status": "...", "pontos": [...], "sugestoes": [...] }
  }
}`;

    const userPrompt = driveData
      ? `Cliente: ${input.cliente_nome}. Tipo de análise: ${periodoLabel}.\n\nDados da loja (extraídos do Google Drive):\n${driveData}\n\nGere a análise completa em JSON.`
      : `Cliente: ${input.cliente_nome}. Tipo de análise: ${periodoLabel}.\nLink Google Drive: ${input.drive_link}\n\nUse web_search para buscar informações públicas sobre esta loja no iFood e gere a análise em JSON.`;

    // 4. Chamar Claude (com web_search quando não há dados do Drive)
    let costUsd = 0;
    let resultado_json: z.infer<typeof AnaliseOutputSchema>;
    try {
      resultado_json = await runClaudeWithWebSearch({
        systemPrompt,
        userPrompt,
        outputSchema: AnaliseOutputSchema,
        maxRetries: 1,
        useWebSearch: !driveData,
        onUsage: (usage) => { costUsd += calcularCustoUsd("claude-sonnet-4-6", usage) ?? 0; },
      });
    } catch (err) {
      // Fallback: salvar erro na análise
      await sb
        .from("analises")
        .update({
          status: "error",
          resultado_json: { error: (err as Error).message },
        })
        .eq("id", input.analise_id);
      throw err;
    }

    // 5. Salvar resultado na tabela analises
    await sb
      .from("analises")
      .update({
        status: "done",
        resultado_json,
        mensagem_whatsapp: resultado_json.mensagem_whatsapp,
      })
      .eq("id", input.analise_id);

    // 6. Log de execução
    const output = OutputSchema.parse({
      ok: true,
      analise_id: input.analise_id,
      resultado_json,
      mensagem_whatsapp: resultado_json.mensagem_whatsapp,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "analise-ifood",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - startedAt,
      costUsd,
    });

    return output;
  },
});
