/**
 * MIA-00 Smoke Test — Kimi K2.6 via Ollama
 * Executar: npx tsx scripts/smoke-kimi.ts
 * Requer: OLLAMA_BASE_URL e OLLAMA_MODEL em .env.local (raiz do projeto)
 *
 * Critérios de aprovação:
 *   - 5/5 conversas retornam JSON válido com schema { fatos, tarefas_sugeridas, confianca }
 *   - Latência média ≤ 10s | máxima ≤ 30s
 *   - Sem alucinações estruturais (campos corretos, confianca 0–1)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Carregar .env.local da raiz ────────────────────────────────────────────
try {
  const content = readFileSync(join(__dirname, '../.env.local'), 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // sem .env.local — usa env atual
}

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const MODEL    = process.env.OLLAMA_MODEL ?? 'kimi-k2.6:cloud';
const TIMEOUT  = 30_000;

// ─── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um analisador de conversas de food delivery brasileiro.
Dado uma mensagem de cliente, retorne APENAS um JSON válido (sem markdown, sem explicação) no schema exato:
{
  "fatos": ["string"],
  "tarefas_sugeridas": ["string"],
  "confianca": number
}

Regras:
- Responda SOMENTE com o JSON puro, nada antes ou depois
- "fatos": lista de fatos objetivos extraídos (mínimo 1 item, mesmo que seja "mensagem sem conteúdo relevante")
- "tarefas_sugeridas": ações recomendadas para o atendente (pode ser lista vazia)
- "confianca": número de 0.0 a 1.0 indicando sua confiança na análise`;

// ─── 5 conversas de teste em pt-BR ──────────────────────────────────────────
const CONVERSATIONS = [
  {
    id: 'C1',
    label: 'Pedido atrasado — cliente impaciente',
    msg: 'Oi, meu pedido faz 1 hora que saiu pra entrega e ainda não chegou. Número do pedido é #45231. Já tô com fome e o app diz que foi entregue mas não recebi nada.',
  },
  {
    id: 'C2',
    label: 'Dúvida sobre cardápio — restrição alimentar',
    msg: 'Boa tarde! Vocês têm opções sem glúten? Sou celíaco e quero pedir um prato mas preciso saber quais pratos posso comer com segurança.',
  },
  {
    id: 'C3',
    label: 'Cancelamento de pedido',
    msg: 'Preciso cancelar o pedido #89012 com urgência. Mudei de endereço e não consigo receber mais aqui. O pedido ainda não saiu pra entrega?',
  },
  {
    id: 'C4',
    label: 'Elogio — cliente satisfeito',
    msg: 'Queria elogiar o serviço de ontem! Pedi às 19h e chegou em 25 minutos, tudo quentinho e bem embalado. O entregador foi super educado. Com certeza vou pedir sempre por aí.',
  },
  {
    id: 'C5',
    label: 'Ruído / mensagem sem contexto',
    msg: 'kkkkkkkkk oi oi oi teste 123 não é nada não pode ignorar haha rsrsrs',
  },
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface KimiResponse {
  fatos: string[];
  tarefas_sugeridas: string[];
  confianca: number;
}

interface TestResult {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  parsed?: KimiResponse;
  rawPreview?: string;
  error?: string;
}

// ─── Chamada à API Ollama ────────────────────────────────────────────────────
async function callOllama(userMessage: string): Promise<{ text: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const start = Date.now();

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_predict: 512 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as {
      message?: { content?: string };
      error?: string;
    };

    if (data.error) throw new Error(data.error);

    return { text: data.message?.content ?? '', latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Validação de schema ─────────────────────────────────────────────────────
function validateSchema(raw: string): KimiResponse {
  let obj: unknown;

  try {
    obj = JSON.parse(raw.trim());
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta não contém JSON');
    obj = JSON.parse(match[0]);
  }

  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Raiz não é um objeto JSON');
  }

  const r = obj as Record<string, unknown>;

  if (!Array.isArray(r.fatos)) {
    throw new Error('Campo "fatos" ausente ou não é array');
  }
  if (!Array.isArray(r.tarefas_sugeridas)) {
    throw new Error('Campo "tarefas_sugeridas" ausente ou não é array');
  }
  if (typeof r.confianca !== 'number') {
    throw new Error('Campo "confianca" ausente ou não é number');
  }
  if (r.confianca < 0 || r.confianca > 1) {
    throw new Error(`"confianca" fora do range 0–1: ${r.confianca}`);
  }
  if ((r.fatos as unknown[]).length === 0) {
    throw new Error('"fatos" está vazio — mínimo 1 item obrigatório');
  }

  return {
    fatos:             r.fatos             as string[],
    tarefas_sugeridas: r.tarefas_sugeridas as string[],
    confianca:         r.confianca         as number,
  };
}

// ─── Executa um teste ────────────────────────────────────────────────────────
async function runTest(conv: (typeof CONVERSATIONS)[number]): Promise<TestResult> {
  process.stdout.write(`  [${conv.id}] ${conv.label} ... `);

  try {
    const { text, latencyMs } = await callOllama(conv.msg);
    const parsed = validateSchema(text);
    console.log(
      `✅ ${latencyMs}ms | confianca=${parsed.confianca.toFixed(2)} | ` +
      `fatos=${parsed.fatos.length} | tarefas=${parsed.tarefas_sugeridas.length}`
    );
    return { id: conv.id, label: conv.label, ok: true, latencyMs, parsed, rawPreview: text.slice(0, 120) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const isAbort = error.includes('abort') || error.includes('Abort');
    const tag = isAbort ? `⏱ TIMEOUT (>${TIMEOUT / 1000}s)` : `❌ ${error.slice(0, 80)}`;
    console.log(tag);
    return { id: conv.id, label: conv.label, ok: false, latencyMs: isAbort ? TIMEOUT : 0, error };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  MIA-00 Smoke Test — Kimi K2.6 via Ollama               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  BASE_URL : ${BASE_URL}`);
  console.log(`  MODEL    : ${MODEL}`);
  console.log(`  TIMEOUT  : ${TIMEOUT / 1000}s por conversa`);
  console.log('');

  if (!process.env.OLLAMA_BASE_URL) {
    console.log('  ⚠️  OLLAMA_BASE_URL não definido em .env.local — usando localhost:11434');
    console.log('      Para Ollama Cloud/remoto, defina OLLAMA_BASE_URL=https://<seu-host>');
    console.log('');
  }

  console.log('─── Conversas ────────────────────────────────────────────────');

  const results: TestResult[] = [];
  for (const conv of CONVERSATIONS) {
    results.push(await runTest(conv));
  }

  const passed   = results.filter(r => r.ok).length;
  const failed   = results.length - passed;
  const okLats   = results.filter(r => r.ok).map(r => r.latencyMs);
  const avgMs    = okLats.length ? Math.round(okLats.reduce((a, b) => a + b, 0) / okLats.length) : 0;
  const maxMs    = okLats.length ? Math.max(...okLats) : 0;

  const c1 = passed === CONVERSATIONS.length;
  const c2 = avgMs <= 10_000;
  const c3 = maxMs <= 30_000;
  const approved = c1 && c2 && c3;

  console.log('');
  console.log('─── VEREDITO ─────────────────────────────────────────────────');
  console.log(`  Testes aprovados : ${passed}/${CONVERSATIONS.length} ${c1 ? '✅' : '❌'}`);
  console.log(`  Latência média   : ${avgMs}ms ${c2 ? '✅ (≤10s)' : '❌ (>10s)'}`);
  console.log(`  Latência máxima  : ${maxMs}ms ${c3 ? '✅ (≤30s)' : '❌ (>30s)'}`);
  console.log('');

  if (approved) {
    console.log('  🟢 APROVADO — Kimi K2.6 validado. Prosseguir com MIA-01.');
  } else {
    console.log('  🔴 REPROVADO — corrigir antes de integrar ao Monitor IA.');
    if (failed > 0) {
      console.log('');
      console.log('  Detalhes das falhas:');
      for (const r of results.filter(r => !r.ok)) {
        console.log(`    ${r.id} (${r.label}): ${r.error}`);
      }
    }
    if (!c2) {
      console.log(`  ⚡ Latência média ${avgMs}ms acima do limite de 10s — checar recursos do servidor Ollama`);
    }
  }
  console.log('');

  process.exit(approved ? 0 : 1);
}

main().catch(err => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
