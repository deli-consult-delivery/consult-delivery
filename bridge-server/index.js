// bridge-server/index.js
require('dotenv').config();

const express  = require('express');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Env vars ────────────────────────────────────────────────────────────────
const BRIDGE_SECRET          = process.env.BRIDGE_SECRET;
const SUPABASE_URL           = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_BRIDGE_TOKEN  = process.env.INTERNAL_BRIDGE_TOKEN;
const NEXUS_CALLBACK_SECRET  = process.env.NEXUS_CALLBACK_SECRET;
const NEXUS_BASE_URL         = process.env.NEXUS_BASE_URL;
const NEXUS_API_KEY          = process.env.NEXUS_API_KEY;
const NEXUS_TICKET_BASE      = process.env.NEXUS_TICKET_BASE || 'http://187.127.25.24:8080';
const NEXUS_TICKET_TOKEN     = process.env.NEXUS_TICKET_TOKEN;
const TRIGGER_SECRET_KEY     = process.env.TRIGGER_SECRET_KEY;
const TRIGGER_API_URL        = 'https://api.trigger.dev';
const ASAAS_WEBHOOK_SECRET   = process.env.ASAAS_WEBHOOK_SECRET;
const ASAAS_API_KEY          = process.env.ASAAS_API_KEY;
const ANTHROPIC_API_KEY      = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL        = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
// EvoNexus webhook trigger IDs (visibilidade no painel, fire-and-forget)
const NEXUS_TRIGGER_IDS = { pesquisa: 3, regua: 2, midia: 1 };
// In-memory job store para polling de status (request_id → estado)
const nexusJobs = new Map();

app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-bridge-secret, Authorization, x-internal-token, x-nexus-signature');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Middleware: JWT Supabase ──────────────────────────────────────────────────
async function requireJwt(req, res, next) {
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return res.status(401).json({ error: 'missing token' });
  if (!SUPABASE_ANON_KEY) {
    req.user = { id: 'dev' };
    return next();
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${auth}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) return res.status(401).json({ error: 'invalid token' });
    req.user = await r.json();
    req.jwt  = auth;
    next();
  } catch (err) {
    res.status(401).json({ error: 'auth error', detail: err.message });
  }
}

