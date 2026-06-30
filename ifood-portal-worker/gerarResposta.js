// gerarResposta.js — FASE 2 do épico "Consultor de iFood".
// Recebe uma avaliação lida do Portal (nota 1-5, comentario, autor?) e devolve um TEXTO de
// resposta PERSONALIZADA em PT-BR, em nome da loja "Café Container - Lanches e Salgados",
// pronto para ser publicado como resposta à avaliação.
//
// SEGURANÇA (inviolável nesta fase): este módulo SÓ GERA TEXTO. NÃO envia, NÃO preenche, NÃO
// abre o portal. O texto é um DRAFT (semáforo amarelo) — o envio é supervisionado pelo Wandson
// numa fase posterior. Nada vai a cliente aqui.
//
// Sem throw no topo do módulo: a API key e o provider são resolvidos em getter lazy, só na chamada.
'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const LOJA = 'Café Container - Lanches e Salgados';
const MODELO_ANTHROPIC = 'claude-sonnet-4-6';
const MODELO_OPENROUTER = 'anthropic/claude-sonnet-4.6'; // mesmo modelo Claude via OpenRouter
const MIN_CHARS = 20;
const MAX_CHARS = 600; // resposta de avaliação iFood é breve

// ── Entrada validada no boundary ──────────────────────────────────────────────
const AvaliacaoInputSchema = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z.string().min(1),
  autor: z.string().nullable().optional(),
});

// ── Resolução de credencial (lazy, sem throw no topo) ─────────────────────────
// Prioriza ANTHROPIC_API_KEY (padrão do projeto, trigger/_shared/claude.ts). Se ausente no
// ambiente, tenta carregar do bridge-server/.env (apenas LEITURA — nunca escreve nesse arquivo) e,
// como camada multi-provider já decidida no épico (D1: Anthropic/OpenRouter, fallback), usa
// OPENROUTER_API_KEY rodando o MESMO modelo Claude. Nenhuma chave é hardcoded.
// ponytail: parser de .env de 4 linhas em vez de adicionar a dep dotenv ao worker.
function loadEnvFromBridge() {
  const candidatos = [
    path.join(__dirname, '..', 'bridge-server', '.env'),
    '/root/consult-delivery/bridge-server/.env',
  ];
  for (const p of candidatos) {
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch {
      continue; // arquivo ausente nesta cópia (ex.: worktree) → tenta o próximo
    }
    for (const linha of raw.split('\n')) {
      const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue; // ambiente vence o arquivo
      process.env[k] = vRaw.replace(/^["']|["']$/g, '');
    }
    return; // primeiro arquivo encontrado basta
  }
}

function getProvider() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    loadEnvFromBridge();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { tipo: 'anthropic', key: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { tipo: 'openrouter', key: process.env.OPENROUTER_API_KEY };
  }
  throw new Error(
    'Nenhuma API key disponível: defina ANTHROPIC_API_KEY (preferida) ou OPENROUTER_API_KEY ' +
      'no ambiente ou em bridge-server/.env. Nenhuma chave é hardcoded.'
  );
}

// ── Prompt ────────────────────────────────────────────────────────────────────
function systemPrompt() {
  return [
    `Você responde avaliações de clientes no iFood em nome da loja "${LOJA}".`,
    'Escreva a resposta SEMPRE em português do Brasil, com tom humano (nunca robótico),',
    'profissional e CURTO (resposta de avaliação no iFood é breve, 1 a 3 frases).',
    '',
    'Personalize lendo o comentário e a nota:',
    '- Nota baixa (1 a 3): demonstre empatia, reconheça o problema ESPECÍFICO citado pelo cliente,',
    '  e sinalize melhoria/solução. Não seja defensivo. Não prometa o impossível.',
    '- Nota alta (4 a 5): agradeça de forma calorosa e ESPECÍFICA ao que o cliente elogiou.',
    '',
    'Regras fixas: não inclua dados sensíveis; não use placeholders como [nome] ou {{algo}};',
    'não repita assinatura genérica; cite o que o comentário disse para soar pessoal.',
    'Responda APENAS com o texto da resposta — sem aspas, sem rótulos, sem explicação.',
  ].join('\n');
}

function userPrompt(av) {
  const linhas = [
    `Nota: ${av.nota} de 5`,
    `Comentário do cliente: "${av.comentario}"`,
  ];
  if (av.autor) linhas.push(`Cliente: ${av.autor}`);
  linhas.push('', 'Escreva a resposta da loja a esta avaliação.');
  return linhas.join('\n');
}

// ── Chamada ao LLM (fetch nativo do Node 22 — ponytail: sem SDK/dep nova) ──────
async function callAnthropic(key, system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO_ANTHROPIC,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function callOpenRouter(key, system, user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODELO_OPENROUTER,
      max_tokens: 512,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// ── Validação de saída (boundary) ─────────────────────────────────────────────
const PLACEHOLDER_RX = /\[[^\]]+\]|\{\{[^}]+\}\}/; // [nome], {{algo}} → rejeita
const RespostaSchema = z
  .string()
  .trim()
  .min(MIN_CHARS, `resposta curta demais (< ${MIN_CHARS} chars)`)
  .max(MAX_CHARS, `resposta longa demais (> ${MAX_CHARS} chars)`)
  .refine((s) => !PLACEHOLDER_RX.test(s), 'resposta contém placeholder não preenchido');

/**
 * Gera o TEXTO de resposta personalizada para uma avaliação do iFood.
 * @param {{nota:number, comentario:string, autor?:string|null}} avaliacao
 * @returns {Promise<string>} texto pronto para publicação (DRAFT — não é enviado aqui)
 */
async function gerarResposta(avaliacao) {
  const av = AvaliacaoInputSchema.parse(avaliacao); // valida entrada não-confiável
  const provider = getProvider();
  const system = systemPrompt();
  const user = userPrompt(av);

  const texto =
    provider.tipo === 'anthropic'
      ? await callAnthropic(provider.key, system, user)
      : await callOpenRouter(provider.key, system, user);

  return RespostaSchema.parse(texto); // valida o boundary de saída
}

module.exports = { gerarResposta, AvaliacaoInputSchema, RespostaSchema };
