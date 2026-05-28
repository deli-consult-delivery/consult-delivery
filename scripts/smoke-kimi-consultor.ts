/**
 * MIA-00 BIS Smoke Test — Kimi K2.6 no contexto consultor↔dono de restaurante
 * Executar: npx tsx scripts/smoke-kimi-consultor.ts
 * Requer: OLLAMA_BASE_URL e OLLAMA_MODEL em .env.local (raiz do projeto)
 *
 * Critérios de aprovação:
 *   - 5/5 conversas retornam JSON válido com schema { fatos, tarefas_sugeridas, confianca }
 *   - confianca: "alta" | "media" | "baixa" (string, não number)
 *   - Latência média ≤ 10s | máxima ≤ 30s
 *   - Toda saída tem "evidencia" literal (anti-alucinação)
 *   - Arrays vazios OK se conversa casual; confianca="alta" nesse caso
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

// ─── System prompt — seção 7.1 do MIA-PLANO-COMPLETO ──────────────────────
const SYSTEM_PROMPT = `Você é um assistente que analisa mensagens recentes de WhatsApp entre o time de consultoria de delivery (Consult Delivery) e o dono de uma loja cliente.

Sua tarefa: extrair APENAS o que está EXPLÍCITO na conversa.

Retorne JSON neste schema EXATO:
{
  "fatos": [
    {
      "texto": "fato afirmado pelo cliente sobre a loja, operação, horário, cardápio, equipe, problema recorrente, etc.",
      "evidencia": "trecho LITERAL da mensagem"
    }
  ],
  "tarefas_sugeridas": [
    {
      "titulo": "ação concreta combinada (verbo no infinitivo)",
      "evidencia": "trecho LITERAL da mensagem",
      "prioridade": "alta" | "media" | "baixa",
      "responsavel_sugerido": "consultor" | "cliente" | "indefinido"
    }
  ],
  "confianca": "alta" | "media" | "baixa"
}

REGRAS:
- Se a conversa é casual/sem demanda: retorne arrays vazios + confianca:"alta"
- NUNCA invente. Toda saída tem evidência literal copiada
- Português brasileiro
- Máximo 5 itens em cada array
- Se incerto: confianca:"baixa"`;

// ─── 5 conversas de teste — consultor ↔ dono de restaurante ─────────────────
const CONVERSATIONS = [
  {
    id: 'C1',
    label: 'Horário de funcionamento e problema no cardápio',
    msg: `Consultor: Bom dia Marcos! Revisando o painel aqui, vi que as avaliações do sábado à noite caíram. O que aconteceu?
Dono: Bom dia Wandson! É, a gente ficou sem o prato mais pedido, a moqueca de camarão. O fornecedor atrasou a entrega.
Consultor: Entendi. Isso acontece com frequência?
Dono: Às vezes sim, especialmente nas sextas. O fornecedor é o Pedro do Mercado Central, ele é irregular.
Consultor: Vou anotar. A gente precisa te ajudar a montar um cardápio backup pra esses casos.
Dono: Seria ótimo! Prefiro manter o restaurante aberto das 11h às 23h de terça a domingo.`,
  },
  {
    id: 'C2',
    label: 'Demanda de campanha e desconto',
    msg: `Consultor: Wélida aqui! Marcos, a gente viu que você não tem nenhuma promoção ativa no iFood. Quer que a gente monte uma pra essa semana?
Dono: Sim! Quero fazer um desconto de 15% no combo executivo de segunda a quarta.
Consultor: Certo. Só pra confirmar: o combo executivo é o prato + sobremesa + bebida por R$42?
Dono: Isso mesmo. Mas o desconto só vale pra pedidos acima de R$35.
Consultor: Ok, vou criar a campanha amanhã de manhã. Você tem limite de orçamento?
Dono: Umas 50 ativações por dia tá bom.`,
  },
  {
    id: 'C3',
    label: 'Reclamação de cliente e equipe',
    msg: `Dono: Wandson, tivemos uma reclamação grave hoje. Cliente falou que o entregador foi rude com ele.
Consultor: Que situação! O entregador é seu ou da plataforma?
Dono: É meu, o Carlos. Já é a segunda reclamação dele esse mês.
Consultor: Entendo. Precisa fazer uma conversa com ele. Quer ajuda pra montar o roteiro?
Dono: Sim, me ajuda aí. E outra coisa: tô pensando em contratar mais uma atendente pra pico do almoço, das 11h30 às 14h.
Consultor: Faz sentido. Vou te mandar um modelo de contrato CLT simplificado.`,
  },
  {
    id: 'C4',
    label: 'Conversa casual sem demanda',
    msg: `Dono: Oi Wandson! Tudo bem?
Consultor: Tudo sim! E você, Marcos?
Dono: Correndo haha. Semana puxada.
Consultor: Imagino! Qualquer coisa é só chamar.
Dono: Pode deixar, valeu!`,
  },
  {
    id: 'C5',
    label: 'Mudança de endereço e integração iFood',
    msg: `Dono: Eduardo, precisamos atualizar o endereço do restaurante no iFood. A gente mudou de endereço semana passada.
Consultor: Boa tarde! Qual o novo endereço?
Dono: Rua das Flores, 248, Pinheiros. CEP 05422-000.
Consultor: Já atualizo no painel. Mais alguma coisa?
Dono: Sim, a foto do estabelecimento tá antiga. Tenho fotos novas aqui, como mando?
Consultor: Pode mandar por aqui mesmo. Precisa ser JPEG, mínimo 600x400px.
Dono: Perfeito, mando ainda hoje.`,
  },
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Fato {
  texto: string;
  evidencia: string;
}

interface TarefaSugerida {
  titulo: string;
  evidencia: string;
  prioridade: 'alta' | 'media' | 'baixa';
  responsavel_sugerido: 'consultor' | 'cliente' | 'indefinido';
}

interface MiaResponse {
  fatos: Fato[];
  tarefas_sugeridas: TarefaSugerida[];
  confianca: 'alta' | 'media' | 'baixa';
}

interface TestResult {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  parsed?: MiaResponse;
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
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OLLAMA_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_predict: 1024 },
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
function validateSchema(raw: string): MiaResponse {
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

  if (!Array.isArray(r.fatos)) throw new Error('"fatos" ausente ou não é array');
  if (!Array.isArray(r.tarefas_sugeridas)) throw new Error('"tarefas_sugeridas" ausente ou não é array');
  if (!['alta', 'media', 'baixa'].includes(r.confianca as string)) {
    throw new Error(`"confianca" deve ser "alta"|"media"|"baixa", recebido: ${JSON.stringify(r.confianca)}`);
  }

  // Validar cada fato tem evidencia
  for (const [i, f] of (r.fatos as Record<string, unknown>[]).entries()) {
    if (!f.texto) throw new Error(`fatos[${i}] sem "texto"`);
    if (!f.evidencia) throw new Error(`fatos[${i}] sem "evidencia" — violação anti-alucinação`);
  }

  // Validar cada tarefa tem evidencia
  for (const [i, t] of (r.tarefas_sugeridas as Record<string, unknown>[]).entries()) {
    if (!t.titulo) throw new Error(`tarefas_sugeridas[${i}] sem "titulo"`);
    if (!t.evidencia) throw new Error(`tarefas_sugeridas[${i}] sem "evidencia" — violação anti-alucinação`);
    if (!['alta', 'media', 'baixa'].includes(t.prioridade as string)) {
      throw new Error(`tarefas_sugeridas[${i}].prioridade inválida: ${JSON.stringify(t.prioridade)}`);
    }
    if (!['consultor', 'cliente', 'indefinido'].includes(t.responsavel_sugerido as string)) {
      throw new Error(`tarefas_sugeridas[${i}].responsavel_sugerido inválido: ${JSON.stringify(t.responsavel_sugerido)}`);
    }
  }

  return {
    fatos: r.fatos as Fato[],
    tarefas_sugeridas: r.tarefas_sugeridas as TarefaSugerida[],
    confianca: r.confianca as 'alta' | 'media' | 'baixa',
  };
}

// ─── Executa um teste ────────────────────────────────────────────────────────
async function runTest(conv: (typeof CONVERSATIONS)[number]): Promise<TestResult> {
  process.stdout.write(`  [${conv.id}] ${conv.label} ... `);

  try {
    const { text, latencyMs } = await callOllama(conv.msg);
    const parsed = validateSchema(text);
    console.log(
      `✅ ${latencyMs}ms | confianca=${parsed.confianca} | ` +
      `fatos=${parsed.fatos.length} | tarefas=${parsed.tarefas_sugeridas.length}`
    );
    return { id: conv.id, label: conv.label, ok: true, latencyMs, parsed, rawPreview: text.slice(0, 120) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const isAbort = error.includes('abort') || error.includes('Abort');
    const tag = isAbort ? `⏱ TIMEOUT (>${TIMEOUT / 1000}s)` : `❌ ${error.slice(0, 100)}`;
    console.log(tag);
    return { id: conv.id, label: conv.label, ok: false, latencyMs: isAbort ? TIMEOUT : 0, error };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MIA-00 BIS Smoke Test — contexto consultor↔dono            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  BASE_URL : ${BASE_URL}`);
  console.log(`  MODEL    : ${MODEL}`);
  console.log(`  TIMEOUT  : ${TIMEOUT / 1000}s por conversa`);
  console.log('');

  if (!process.env.OLLAMA_BASE_URL) {
    console.log('  ⚠️  OLLAMA_BASE_URL não definido — usando localhost:11434');
    console.log('      Para Ollama Cloud, defina OLLAMA_BASE_URL e OLLAMA_API_KEY em .env.local');
    console.log('');
  }

  console.log('─── Conversas consultor↔dono ─────────────────────────────────');

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
    console.log('  🟢 APROVADO — Kimi K2.6 validado no contexto consultor↔dono. Prosseguir com MIA-01.');
  } else {
    console.log('  🔴 REPROVADO — corrigir antes de prosseguir com MIA-01.');
    if (failed > 0) {
      console.log('');
      console.log('  Detalhes das falhas:');
      for (const r of results.filter(r => !r.ok)) {
        console.log(`    ${r.id} (${r.label}): ${r.error}`);
      }
    }
    if (!c2) {
      console.log(`  ⚡ Latência média ${avgMs}ms acima do limite de 10s`);
    }
  }
  console.log('');

  process.exit(approved ? 0 : 1);
}

main().catch(err => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
