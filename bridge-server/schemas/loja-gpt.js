'use strict';

const { z } = require('zod');

// ── GET /api/lojas/:id/loja-gpt/conversations — query params ─────────────────
const ListConversationsQuerySchema = z.object({
  arquivada:  z.enum(['true', 'false']).optional().default('false'),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
});

// ── POST /api/lojas/:id/loja-gpt/conversations — body ────────────────────────
const CreateConversationSchema = z.object({
  titulo: z.string().min(1).max(500).optional().nullable(),
});

// ── GET /api/loja-gpt/conversations/:id — query params ───────────────────────
const GetConversationQuerySchema = z.object({
  messages_limit:  z.coerce.number().int().min(1).max(100).default(50),
  messages_offset: z.coerce.number().int().min(0).default(0),
});

// ── POST /api/loja-gpt/conversations/:id/messages — body ─────────────────────
// D3: tenant_id NÃO vem do body — bridge busca via lojas.tenant_id
const CreateMessageSchema = z.object({
  pergunta: z.string().min(1).max(4000),
});

// ── PATCH /api/loja-gpt/conversations/:id — body ─────────────────────────────
const UpdateConversationSchema = z.object({
  arquivada:    z.boolean().optional(),
  titulo:       z.string().min(1).max(500).optional().nullable(),
  resumo_curto: z.string().min(1).max(1000).optional().nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'nenhum campo válido para atualizar' }
);

module.exports = {
  ListConversationsQuerySchema,
  CreateConversationSchema,
  GetConversationQuerySchema,
  CreateMessageSchema,
  UpdateConversationSchema,
};
