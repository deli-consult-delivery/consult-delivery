'use strict';

const { z } = require('zod');

// ── Item de avaliação colado do portal iFood ─────────────────────────────────
const AvaliacaoItemSchema = z.object({
  nota:         z.coerce.number().int().min(1).max(5),
  comentario:   z.string().trim().min(1, 'comentário obrigatório'),
  nome_cliente: z.string().trim().max(120).optional().nullable(),
  tipo:         z.enum(['loja', 'entrega']),
  prazo_label:  z.string().trim().max(40).optional().nullable(),
});

// ── POST /lojas/:id/avaliacoes/gerar ─────────────────────────────────────────
const GerarAvaliacoesSchema = z.object({
  avaliacoes: z.array(AvaliacaoItemSchema).min(1, 'envie ao menos 1 avaliação').max(30),
});

// ── POST /lojas/:id/avaliacoes/enviar-grupo ──────────────────────────────────
const EnviarGrupoSchema = z.object({
  avaliacaoIds: z.array(z.string().uuid()).min(1).max(30),
  intervalo_ms: z.coerce.number().int().min(0).max(60_000).optional(),
});

// ── POST /lojas/:id/avaliacoes/sugerir-tom ───────────────────────────────────
const SugerirTomSchema = z.object({
  exemplos: z.array(z.string().trim().max(2000)).max(20).optional(),
});

module.exports = {
  AvaliacaoItemSchema,
  GerarAvaliacoesSchema,
  EnviarGrupoSchema,
  SugerirTomSchema,
};
