'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Resumo IA de comentários de avaliação (endpoint autenticado JWT)
//
// Endpoints:
//   POST /api/avaliacao/resumo
//     Busca comentários de avaliação do tenant, chama Claude Haiku,
//     retorna resumo + temas + ação sugerida.
//     Requer JWT Supabase + membership no tenant.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const fetch   = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAIKU_MODEL       = 'claude-haiku-4-5-20251001';
const MAX_COMENTARIOS   = 300;

module.exports = function buildAvaliacaoResumoRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/avaliacao/resumo
  //   Body: { tenant_id: uuid }  (opcional — usa tenant do JWT se omitido)
  //   401 sem JWT | 400 sem tenant_id | 503 sem ANTHROPIC_API_KEY
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/avaliacao/resumo', requireJwt, async (req, res) => {
    if (!ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurado' });
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

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      HAIKU_MODEL,
          max_tokens: 1024,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!anthropicRes.ok) {
        const detail = await anthropicRes.text().catch(() => '');
        console.error('[avaliacao/resumo] Anthropic error', anthropicRes.status, detail);
        return res.status(502).json({ error: `Anthropic error ${anthropicRes.status}` });
      }

      const data    = await anthropicRes.json();
      const rawText = data.content?.[0]?.text ?? '';

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
      console.error('[avaliacao/resumo POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
