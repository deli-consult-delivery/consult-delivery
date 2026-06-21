'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Resumo IA de comentários de avaliação (endpoint autenticado JWT)
//
// Endpoints:
//   POST /api/avaliacao/resumo
//     Busca comentários de avaliação do tenant, chama Ollama/Kimi K2.6,
//     retorna resumo + temas + ação sugerida.
//     Requer JWT Supabase + membership no tenant.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
// Node 22 expõe `fetch` global nativo — sem dependência de node-fetch (ESM-only,
// não é `require`-ável). Mesmo padrão dos demais routers do bridge.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_API_KEY  = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL    = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'kimi-k2.6:cloud';
const TIMEOUT_MS      = 120_000;
const MAX_COMENTARIOS = 300;

module.exports = function buildAvaliacaoResumoRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/avaliacao/resumo
  //   Body: { tenant_id: uuid }
  //   401 sem JWT | 400 sem tenant_id | 503 sem OLLAMA_BASE_URL
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/avaliacao/resumo', requireJwt, async (req, res) => {
    if (!OLLAMA_BASE_URL) {
      return res.status(503).json({ error: 'OLLAMA_BASE_URL não configurado' });
    }

    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id obrigatório' });
    }

    // Verificar membership antes de expor dados
    if (!await assertTenantMember(req, res, tenant_id)) return;

    try {
      // Buscar comentários respondidos (últimos MAX_COMENTARIOS)
      const rows = await sbFetch(
        `atendimento_avaliacoes?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.respondida&comentario=not.is.null&select=nota,comentario,atendente_nome,responded_at&order=responded_at.desc&limit=${MAX_COMENTARIOS}`
      );

      if (!rows || rows.length === 0) {
        return res.status(200).json({
          resumo: 'Nenhum comentário disponível para análise.',
          temas_positivos: [],
          temas_negativos: [],
          acao_sugerida: '',
          total_analisados: 0,
        });
      }

      const blocos = rows.map(r =>
        `[Nota ${r.nota}${r.atendente_nome ? ` | ${r.atendente_nome}` : ''}]: ${r.comentario}`
      ).join('\n');

      const prompt = `Você é um analista de experiência do cliente. Analise os comentários de avaliação de atendimento abaixo e responda SOMENTE com JSON válido no formato:
{
  "resumo": "Parágrafo curto (2-3 frases) sobre a satisfação geral dos clientes",
  "temas_positivos": ["tema 1", "tema 2", "tema 3"],
  "temas_negativos": ["tema 1", "tema 2"],
  "acao_sugerida": "Uma ação concreta e específica que a equipe deve tomar"
}

Comentários (${rows.length} no total):
${blocos}

Regras: português brasileiro, objetivo, baseado apenas nos comentários fornecidos, sem inventar dados.`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let ollamaRes;
      try {
        ollamaRes = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model:    OLLAMA_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream:   false,
            format:   'json',
            options:  { temperature: 0.1, num_predict: 8192 },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!ollamaRes.ok) {
        const detail = await ollamaRes.text().catch(() => '');
        console.error('[avaliacao/resumo] Ollama error', ollamaRes.status, detail);
        return res.status(502).json({ error: `Ollama error ${ollamaRes.status}` });
      }

      const data    = await ollamaRes.json();
      const rawText = data.message?.content ?? '';

      // Extrair JSON da resposta
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[avaliacao/resumo] JSON não encontrado na resposta:', rawText.slice(0, 200));
        return res.status(502).json({ error: 'Resposta inválida da IA' });
      }

      const resultado = JSON.parse(jsonMatch[0]);

      return res.status(200).json({
        ...resultado,
        total_analisados: rows.length,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('[avaliacao/resumo] Timeout após', TIMEOUT_MS / 1000, 's');
        return res.status(504).json({ error: 'Timeout ao gerar resumo' });
      }
      console.error('[avaliacao/resumo POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
