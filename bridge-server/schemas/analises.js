'use strict';

const { z } = require('zod');

// ── GET /api/lojas/:id/analises — query params ────────────────────────────────
const ListAnalisesQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── POST /api/lojas/:id/analises — criar nova análise (rascunho) ─────────────
const CreateAnaliseSchema = z.object({
  loom_url:     z.string().url().optional().nullable(),
  tipo:         z.enum(['inicial', 'periodica', 'urgente']).default('periodica'),
  transcricao:  z.string().min(10).optional().nullable(),
});

// ── POST /api/lojas/:id/analises/processar — disparar task ───────────────────
const ProcessarAnaliseSchema = z.object({
  analise_id: z.string().uuid(),
});

module.exports = {
  ListAnalisesQuerySchema,
  CreateAnaliseSchema,
  ProcessarAnaliseSchema,
};
