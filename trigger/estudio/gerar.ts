import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";

// =====================================================
// ESTÚDIO — GERAR (E2)
// Cron 2 min: processa a FILA de criações (estudio_criacoes,
// status='fila' — padrão PR10). Para cada pedido:
//   1. texto/copy com claude-sonnet-4-6 (Brand Guard)
//   2. se formato visual: imagem via OpenRouter
//      (modelo em ESTUDIO_IMAGE_MODEL, default openai/gpt-5.4-image-2)
//      → PNG salvo no bucket 'estudio' (público)
//   3. logAgentRun com custo real (texto + imagem)
// NUNCA publica nada — resultado vira 'pronto' e aguarda humano.
// Idempotente: claim otimista fila→gerando com guarda de status.
// E2b: imagem via chat/completions + modalities (404 no endpoint
// de images — provado em produção 2026-06-08).
// E2c: slug válido confirmado na API de modelos (gpt-image-2 não existe).
// =====================================================

const TIPO_LABEL: Record<string, string> = {
  post_instagram: "Post de Instagram (feed 1:1)",
  story_vaga: "Story 9:16 — vaga de emprego",
  capa_youtube: "Capa de vídeo do YouTube (16:9)",
  oferta_whatsapp: "Mensagem de oferta para WhatsApp",
  cardapio_copy: "Copy de cardápio (descrições que vendem)",
  calendario_mes: "Calendário editorial do mês",
};

const SYSTEM_PROMPT = `Você é o agente ESTÚDIO da Consult Delivery — criação de conteúdo para restaurantes no delivery.

Brand Guard (obrigatório):
- Português brasileiro. ZERO emoji. Use "oferta", NUNCA "promoção".
- Títulos curtos e fortes (a marca usa Anton em CAIXA ALTA); corpo direto, sem floreio.
- Nunca invente preço, prazo ou condição que não esteja no brief.

Você recebe um tipo de conteúdo e um brief. Responda APENAS com JSON válido:
{
  "texto": "o conteúdo textual pronto (legenda, copy, mensagem ou calendário em markdown)",
  "prompt_imagem": "se o tipo pede arte: prompt EM INGLÊS para o gerador de imagem, descrevendo composição, estilo fotográfico apetitoso, cores da marca (deep red #B70C00, near-black #0D0D0D, off-white #E9E6E0), tipografia bold condensed UPPERCASE para o título, formato e hierarquia. Senão: null"
}

Regras do prompt_imagem: comida sempre protagonista e apetitosa; texto na arte só o essencial (título + 1 linha); sem logos de marketplaces; sem rostos reconhecíveis.`;

function extrairJson(texto: string): { texto: string; prompt_imagem: string | null } {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("resposta do Claude sem JSON");
  const obj = JSON.parse(m[0]);
  if (!obj.texto) throw new Error("JSON sem campo texto");
  return { texto: String(obj.texto), prompt_imagem: obj.prompt_imagem ? String(obj.prompt_imagem) : null };
}

