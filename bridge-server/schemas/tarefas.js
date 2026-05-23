'use strict';
const { z } = require('zod');

const BLOCOS = ['identidade', 'cardapio', 'operacao', 'avaliacoes', 'marketing', 'suporte'];
const STATUS_VALUES = [
  'rascunho', 'aguardando_envio', 'aguardando_aprovacao', 'aprovada',
  'rejeitada', 'em_execucao', 'aguardando_validacao', 'concluida', 'cancelada',
];
const PRIORIDADES = ['quick_win', 'estrutural', 'material_cliente'];
const ACOES_APROVACAO = [
  'enviada_aprovacao', 'aprovada', 'rejeitada', 'perguntou_duvida',
  'iniciou_execucao', 'submeteu_validacao', 'concluiu', 'reabriu',
];

const UuidSchema = z.string().uuid('UUID inválido');

// ── Lote 1 ──────────────────────────────────────────────────────────────────

// GET /api/tarefas/loja/:lojaId — query params
const ListTarefasQuerySchema = z.object({
  status:         z.enum(STATUS_VALUES).optional(),
  bloco:          z.enum(BLOCOS).optional(),
  responsavel_id: UuidSchema.optional(),
  prioridade:     z.enum(PRIORIDADES).optional(),
  limit:          z.coerce.number().int().min(1).max(100).default(50),
  offset:         z.coerce.number().int().min(0).default(0),
});

// POST /api/tarefas/loja/:lojaId — body
const CreateTarefaSchema = z.object({
  titulo:          z.string().min(1).max(500),
  bloco:           z.enum(BLOCOS),
  situacao:        z.string().min(1).max(2000),
  o_que_sera_feito: z.string().min(1).max(2000),
  por_que_importa: z.string().max(2000).optional().nullable(),
  prioridade:      z.enum(PRIORIDADES).default('estrutural'),
  ordem_no_bloco:  z.coerce.number().int().min(0).default(0),
  prazo_estimado:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD').optional().nullable(),
  responsavel_id:  UuidSchema.optional().nullable(),
  metadata:        z.record(z.unknown()).default({}),
  tags:            z.array(z.string()).default([]),
});

// ── Lote 2 ──────────────────────────────────────────────────────────────────

// POST /api/tarefas/loja/:lojaId/from-template — body
const CreateFromTemplateSchema = z.object({
  template_id:    UuidSchema,
  responsavel_id: UuidSchema.optional().nullable(),
  prazo_estimado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  ordem_no_bloco: z.coerce.number().int().min(0).optional(),
});

// PATCH /api/tarefas/:id — body (todos opcionais)
const UpdateTarefaSchema = z.object({
  titulo:          z.string().min(1).max(500).optional(),
  bloco:           z.enum(BLOCOS).optional(),
  situacao:        z.string().min(1).max(2000).optional(),
  o_que_sera_feito: z.string().min(1).max(2000).optional(),
  por_que_importa: z.string().max(2000).optional().nullable(),
  prioridade:      z.enum(PRIORIDADES).optional(),
  ordem_no_bloco:  z.coerce.number().int().min(0).optional(),
  prazo_estimado:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  responsavel_id:  UuidSchema.optional().nullable(),
  metadata:        z.record(z.unknown()).optional(),
  tags:            z.array(z.string()).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'Ao menos um campo obrigatório' });

// POST /api/tarefas/:id/enviar-aprovacao — body
const EnviarAprovacaoSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// POST /api/tarefas/:id/aprovar — body
const AprovarSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// ── Lote 3 ──────────────────────────────────────────────────────────────────

// POST /api/tarefas/:id/rejeitar — body
const RejeitarSchema = z.object({
  nota: z.string().min(1).max(2000, 'Nota obrigatória ao rejeitar'),
});

// POST /api/tarefas/:id/iniciar-execucao — body
const IniciarExecucaoSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// POST /api/tarefas/:id/submeter-validacao — body
const SubmeterValidacaoSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// POST /api/tarefas/:id/concluir — body
const ConcluirSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// POST /api/tarefas/:id/marcar-concluida — body (TD#31: compound 1-clique)
const MarcarConcluidaSchema = z.object({
  nota: z.string().max(2000).optional(),
});

// ── Lote 4 ──────────────────────────────────────────────────────────────────

// GET /api/tarefas/:id/comentarios — query
const ListComentariosQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// POST /api/tarefas/:id/comentarios — body
const CreateComentarioSchema = z.object({
  conteudo:  z.string().min(1).max(5000),
  interno:   z.boolean().default(true),
  parent_id: UuidSchema.optional().nullable(),
  print_id:  UuidSchema.optional().nullable(),
});

// GET /api/tarefas/loja/:lojaId/relatorio — query
const RelatorioQuerySchema = z.object({
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/tarefas/:id/prints — body (frontend faz upload no Storage; aqui registra metadados)
const CreatePrintSchema = z.object({
  tipo:          z.enum(['antes', 'depois', 'outro']),
  storage_path:  z.string().min(1),
  url_publica:   z.string().url().optional().nullable(),
  nome_arquivo:  z.string().min(1).max(255),
  tamanho_bytes: z.number().int().positive().optional().nullable(),
  mime_type:     z.string().optional().nullable(),
  legenda:       z.string().max(500).optional().nullable(),
});

module.exports = {
  BLOCOS, STATUS_VALUES, PRIORIDADES, ACOES_APROVACAO,
  ListTarefasQuerySchema,
  CreateTarefaSchema,
  CreateFromTemplateSchema,
  UpdateTarefaSchema,
  EnviarAprovacaoSchema,
  AprovarSchema,
  RejeitarSchema,
  IniciarExecucaoSchema,
  SubmeterValidacaoSchema,
  ConcluirSchema,
  MarcarConcluidaSchema,
  ListComentariosQuerySchema,
  CreateComentarioSchema,
  RelatorioQuerySchema,
  CreatePrintSchema,
};