// ── Middleware: internal token ───────────────────────────────────────────────
function requireInternalToken(req, res, next) {
  if (!INTERNAL_BRIDGE_TOKEN) return next();
  if (req.headers['x-internal-token'] !== INTERNAL_BRIDGE_TOKEN)
    return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ── Middleware: JWT or internal token (para endpoints chamados por Trigger.dev) ─
async function requireJwtOrInternal(req, res, next) {
  const internalToken = req.headers['x-internal-token'];
  if (internalToken) {
    if (!INTERNAL_BRIDGE_TOKEN || internalToken !== INTERNAL_BRIDGE_TOKEN)
      return res.status(401).json({ error: 'unauthorized' });
    return next();
  }
  return requireJwt(req, res, next);
}

// ── Helper: Supabase REST write (service role) ────────────────────────────────
async function supabaseSelect(table, filters = {}) {
  if (!SUPABASE_SERVICE_KEY) return null;
  const qs = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`supabase ${table} select ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] ?? null : null;
}

async function supabaseUpdate(table, filters = {}, updates = {}) {
  if (!SUPABASE_SERVICE_KEY) return null;
  const qs = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error(`supabase ${table} update ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function supabaseInsert(table, row) {
  if (!SUPABASE_SERVICE_KEY) {
    console.warn(`[bridge] supabaseInsert(${table}): sem SUPABASE_SERVICE_ROLE_KEY, ignorado`);
    return null;
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase ${table} insert ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. POST /invoke/lara — DEPRECIADO (OpenClaw aposentado — Fase 4)
// ════════════════════════════════════════════════════════════════════════════
app.post('/invoke/lara', (_req, res) => {
  res.status(410).json({ error: 'endpoint depreciado — use /agents/lara-*/run (Trigger.dev)' });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. POST /api/nexus-dispatch/:agent — DEPRECIADO (OpenClaw aposentado — Fase 4)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/nexus-dispatch/:agent', (_req, res) => {
  res.status(410).json({ error: 'endpoint depreciado — OpenClaw aposentado na Fase 4' });
});

// ════════════════════════════════════════════════════════════════════════════
// 2b. GET /api/nexus-status/:request_id — LARA faz polling do resultado
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/nexus-status/:request_id', requireInternalToken, (req, res) => {
  const { request_id } = req.params;
  const job = nexusJobs.get(request_id);
  if (!job) return res.status(404).json({ error: 'request_id não encontrado', request_id });
  res.json({ request_id, ...job });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. POST /api/nexus-callback — Nexus → Bridge (HMAC)
// ════════════════════════════════════════════════════════════════════════════
// rawBody capturado via verify no express.json global — necessário para HMAC sobre bytes exatos
app.post('/api/nexus-callback', (req, res) => {
  const sig     = req.headers['x-nexus-signature'] || '';
  const rawBody = req.rawBody; // Buffer salvo pelo verify do express.json global

  if (!sig || !NEXUS_CALLBACK_SECRET) {
    console.warn('[nexus-callback] assinatura ou secret ausente');
    return res.status(401).json({ error: 'Assinatura ou segredo ausente' });
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', NEXUS_CALLBACK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('[nexus-callback] assinatura inválida');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  const { request_id, loja_id, result, status, agent } = req.body;
  console.log(`[nexus-callback] ${agent} | request_id=${request_id} | status=${status}`);

  // Atualiza job em memória
  if (nexusJobs.has(request_id)) {
    nexusJobs.set(request_id, {
      ...nexusJobs.get(request_id),
      status: status === 'concluido' ? 'done' : status,
      result,
      done_at: new Date().toISOString(),
      source: 'evonexus',
    });
  }

  // Persiste no Supabase
  if (SUPABASE_SERVICE_KEY && request_id) {
    fetch(`${SUPABASE_URL}/rest/v1/nexus_requests?request_id=eq.${request_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        status: status === 'concluido' ? 'done' : status,
        response_payload: { text: result },
        responded_at: new Date().toISOString(),
      }),
    }).catch(e => console.warn('[nexus-callback] supabase patch:', e.message));
  }

  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ANALISE — agora usa Trigger.dev (OpenClaw aposentado — Fase 4)
// ════════════════════════════════════════════════════════════════════════════
app.post('/analise', async (req, res) => {
  const incomingSecret = req.headers['x-bridge-secret'];
  if (BRIDGE_SECRET && incomingSecret !== BRIDGE_SECRET)
    return res.status(401).json({ error: 'unauthorized' });

  const { job_id, tenant_id, cliente_nome, drive_link, periodo, correcoes } = req.body;
  if (!job_id || !drive_link) return res.status(400).json({ error: 'job_id e drive_link são obrigatórios' });

  // Origem WhatsApp (job_id não-UUID ou drive_link vazio): não há row real em analises
  if (!tenant_id || !drive_link.includes('drive.google.com')) {
    console.log(`[bridge/analise] origem WhatsApp sem drive_link real, ignorado (job_id=${job_id})`);
    return res.status(202).json({ ok: true, job_id });
  }

  if (!TRIGGER_SECRET_KEY)
    return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });

  try {
    // 1. Buscar analise_id (UUID PK) pelo job_id
    const r1 = await fetch(
      `${SUPABASE_URL}/rest/v1/analises?job_id=eq.${job_id}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await r1.json();
    if (!rows?.length) return res.status(404).json({ error: `analise job_id=${job_id} não encontrada` });
    const analise_id = rows[0].id;

    // 2. Disparar task Trigger.dev analise-ifood-run
    const tr = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/analise-ifood-run/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TRIGGER_SECRET_KEY}` },
      body: JSON.stringify({
        payload: {
          tenant_id,
          analise_id,
          cliente_nome: cliente_nome || '',
          drive_link,
          periodo: periodo || 'semanal',
          correcoes: correcoes || [],
        },
      }),
    });

    if (!tr.ok) {
      const err = await tr.json().catch(() => ({ message: tr.statusText }));
      throw new Error(err.message || `Trigger.dev ${tr.status}`);
    }

    const trData = await tr.json();
    console.log(`[bridge/analise] Trigger.dev analise-ifood-run job_id=${job_id} run_id=${trData.id}`);
    res.status(202).json({ ok: true, job_id, trigger_run_id: trData.id });
  } catch (err) {
    console.error('[bridge/analise]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AGENTS — POST /agents/:slug/run  |  GET /agents/:slug/runs/:id
// Trigger.dev Management API (paths validados contra @trigger.dev/core SDK)
// ════════════════════════════════════════════════════════════════════════════

// Roles que podem invocar agentes cujo slug começa com o prefixo
const ROLE_AGENT_PREFIXES = {
  'marketing':   ['lara-', 'nova-', 'bom-dia', 'encerramento'],
  'atendimento': ['lara-', 'max-', 'breno-'],
  'financeiro':  ['cora-', 'nova-'],
  'admin':       [''],   // admin pode tudo (prefixo vazio = match qualquer)
  'owner':       [''],
};

// ── Middleware: verificar acesso ao agente via user_agent_access + fallback por role
async function requireAgentAccess(req, res, next) {
  const { slug } = req.params;
  const userId   = req.user?.id;

  if (!SUPABASE_SERVICE_KEY) return next(); // dev sem validação

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  const tenantId = req.body?.tenant_id;

  try {
    // 1. Checagem primária: user_agent_access.can_invoke explícito
    const r1 = await fetch(
      `${SUPABASE_URL}/rest/v1/user_agent_access?user_id=eq.${userId}&agent_name=eq.${encodeURIComponent(slug)}&can_invoke=eq.true&select=user_id&limit=1`,
      { headers }
    );
    if (r1.ok && (await r1.json()).length > 0) return next();

    // 2. Fallback: verificar role do usuário no tenant e checar prefixo do slug
    if (tenantId) {
      const r2 = await fetch(
        `${SUPABASE_URL}/rest/v1/tenant_members?user_id=eq.${userId}&tenant_id=eq.${tenantId}&select=role&limit=1`,
        { headers }
      );
      if (r2.ok) {
        const rows = await r2.json();
        if (rows.length > 0) {
          const role = rows[0].role;
          const allowedPrefixes = ROLE_AGENT_PREFIXES[role] || [];
          const allowed = allowedPrefixes.some(prefix => prefix === '' || slug.startsWith(prefix));
          if (allowed) return next();
        }
      }
    }

    return res.status(403).json({ error: `sem permissão para invocar o agente '${slug}'` });
  } catch (err) {
    console.error('[bridge/requireAgentAccess]', err.message);
    return res.status(500).json({ error: 'erro ao verificar acesso ao agente' });
  }
}

// POST /agents/:slug/run
// Dispara uma task Trigger.dev para o agente. Retorna { run_id }.
// Frontend subscreve agent_runs via Supabase Realtime para receber o resultado.
app.post('/agents/:slug/run', requireJwt, requireAgentAccess, async (req, res) => {
  const { slug }                = req.params;
  const { tenant_id, payload = {} } = req.body;

  if (!TRIGGER_SECRET_KEY)
    return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });

  try {
    const r = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/${encodeURIComponent(slug)}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${TRIGGER_SECRET_KEY}`,
      },
      body: JSON.stringify({
        payload: { ...payload, tenant_id, triggered_by: req.user.id },
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error(`[bridge/agents/run] trigger falhou ${r.status}:`, detail);
      return res.status(r.status).json({ error: 'falha ao disparar task', detail });
    }

    const data = await r.json();
    console.log(`[bridge/agents/run] ${slug} run_id=${data.id} tenant=${tenant_id}`);
    return res.json({ run_id: data.id, status: data.status });
  } catch (err) {
    console.error('[bridge/agents/run]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /internal/agents/:slug/run  (chamado por Edge Functions — sem JWT de usuário)
// Autentica via x-bridge-secret. Dispara task Trigger.dev diretamente.
app.post('/internal/agents/:slug/run', async (req, res) => {
  const incomingSecret = req.headers['x-bridge-secret'];
  if (BRIDGE_SECRET && incomingSecret !== BRIDGE_SECRET)
    return res.status(401).json({ error: 'unauthorized' });

  const { slug }  = req.params;
  const payload   = req.body;

  if (!TRIGGER_SECRET_KEY)
    return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });

  try {
    const r = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/${encodeURIComponent(slug)}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${TRIGGER_SECRET_KEY}`,
      },
      body: JSON.stringify({ payload }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error(`[bridge/internal/agents/run] trigger falhou ${r.status}:`, detail);
      return res.status(r.status).json({ error: 'falha ao disparar task', detail });
    }

    const data = await r.json();
    console.log(`[bridge/internal/agents/run] ${slug} run_id=${data.id}`);
    return res.json({ run_id: data.id, status: data.status });
  } catch (err) {
    console.error('[bridge/internal/agents/run]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /agents/:slug/runs/:id
// Consulta status e output de um run. Pode ser usado como fallback ao Realtime.
app.get('/agents/:slug/runs/:id', requireJwt, async (req, res) => {
  const { id } = req.params;

  if (!TRIGGER_SECRET_KEY)
    return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });

  try {
    const r = await fetch(`${TRIGGER_API_URL}/api/v3/runs/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${TRIGGER_SECRET_KEY}` },
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(r.status).json({ error: 'falha ao consultar run', detail });
    }

    const data = await r.json();
    return res.json({
      run_id:      data.id,
      status:      data.status,
      output:      data.output     ?? null,
      created_at:  data.createdAt  ?? null,
      finished_at: data.finishedAt ?? null,
    });
  } catch (err) {
    console.error('[bridge/agents/runs/id]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /chat/ai — Copiloto DELI no chat ao vivo (síncrono, < 5s)
// ════════════════════════════════════════════════════════════════════════════
app.post('/chat/ai', requireJwt, async (req, res) => {
  const { command, prompt: freePrompt, messages = [], conversation_id, tenant_id } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurado' });
  const _chatAiStart = Date.now();

  const SYSTEM_PROMPTS = {
    '/resumir': `Você é DELI, COO digital da Consult Delivery. Resuma esta conversa de atendimento.
Responda SOMENTE com JSON válido no formato:
{"title":"Resumo da conversa","bullets":["ponto 1","ponto 2","ponto 3"],"status":"em andamento"}
Máximo 5 bullets. Seja direto e acionável. status pode ser: "em andamento", "resolvido", "pendente".`,
    '/proxima': `Você é DELI, COO digital da Consult Delivery. Sugira as próximas ações para o atendente.
Responda SOMENTE com JSON válido no formato:
{"title":"Próximas ações sugeridas","bullets":["ação 1","ação 2","ação 3"],"urgencia":"media"}
Máximo 3 ações específicas e acionáveis. urgencia: "alta", "media" ou "baixa".`,
    '/traduzir': `Você é DELI. Traduza a última mensagem do cliente para português.
Responda SOMENTE com JSON válido no formato:
{"title":"Tradução","bullets":["Tradução: [texto]","Idioma detectado: [idioma]"]}`,
    '/tom': `Você é DELI. Analise o tom da conversa e sugira ajuste para o atendente.
Responda SOMENTE com JSON válido no formato:
{"title":"Ajuste de tom","bullets":["Tom atual: [descrição]","Sugestão: [ajuste específico]","Exemplo: [frase sugerida]"]}`,
    '/cobranca': `Você é DELI acionando CORA para análise de cobrança nesta conversa.
Responda SOMENTE com JSON válido no formato:
{"title":"CORA · Análise de cobrança","bullets":["Situação: [resumo]","Valor identificado: [valor ou N/A]","Ação recomendada: [próximo passo]"]}`,
    '/livre': `Você é DELI, COO digital da Consult Delivery. Responda à pergunta do atendente com base na conversa fornecida.
Responda SOMENTE com JSON válido no formato:
{"title":"DELI","body":"[sua resposta completa aqui]","bullets":[]}
Seja direto, prático e em português.`,
    '/resposta': `Você é DELI, COO digital da Consult Delivery. Com base nessa conversa de atendimento via WhatsApp, escreva a próxima resposta que o atendente deve enviar ao cliente.
Regras: resposta curta (máx 3 frases), tom amigável e profissional, em português brasileiro, sem floreios, sem "prezado(a)".
Responda SOMENTE com JSON válido no formato:
{"text":"[mensagem para o cliente aqui]"}`,
  };

  // Normaliza mensagens: aceita formato DB (direction/content) e formato UI (from/text)
  const transcript = messages.slice(-30).map(m => {
    const isInbound = m.direction === 'inbound' || m.from === 'in';
    const role = isInbound ? 'Cliente' : 'Atendente';
    const sender = m.sender_name || m.agentName || '';
    const text = m.content || m.body || m.text || '';
    const media = m.media_type || m.mediaType || '';
    return `[${role}${sender ? ` (${sender})` : ''}]: ${text || (media ? `(${media})` : '(mídia)')}`;
  }).join('\n');

  // ── /tarefa: cria tarefa na loja sem chamar Anthropic ─────────────────────
  if (command === '/tarefa') {
    const texto = (freePrompt || '').trim();
    if (!texto) return res.status(400).json({ error: 'texto da tarefa obrigatório' });
    let lojaId = null;
    if (conversation_id && SUPABASE_SERVICE_KEY) {
      try {
        const cr = await fetch(
          `${SUPABASE_URL}/rest/v1/conversations?id=eq.${conversation_id}&select=loja_id&limit=1`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        const rows = await cr.json();
        lojaId = rows?.[0]?.loja_id ?? null;
      } catch (_) { /* segue sem loja_id */ }
    }
    if (!lojaId) return res.status(422).json({ error: 'loja_id não encontrado para esta conversa' });
    try {
      const tarefa = await supabaseInsert('tarefas_loja', {
        loja_id: lojaId,
        bloco: 'suporte',
        titulo: texto.slice(0, 200),
        situacao: 'Criada via DELI chat',
        o_que_sera_feito: texto,
        status: 'rascunho',
        created_by: req.user.id,
      });
      console.log(`[bridge/chat/ai] /tarefa criada id=${tarefa?.id} loja=${lojaId}`);
      return res.json({ ok: true, title: 'Tarefa criada', bullets: [`Tarefa criada (${tarefa?.id})`] });
    } catch (err) {
      console.error('[bridge/chat/ai] /tarefa insert erro:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── /handoff: registra transferência sem chamar Anthropic ─────────────────
  if (command === '/handoff') {
    const agente = (freePrompt || '').trim();
    if (!agente) return res.status(400).json({ error: 'nome do agente obrigatório' });
    if (conversation_id && tenant_id && SUPABASE_SERVICE_KEY) {
      supabaseInsert('conversation_events', {
        tenant_id,
        conversation_id,
        event_type: 'transferred',
        actor_id:   req.user.id,
        actor_type: 'user',
        metadata:   { handed_off_to: agente, source: 'deli-chat' },
      }).catch(e => console.warn('[bridge/chat/ai] /handoff event insert falhou:', e.message));
    }
    console.log(`[bridge/chat/ai] /handoff conv=${conversation_id} → ${agente}`);
    return res.json({ ok: true, title: 'Handoff realizado', bullets: [`Transferido pra ${agente}`] });
  }

  const systemPrompt = SYSTEM_PROMPTS[command] || SYSTEM_PROMPTS['/resumir'];
  const userContent = command === '/livre' && freePrompt
    ? `Conversa:\n\n${transcript || '(sem mensagens ainda)'}\n\nPergunta do atendente: ${freePrompt}`
    : `Conversa:\n\n${transcript || '(sem mensagens ainda)'}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(r.status).json({ error: `Anthropic error ${r.status}`, detail });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { title: 'DELI', bullets: [text] };
    }

    // Para /livre, retorna body como texto único se bullets estiver vazio
    if (command === '/livre' && parsed.body && (!parsed.bullets || !parsed.bullets.length)) {
      parsed.bullets = [parsed.body];
      delete parsed.body;
    }

    // Para /resposta, garante que text está presente
    if (command === '/resposta' && !parsed.text) {
      parsed.text = parsed.bullets?.[0] || parsed.body || '';
    }

    const _durationMs = Date.now() - _chatAiStart;
    console.log(`[bridge/chat/ai] ${command} model=${ANTHROPIC_MODEL} conv=${conversation_id} ${_durationMs}ms`);
    res.json({ ok: true, ...parsed });
    supabaseInsert('agent_runs', {
      trigger_dev_run_id: `chat-ai-${req.user.id}-${Date.now()}`,
      agent_id: 'chat-ai',
      input: { command, user_id: req.user.id, tenant_id, conversation_id },
      output: { tokens_out: data.usage?.output_tokens, tokens_in: data.usage?.input_tokens, model: ANTHROPIC_MODEL },
      tenant_id: tenant_id || null,
      triggered_by: req.user.id || null,
      duration_ms: _durationMs,
      status: 'success',
      completed_at: new Date().toISOString(),
    }).catch(e => console.warn('[bridge/chat/ai] audit insert falhou:', e.message));
  } catch (err) {
    console.error('[bridge/chat/ai]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /webhooks/asaas — Webhook receiver Asaas (pagamentos)
// Asaas envia POST com header asaas-access-token = ASAAS_WEBHOOK_SECRET
// Docs: https://docs.asaas.com/docs/criando-webhooks
// ════════════════════════════════════════════════════════════════════════════

const ASAAS_STATUS_MAP = {
  PAYMENT_CREATED:              'pending',
  PAYMENT_UPDATED:              null,       // sem mudança de status
  PAYMENT_CONFIRMED:            'received',
  PAYMENT_RECEIVED:             'received',
  PAYMENT_OVERDUE:              'overdue',
  PAYMENT_DELETED:              'canceled',
  PAYMENT_RESTORED:             'pending',
  PAYMENT_REFUNDED:             'refunded',
  PAYMENT_PARTIALLY_REFUNDED:   'refunded',
  PAYMENT_CHARGEBACK_REQUESTED: 'overdue',
  PAYMENT_CHARGEBACK_DISPUTE:   'overdue',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'overdue',
};

app.post('/webhooks/asaas', async (req, res) => {
  // 1. Validar token — Asaas envia em asaas-access-token (lowercase)
  const token = req.headers['asaas-access-token'] || req.headers['x-asaas-access-token'] || '';
  if (!ASAAS_WEBHOOK_SECRET) {
    console.warn('[webhooks/asaas] ASAAS_WEBHOOK_SECRET não configurado — webhook rejeitado');
    return res.status(500).json({ error: 'webhook secret não configurado no servidor' });
  }
  if (token !== ASAAS_WEBHOOK_SECRET) {
    console.warn(`[webhooks/asaas] token inválido: "${token.slice(0, 8)}..."`);
    return res.status(401).json({ error: 'token inválido' });
  }

  const { event, payment } = req.body || {};
  if (!event || !payment?.id) {
    return res.status(400).json({ error: 'payload inválido: faltam event ou payment.id' });
  }

  console.log(`[webhooks/asaas] evento=${event} charge=${payment.id}`);

  // Responde 200 imediatamente — Asaas não faz retry se receber 200
  res.json({ ok: true, received: event });

  // Processa de forma assíncrona após responder
  setImmediate(async () => {
    try {
      // 2. Encontra cobrança pelo asaas_charge_id
      const cob = await supabaseSelect('cobrancas', { asaas_charge_id: payment.id });
      if (!cob) {
        console.warn(`[webhooks/asaas] cobrança não encontrada para charge_id=${payment.id}`);
        return;
      }

      const oldStatus = cob.status;
      const newStatus = ASAAS_STATUS_MAP[event] ?? null;

      // 3. Atualiza status se evento tem mapeamento
      if (newStatus && newStatus !== oldStatus) {
        await supabaseUpdate(
          'cobrancas',
          { id: cob.id },
          { status: newStatus, updated_at: new Date().toISOString() }
        );
        console.log(`[webhooks/asaas] cobranca ${cob.id} status ${oldStatus} → ${newStatus}`);
      }

      // 4. Registra em cobranca_eventos
      await supabaseInsert('cobranca_eventos', {
        cobranca_id:  cob.id,
        tenant_id:    cob.tenant_id,
        event_type:   newStatus === oldStatus ? 'manual' : (newStatus === 'received' ? 'payment_received' : 'status_changed'),
        old_status:   oldStatus,
        new_status:   newStatus,
        triggered_by: 'asaas_webhook',
        metadata: {
          asaas_event:      event,
          asaas_charge_id:  payment.id,
          asaas_value:      payment.value,
          asaas_due_date:   payment.dueDate,
          asaas_pay_date:   payment.paymentDate ?? null,
        },
      });

      // 5. Se PAYMENT_OVERDUE: dispara cora-analisar-devedor automaticamente
      if (event === 'PAYMENT_OVERDUE' && TRIGGER_SECRET_KEY) {
        const tr = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/cora-analisar-devedor/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
          },
          body: JSON.stringify({
            payload: {
              tenant_id:   cob.tenant_id,
              cobranca_id: cob.id,
            },
          }),
        });
        if (tr.ok) {
          const trData = await tr.json();
          console.log(`[webhooks/asaas] cora-analisar-devedor disparado: runId=${trData.id}`);
        } else {
          console.error(`[webhooks/asaas] falha ao disparar cora: ${tr.status} ${await tr.text()}`);
        }
      }
    } catch (err) {
      console.error('[webhooks/asaas] erro no processamento assíncrono:', err.message);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /agents/bom-dia/send-groups — Envia imagem + legenda para grupos WhatsApp
// ════════════════════════════════════════════════════════════════════════════
app.post('/agents/bom-dia/send-groups', requireJwtOrInternal, async (req, res) => {
  const { group_jids = [], image_url, caption, tenant_id } = req.body;

  if (!group_jids.length || !image_url)
    return res.status(400).json({ error: 'group_jids e image_url são obrigatórios' });

  if (!SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

  let inst;
  try {
    inst = await supabaseSelect('evolution_instances', { tenant_id });
  } catch (err) {
    return res.status(500).json({ error: 'erro ao buscar instância Evolution', detail: err.message });
  }

  if (!inst) {
    // Fallback: buscar qualquer instância ativa (agente global)
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/evolution_instances?ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const rows = await r.json();
      inst = rows?.[0] ?? null;
    } catch {}
  }

  if (!inst)
    return res.status(404).json({ error: 'nenhuma instância Evolution configurada' });

  const results = { sent: [], failed: [] };

  for (const jid of group_jids) {
    try {
      const r = await fetch(
        `${inst.evolution_url}/message/sendMedia/${inst.instance_name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({
            number:    jid,
            mediatype: 'image',
            caption:   caption || '',
            media:     image_url,
          }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      results.sent.push({ jid, msg_id: data.key?.id ?? null });
      console.log(`[bom-dia/send-groups] enviado → ${jid}`);
    } catch (err) {
      console.error(`[bom-dia/send-groups] falha → ${jid}:`, err.message);
      results.failed.push({ jid, error: err.message });
    }
  }

  res.json(results);
});

// ════════════════════════════════════════════════════════════════════════════
// POST /agents/encerramento/send-groups — Envia imagem de encerramento para grupos
// ════════════════════════════════════════════════════════════════════════════
app.post('/agents/encerramento/send-groups', requireJwtOrInternal, async (req, res) => {
  const { group_jids = [], image_url, caption, tenant_id } = req.body;

  if (!group_jids.length || !image_url)
    return res.status(400).json({ error: 'group_jids e image_url são obrigatórios' });

  if (!SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

  let inst;
  try {
    inst = await supabaseSelect('evolution_instances', { tenant_id });
  } catch (err) {
    return res.status(500).json({ error: 'erro ao buscar instância Evolution', detail: err.message });
  }

  if (!inst) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/evolution_instances?ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const rows = await r.json();
      inst = rows?.[0] ?? null;
    } catch {}
  }

  if (!inst)
    return res.status(404).json({ error: 'nenhuma instância Evolution configurada' });

  const results = { sent: [], failed: [] };

  for (const jid of group_jids) {
    try {
      const r = await fetch(
        `${inst.evolution_url}/message/sendMedia/${inst.instance_name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({
            number:    jid,
            mediatype: 'image',
            caption:   caption || '',
            media:     image_url,
          }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      results.sent.push({ jid, msg_id: data.key?.id ?? null });
      console.log(`[encerramento/send-groups] enviado → ${jid}`);
    } catch (err) {
      console.error(`[encerramento/send-groups] falha → ${jid}:`, err.message);
      results.failed.push({ jid, error: err.message });
    }
  }

  res.json(results);
});

// ════════════════════════════════════════════════════════════════════════════
// POST /agents/recontratacao/:customer_id/enviar — Envia oferta de re-contratação
// G05.3: insere aceite_recontratacao + dispara WhatsApp via Evolution API
// Anti-padrão 3: bloqueia reenvio se mensagem_enviada_em já preenchido
// ════════════════════════════════════════════════════════════════════════════

const RECONTRATACAO_TEMPLATES = {
  light:       (nome) => `Olá ${nome}! Renovamos nossa parceria. Pacote Light R$500/mês - gestão iFood completa, relatórios semanais e suporte prioritário. Para confirmar ou saber mais, responda esta mensagem!`,
  performance: (nome) => `Olá ${nome}! Novo modelo de parceria: R$500 base + 12% do crescimento que geramos juntos. Você paga mais só quando cresce mais. Vamos conversar?`,
  enterprise:  (nome) => `Olá ${nome}! Proposta Enterprise: R$1.200/mês, mínimo 6 meses, com gestão completa e consultoria estratégica mensal. Responda para agendar uma apresentação!`,
  growth:      (nome) => `Olá ${nome}! Pacote Growth com IA no iFood: R$2.500 setup + R$1.500/mês. Automatização avançada e IA para maximizar seus resultados. Quer saber mais?`,
};

app.post('/agents/recontratacao/:customer_id/enviar', requireJwtOrInternal, async (req, res) => {
  const { customer_id } = req.params;
  const { tenant_id, pacote } = req.body;

  if (!tenant_id || !pacote)
    return res.status(400).json({ error: 'tenant_id e pacote são obrigatórios' });
  if (!RECONTRATACAO_TEMPLATES[pacote])
    return res.status(400).json({ error: `pacote inválido: ${pacote}` });
  if (!SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

  try {
    // Bloqueia reenvio (anti-padrão 3)
    const existente = await supabaseSelect('aceite_recontratacao', { customer_id, tenant_id });
    if (existente?.mensagem_enviada_em) {
      return res.status(409).json({ error: 'oferta já enviada para este cliente', aceite_id: existente.id });
    }

    // Buscar customer
    const customer = await supabaseSelect('customers', { id: customer_id, tenant_id });
    if (!customer) return res.status(404).json({ error: 'cliente não encontrado' });

    // Buscar JID via conversations (mais recente) ou fallback no phone
    let whatsapp_jid = null;
    try {
      const rc = await fetch(
        `${SUPABASE_URL}/rest/v1/conversations?customer_id=eq.${customer_id}&tenant_id=eq.${tenant_id}&is_group=eq.false&whatsapp_chat_id=not.is.null&order=last_message_at.desc&select=whatsapp_chat_id&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const convRows = await rc.json();
      whatsapp_jid = convRows?.[0]?.whatsapp_chat_id ?? null;
    } catch (_) { /* JID fica null */ }
    whatsapp_jid = whatsapp_jid ?? customer.phone_normalized ?? customer.phone;

    if (!whatsapp_jid)
      return res.status(422).json({ error: 'cliente sem JID WhatsApp conhecido' });

    // Buscar instância Evolution (tenant-specific ou fallback global)
    let inst = null;
    try {
      inst = await supabaseSelect('evolution_instances', { tenant_id });
      if (!inst) {
        const ri = await fetch(
          `${SUPABASE_URL}/rest/v1/evolution_instances?ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        const rows = await ri.json();
        inst = rows?.[0] ?? null;
      }
    } catch (_) { /* inst fica null */ }

    // INSERT aceite_recontratacao
    const aceite = await supabaseInsert('aceite_recontratacao', {
      tenant_id,
      customer_id,
      whatsapp_jid,
      pacote_ofertado: pacote,
      status: 'pendente',
      mensagem_enviada_em: new Date().toISOString(),
    });

    // Enviar WhatsApp (best-effort — não falha o endpoint se Evolution cair)
    const nome = customer.name || customer.whatsapp_name || 'cliente';
    const mensagem = RECONTRATACAO_TEMPLATES[pacote](nome);
    if (inst?.evolution_url && inst?.api_key && inst?.instance_name) {
      try {
        const ew = await fetch(
          `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
            body: JSON.stringify({ number: whatsapp_jid, text: mensagem }),
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (!ew.ok) console.warn(`[recontratacao] Evolution ${ew.status}: ${(await ew.text()).slice(0, 200)}`);
        else console.log(`[recontratacao] mensagem enviada → ${whatsapp_jid}`);
      } catch (ewErr) {
        console.warn('[recontratacao] Evolution erro:', ewErr.message);
      }
    } else {
      console.warn('[recontratacao] sem instância Evolution — WA não enviado');
    }

    console.log(`[recontratacao] enviar customer=${customer_id} pacote=${pacote} aceite=${aceite?.id}`);
    res.json({ success: true, aceite_id: aceite?.id });
  } catch (err) {
    console.error('[recontratacao/enviar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /whatsapp/groups — Lista grupos WhatsApp via Evolution API
// ════════════════════════════════════════════════════════════════════════════
app.get('/whatsapp/groups', requireJwt, async (req, res) => {
  const { tenant_id } = req.query;

  if (!SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

  let inst;
  try {
    inst = await supabaseSelect('evolution_instances', { tenant_id });
  } catch (err) {
    return res.status(500).json({ error: 'erro ao buscar instância Evolution', detail: err.message });
  }

  if (!inst) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/evolution_instances?ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const rows = await r.json();
      inst = rows?.[0] ?? null;
    } catch {}
  }

  if (!inst)
    return res.status(404).json({ error: 'nenhuma instância Evolution configurada' });

  try {
    const r = await fetch(
      `${inst.evolution_url}/group/fetchAllGroups/${inst.instance_name}?getParticipants=false`,
      {
        headers: { apikey: inst.api_key },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!r.ok) throw new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const groups = (Array.isArray(data) ? data : []).map(g => ({
      jid:         g.id,
      name:        g.subject || g.id,
      picture_url: g.pictureUrl ?? null,
    }));
    console.log(`[whatsapp/groups] ${groups.length} grupo(s) retornados`);
    res.json({ groups });
  } catch (err) {
    console.error('[whatsapp/groups] erro:', err.message);
    res.status(500).json({ error: 'erro ao buscar grupos', detail: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// LOJAS — PILOTO Onda 01
// Endpoints: GET/POST/PATCH lojas, GET/POST/DELETE consultores, POST métricas
// ════════════════════════════════════════════════════════════════════════════

// Helper genérico: Supabase REST request com service role
async function sbFetch(path, { method = 'GET', body, prefer, headers: xh = {} } = {}) {
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY não configurado');
  const headers = {
    'Content-Type': 'application/json',
    apikey:         SUPABASE_SERVICE_KEY,
    Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...xh,
  };
  if (prefer)                headers['Prefer'] = prefer;
  else if (method !== 'GET') headers['Prefer'] = 'return=representation';

  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase ${r.status} [${method} ${path}]: ${txt}`);
  }
  return r.json();
}

// Helper: verifica se req.user é membro do tenant_id solicitado
async function assertTenantMember(req, res, tenant_id) {
  const rows = await sbFetch(
    `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=tenant_id&limit=1`
  );
  if (!rows?.length) {
    res.status(403).json({ error: 'Acesso negado: usuário não é membro deste tenant' });
    return false;
  }
  return true;
}

// GET /api/lojas  — lista com filtros e paginação
app.get('/api/lojas', requireJwt, async (req, res) => {
  const { tenant_id, status, segmento, consultor_id, page = '0', limit: lim = '50' } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

  try {
    if (!await assertTenantMember(req, res, tenant_id)) return;

    let extraFilter = '';
    if (consultor_id) {
      const lcs = await sbFetch(
        `loja_consultores?user_id=eq.${encodeURIComponent(consultor_id)}&ativo=eq.true&select=loja_id`
      );
      const ids = (lcs || []).map(r => r.loja_id);
      if (!ids.length) return res.json({ lojas: [], total: 0 });
      extraFilter = `&id=in.(${ids.join(',')})`;
    }

    const pageNum   = Math.max(0, parseInt(page) || 0);
    const limitNum  = Math.min(100, Math.max(1, parseInt(lim) || 50));
    const offset    = pageNum * limitNum;
    let qs = `tenant_id=eq.${encodeURIComponent(tenant_id)}&order=nome.asc&limit=${limitNum}&offset=${offset}`;
    if (status)   qs += `&status=eq.${encodeURIComponent(status)}`;
    if (segmento) qs += `&segmento=eq.${encodeURIComponent(segmento)}`;
    qs += extraFilter;

    const lojas = await sbFetch(
      `lojas?${qs}&select=id,nome,slug,status,segmento,cidade,estado,posicionamento,ticket_medio,super_restaurante,logo_url,tags,client_id,created_at,updated_at`
    );
    res.json({ lojas: lojas || [], total: (lojas || []).length });
  } catch (err) {
    console.error('[api/lojas GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: busca tenant_id de uma loja e valida membership do user
async function assertLojaAccess(req, res, lojaId) {
  const rows = await sbFetch(`lojas?id=eq.${encodeURIComponent(lojaId)}&select=tenant_id&limit=1`);
  if (!rows?.length) { res.status(404).json({ error: 'loja não encontrada' }); return null; }
  const { tenant_id } = rows[0];
  if (!await assertTenantMember(req, res, tenant_id)) return null;
  return tenant_id;
}

// GET /api/lojas/:id  — detalhe completo com consultores atribuídos
app.get('/api/lojas/:id', requireJwt, async (req, res) => {
  const { id } = req.params;
  try {
    if (!await assertLojaAccess(req, res, id)) return;

    const rows = await sbFetch(`lojas?id=eq.${encodeURIComponent(id)}&limit=1&select=*`);
    const consultores = await sbFetch(
      `loja_consultores?loja_id=eq.${encodeURIComponent(id)}&ativo=eq.true&select=id,user_id,papel,atribuido_em`
    );
    res.json({ loja: { ...rows[0], consultores: consultores || [] } });
  } catch (err) {
    console.error('[api/lojas/:id GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lojas  — criar nova loja
app.post('/api/lojas', requireJwt, async (req, res) => {
  const {
    tenant_id, nome, slug, segmento, posicionamento, ticket_medio, cidade, estado,
    nicho, ifood_merchant_id, ifood_url, tipo, whatsapp, logo_url, observacoes,
    tags, client_id, data_inicio_consultoria, data_fim_consultoria,
  } = req.body;

  if (!tenant_id || !nome)
    return res.status(400).json({ error: 'tenant_id e nome são obrigatórios' });

  try {
    if (!await assertTenantMember(req, res, tenant_id)) return;

    const row = Object.fromEntries(
      Object.entries({
        tenant_id, nome, status: 'onboarding', created_by: req.user.id,
        slug, segmento, posicionamento, ticket_medio, cidade, estado, nicho,
        ifood_merchant_id, ifood_url, tipo, whatsapp, logo_url, observacoes,
        tags, client_id, data_inicio_consultoria, data_fim_consultoria,
      }).filter(([, v]) => v != null && v !== '')
    );

    const data = await sbFetch('lojas', { method: 'POST', body: row });
    const loja = Array.isArray(data) ? data[0] : data;
    console.log(`[api/lojas POST] id=${loja?.id} nome="${nome}" tenant=${tenant_id}`);
    res.status(201).json({ loja });
  } catch (err) {
    console.error('[api/lojas POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/lojas/:id  — atualizar campos parciais da loja
app.patch('/api/lojas/:id', requireJwt, async (req, res) => {
  const { id } = req.params;
  const EDITABLE = new Set([
    'nome','slug','status','segmento','posicionamento','ticket_medio','cidade','estado',
    'nicho','ifood_merchant_id','ifood_url','tipo','whatsapp','logo_url','observacoes',
    'tags','client_id','data_inicio_consultoria','data_fim_consultoria',
    'super_restaurante','data_super_restaurante','plataforma','metadata',
  ]);
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => EDITABLE.has(k))
  );
  if (!Object.keys(updates).length)
    return res.status(400).json({ error: 'nenhum campo válido para atualizar' });

  try {
    if (!await assertLojaAccess(req, res, id)) return;

    const data = await sbFetch(`lojas?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', body: updates,
    });
    const loja = Array.isArray(data) ? data[0] : data;
    if (!loja) return res.status(404).json({ error: 'loja não encontrada' });
    console.log(`[api/lojas PATCH] id=${id} campos=${Object.keys(updates).join(',')}`);
    res.json({ loja });
  } catch (err) {
    console.error('[api/lojas/:id PATCH]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lojas/:id/consultores  — listar consultores atribuídos
app.get('/api/lojas/:id/consultores', requireJwt, async (req, res) => {
  const { id } = req.params;
  try {
    if (!await assertLojaAccess(req, res, id)) return;

    const consultores = await sbFetch(
      `loja_consultores?loja_id=eq.${encodeURIComponent(id)}&select=id,user_id,papel,ativo,atribuido_em,atribuido_por`
    );
    res.json({ consultores: consultores || [] });
  } catch (err) {
    console.error('[api/lojas/:id/consultores GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lojas/:id/consultores  — atribuir consultor à loja (upsert por papel)
app.post('/api/lojas/:id/consultores', requireJwt, async (req, res) => {
  const { id } = req.params;
  const { user_id, papel = 'colaborador' } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  try {
    if (!await assertLojaAccess(req, res, id)) return;

    const data = await sbFetch('loja_consultores', {
      method: 'POST',
      body: { loja_id: id, user_id, papel, atribuido_por: req.user.id, ativo: true },
      prefer: 'return=representation,resolution=merge-duplicates',
    });
    const atribuicao = Array.isArray(data) ? data[0] : data;
    console.log(`[api/lojas/consultores POST] loja=${id} user=${user_id} papel=${papel}`);
    res.status(201).json({ atribuicao });
  } catch (err) {
    console.error('[api/lojas/:id/consultores POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lojas/:id/consultores/:userId  — remover consultor (soft delete)
app.delete('/api/lojas/:id/consultores/:userId', requireJwt, async (req, res) => {
  const { id, userId } = req.params;
  try {
    if (!await assertLojaAccess(req, res, id)) return;

    await sbFetch(
      `loja_consultores?loja_id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: { ativo: false } }
    );
    console.log(`[api/lojas/consultores DELETE] loja=${id} user=${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/lojas/:id/consultores DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lojas/:id/metricas  — criar/atualizar snapshot de métricas
app.post('/api/lojas/:id/metricas', requireJwt, async (req, res) => {
  const { id } = req.params;
  const { data: dataField, ...rest } = req.body;
  if (!dataField) return res.status(400).json({ error: 'data obrigatória (YYYY-MM-DD)' });

  const METRIC_FIELDS = new Set([
    'pedidos_30d','pedidos_90d','avaliacoes_30d','avaliacoes_90d',
    'nota_media','taxa_cancelamento','taxa_chamados','tempo_preparo_min',
    'tempo_loja_aberta_pct','tempo_espera_motoboy_min','invest_midia_30d',
    'custo_por_pedido','ticket_medio','posicao_categoria','fonte',
  ]);

  const row = {
    loja_id: id,
    data: dataField,
    fonte: rest.fonte || 'manual',
    capturado_por: req.user.id,
    ...Object.fromEntries(
      Object.entries(rest).filter(([k, v]) => METRIC_FIELDS.has(k) && v != null)
    ),
  };

  try {
    if (!await assertLojaAccess(req, res, id)) return;

    const result = await sbFetch('loja_metricas_snapshot', {
      method: 'POST',
      body: row,
      prefer: 'return=representation,resolution=merge-duplicates',
    });
    const snapshot = Array.isArray(result) ? result[0] : result;
    console.log(`[api/lojas/metricas POST] loja=${id} data=${dataField}`);
    res.status(201).json({ snapshot });
  } catch (err) {
    console.error('[api/lojas/:id/metricas POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PILOTO Onda 02 — Pipeline de Tarefas ────────────────────────────────────
app.use('/api', require('./routes/tarefas')({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  supabaseInsert,
}));

// ── Onda 07 F1 — Anexos de tarefas ──────────────────────────────────────────
app.use('/api', require('./routes/tarefa-anexos')({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  supabaseInsert,
}));

// ── PILOTO Onda 03 — Loja-GPT ────────────────────────────────────────────────
app.use('/api', require('./routes/loja-gpt')({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  TRIGGER_SECRET_KEY,
}));

// ── PILOTO Onda 04 — Análises (Loom + IA) ────────────────────────────────────
app.use('/api', require('./routes/analises')({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  TRIGGER_SECRET_KEY,
}));

// ── G03 — Contratos Digitais ─────────────────────────────────────────────────
app.use('/api', require('./routes/contratos')({
  requireJwt,
  supabaseInsert,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TRIGGER_SECRET_KEY,
  ASAAS_API_KEY,
}));

// ── G03.3 — Asaas Webhook (contratos) ────────────────────────────────────────
app.use('/api', require('./routes/asaas-webhook')({
  supabaseInsert,
  supabaseSelect,
  supabaseUpdate,
  ASAAS_WEBHOOK_SECRET,
}));

// ── Relatórios — Dashboard consolidado por tenant ───────────────────────────
app.use('/api', require('./routes/relatorios')({
  requireJwt,
  sbFetch,
  assertTenantMember,
}));

// ── F4 Onda 07 — Dashboard Público de Aprovação (sem JWT) ────────────────────
app.use('/api', require('./routes/publico-aprovacao')({
  sbFetch,
  supabaseInsert,
}));

// ── S2-G01.5 — LARA editorial: drafts + revisão + publicação ─────────────────
app.use('/api', require('./routes/lara')({
  requireJwt,
  sbFetch,
  supabaseInsert,
}));

// ── S2-G02 — SOFIA: Leads qualificados ───────────────────────────────────────
app.use('/api', require('./routes/sofia')({
  requireJwt,
  sbFetch,
}));

const server = app.listen(PORT, '0.0.0.0', () => {
  // D2: timeout do servidor > 60s para suportar polling síncrono do loja-gpt
  server.timeout = 90_000; // 90s — folga sobre os 60s de poll da task
  console.log(`[bridge] ouvindo em 0.0.0.0:${PORT} (server.timeout=${server.timeout}ms)`);
  console.log(`[bridge] SUPABASE_URL:          ${SUPABASE_URL           ? '✓' : '✗'}`);
  console.log(`[bridge] SUPABASE_ANON_KEY:     ${SUPABASE_ANON_KEY      ? '✓' : '✗ JWT auth desativado'}`);
  console.log(`[bridge] SUPABASE_SERVICE_KEY:  ${SUPABASE_SERVICE_KEY   ? '✓' : '✗ DB writes desativados'}`);
  console.log(`[bridge] INTERNAL_BRIDGE_TOKEN: ${INTERNAL_BRIDGE_TOKEN  ? '✓' : '✗ nexus-dispatch aberto'}`);
  console.log(`[bridge] NEXUS_BASE_URL:        ${NEXUS_BASE_URL         ? '✓' : '✗ mock mode'}`);
  console.log(`[bridge] BRIDGE_SECRET:         ${BRIDGE_SECRET          ? '✓' : '✗'}`);
  console.log(`[bridge] TRIGGER_SECRET_KEY:    ${TRIGGER_SECRET_KEY     ? '✓' : '✗ /agents/:slug/run desativado'}`);
  console.log(`[bridge] ASAAS_WEBHOOK_SECRET:  ${ASAAS_WEBHOOK_SECRET   ? '✓' : '✗ /webhooks/asaas rejeitará tudo'}`);
  console.log(`[bridge] ANTHROPIC_API_KEY:     ${ANTHROPIC_API_KEY      ? '✓' : '✗ /chat/ai desativado'} model=${ANTHROPIC_MODEL}`);
  console.log(`[bridge] PILOTO lojas API:      GET|POST|PATCH /api/lojas, GET|POST|DELETE /api/lojas/:id/consultores, POST /api/lojas/:id/metricas`);
  console.log(`[bridge] PILOTO Onda 02:        GET|POST /api/tarefas/loja/:id, GET /api/tarefas/:id`);
  console.log(`[bridge] PILOTO Onda 03:        GET|POST /api/lojas/:id/loja-gpt/conversations, GET /api/loja-gpt/conversations/:id, POST /api/loja-gpt/conversations/:id/messages, PATCH /api/loja-gpt/conversations/:id`);
  console.log(`[bridge] PILOTO Onda 04:        GET|POST /api/lojas/:id/analises, POST /api/lojas/:id/analises/processar, POST /api/lojas/:id/analises/:aid/enviar-whatsapp`);
  console.log(`[bridge] G03 Contratos:         POST /api/contratos/:id/enviar-assinatura, POST /api/contratos/:id/link-asaas, POST /api/contratos/sign (público)`);
  console.log(`[bridge] G03.3 Asaas Webhook:  POST /api/asaas/webhook (público, valida asaas-access-token)`);
  console.log(`[bridge] ASAAS_API_KEY:         ${ASAAS_API_KEY ? '✓' : '✗ /contratos/:id/link-asaas recusará'}`);
});