async function gerarImagemOpenRouter(prompt: string, formato: string): Promise<{ png: Buffer; custoUsd: number; modelo: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY ausente no ambiente do Trigger.dev");
  const modelo = process.env.ESTUDIO_IMAGE_MODEL || "openai/gpt-5.4-image-2";
  const aspect = formato === "9:16" ? "9:16 (vertical story)" : formato === "16:9" ? "16:9 (widescreen)" : "1:1 (square)";

  // OpenRouter gera imagem via chat/completions com modalities image+text
  // (nao existe /v1/images/generations — confirmado em producao, 404).
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: "user", content: `${prompt}\n\nAspect ratio: ${aspect}. Output a single image.` }],
      modalities: ["image", "text"],
      usage: { include: true },
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${corpo.slice(0, 300)}`);
  }
  const json = await resp.json();
  const img = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!img) throw new Error(`OpenRouter sem imagem na resposta (modelo ${modelo}): ${JSON.stringify(json?.choices?.[0]?.message ?? json?.error ?? {}).slice(0, 200)}`);
  const custoUsd = Number(json?.usage?.cost ?? 0);
  if (img.startsWith("data:")) {
    return { png: Buffer.from(img.split(",")[1], "base64"), custoUsd, modelo };
  }
  const bin = await fetch(img);
  if (!bin.ok) throw new Error(`download da imagem falhou: ${bin.status}`);
  return { png: Buffer.from(await bin.arrayBuffer()), custoUsd, modelo };
}

export const estudioGerar = schedules.task({
  id: "estudio-gerar",
  cron: "*/2 * * * *",
  run: async (_payload: unknown, { ctx }) => {
    const sb = getSupabase();

    const { data: fila, error } = await sb
      .from("estudio_criacoes")
      .select("id, tenant_id, loja_id, tipo, formato, brief, tom, usar_identidade, criado_por")
      .eq("status", "fila")
      .order("created_at", { ascending: true })
      .limit(3);
    if (error) throw new Error(`estudio: leitura da fila falhou: ${error.message}`);
    if (!fila?.length) return { ok: true, processadas: 0 };

    let prontas = 0;
    let erros = 0;

    for (const c of fila) {
      const t0 = Date.now();
      // claim otimista (idempotente entre varreduras)
      const { data: claim } = await sb
        .from("estudio_criacoes")
        .update({ status: "gerando", updated_at: new Date().toISOString() })
        .eq("id", c.id)
        .eq("status", "fila")
        .select("id");
      if (!claim || claim.length === 0) continue;

      try {
        // identidade da loja (opcional)
        let identidade = "";
        if (c.usar_identidade && c.loja_id) {
          const { data: loja } = await sb.from("lojas").select("nome, logo_url, metadata").eq("id", c.loja_id).maybeSingle();
          if (loja) identidade = `\nIdentidade da loja: nome "${loja.nome}"${loja.logo_url ? " (tem logo própria — reserve espaço para o logo no canto superior)" : ""}.`;
        }

        // 1) texto + prompt de imagem
        const anthropic = getAnthropic();
        const resp = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Tipo: ${TIPO_LABEL[c.tipo] || c.tipo}\nFormato: ${c.formato}\nTom: ${c.tom || "padrão da marca"}${identidade}\n\nBrief do cliente:\n${c.brief}`,
          }],
        });
        const textoResp = resp.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("\n");
        const { texto, prompt_imagem } = extrairJson(textoResp);
        let custoUsd =
          (resp.usage.input_tokens / 1_000_000) * 3 +
          (resp.usage.output_tokens / 1_000_000) * 15;

        // 2) imagem (apenas formatos visuais)
        let imagemUrl: string | null = null;
        if (prompt_imagem && c.formato !== "texto") {
          const { png, custoUsd: custoImg, modelo } = await gerarImagemOpenRouter(prompt_imagem, c.formato);
          custoUsd += custoImg;
          const path = `${c.tenant_id}/${c.id}.png`;
          const { error: upErr } = await sb.storage.from("estudio").upload(path, png, { contentType: "image/png", upsert: true });
          if (upErr) throw new Error(`upload no bucket estudio falhou: ${upErr.message}`);
          const { data: pub } = sb.storage.from("estudio").getPublicUrl(path);
          imagemUrl = pub?.publicUrl ?? null;
          logger.info("ESTÚDIO — imagem gerada", { criacao: c.id, modelo, bytes: png.length });
        }

        // 3) pronto + auditoria
        await sb.from("estudio_criacoes").update({
          status: "pronto",
          texto_gerado: texto,
          imagem_url: imagemUrl,
          custo_usd: custoUsd,
          erro_msg: null,
          updated_at: new Date().toISOString(),
        }).eq("id", c.id);

        await logAgentRun({
          runId: `${ctx.run.id}-${c.id}`,
          agentSlug: "estudio",
          input: { tipo: c.tipo, formato: c.formato, brief: c.brief.slice(0, 300) },
          output: { imagem: !!imagemUrl, chars_texto: texto.length },
          tenantId: c.tenant_id,
          triggeredBy: c.criado_por ?? undefined,
          durationMs: Date.now() - t0,
          costUsd: custoUsd,
        });
        await notify({
          tenantId: c.tenant_id,
          kind: "draft_pending",
          agent: "estudio",
          title: `Criação pronta: ${TIPO_LABEL[c.tipo] || c.tipo}`,
          body: `"${c.brief.slice(0, 80)}" — revise na Biblioteca do Estúdio.`,
          metadata: { criacao_id: c.id },
        });
        prontas++;
      } catch (err) {
        erros++;
        const msg = (err as Error).message?.slice(0, 500) || "erro desconhecido";
        await sb.from("estudio_criacoes").update({ status: "erro", erro_msg: msg, updated_at: new Date().toISOString() }).eq("id", c.id);
        await logAgentRun({
          runId: `${ctx.run.id}-${c.id}`,
          agentSlug: "estudio",
          input: { tipo: c.tipo, brief: c.brief.slice(0, 300) },
          output: { erro: msg },
          tenantId: c.tenant_id,
          durationMs: Date.now() - t0,
          status: "failed",
        });
        logger.error("ESTÚDIO — falha na geração", { criacao: c.id, erro: msg });
      }
    }

    logger.info("ESTÚDIO — varredura concluída", { fila: fila.length, prontas, erros });
    return { ok: true, processadas: fila.length, prontas, erros };
  },
});
