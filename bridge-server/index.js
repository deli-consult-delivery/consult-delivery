// bridge-server/index.js
require('dotenv').config();

const express  = require('express');
const { spawn } = require('child_process');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

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
const OLLAMA_API_KEY         = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL           = process.env.OLLAMA_MODEL || 'llama3.2';
// EvoNexus webhook trigger IDs (visibilidade no painel, fire-and-forget)
const NEXUS_TRIGGER_IDS = { pesquisa: 3, regua: 2, midia: 1 };
// In-memory job store para polling de status (request_id → estado)
const nexusJobs = new Map();
const GOOGLE_API_KEY         = process.env.GOOGLE_API_KEY || '';
const EDGE_CALLBACK          = `${SUPABASE_URL}/functions/v1/analista-callback`;
const TRANSCRICOES           = '/root/.openclaw/agents/analista-ifood/workspace/transcricoes';

app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-bridge-secret, Authorization, x-internal-token, x-nexus-signature');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// ── Helper: run openclaw agent ────────────────────────────────────────────────
function runOpenclawAgent(agentId, message, sessionId) {
  return new Promise((resolve, reject) => {
    const args = ['agent', '--agent', agentId, '--message', message, '--json'];
    if (sessionId) args.push('--session-id', sessionId);

    const child = spawn('openclaw', args, {
      timeout: 300_000,
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code !== 0) return reject(new Error(`openclaw ${agentId} exit ${code}: ${stderr.slice(0, 400)}`));
      try {
        const w = JSON.parse(stdout);
        const text = w.result?.payloads?.[0]?.text || w.result?.meta?.finalAssistantRawText || w.response || w.content || w.text || stdout;
        resolve(typeof text === 'string' ? text : JSON.stringify(text));
      } catch (_) { resolve(stdout); }
    });
    child.on('error', reject);
  });
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

// ── buscarDadosLoja ───────────────────────────────────────────────────────────
async function buscarDadosLoja(driveLink, clienteNome) {
  const local = lerTranscricaoLocal(clienteNome);
  if (local) { console.log(`[bridge] usando transcrição local para "${clienteNome}"`); return local; }
  if (GOOGLE_API_KEY) { const c = await fetchDriveViaAPI(driveLink); if (c) return c; }
  return await fetchDrivePublico(driveLink);
}

function lerTranscricaoLocal(clienteNome) {
  if (!clienteNome) return null;
  try {
    const norm = clienteNome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    for (const p of [path.join(TRANSCRICOES, `${norm}.txt`), path.join(TRANSCRICOES, `${norm}.md`)]) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
    if (!fs.existsSync(TRANSCRICOES)) return null;
    const palavras = norm.split('_').filter(w => w.length > 3);
    for (const arq of fs.readdirSync(TRANSCRICOES)) {
      const an = arq.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (palavras.some(p => an.includes(p))) return fs.readFileSync(path.join(TRANSCRICOES, arq), 'utf8');
    }
  } catch (err) { console.warn('[bridge] lerTranscricaoLocal:', err.message); }
  return null;
}

async function fetchDriveViaAPI(driveLink) {
  try {
    const m = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return null;
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=%27${m[1]}%27+in+parents&fields=files(id,name,mimeType)&key=${GOOGLE_API_KEY}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const { files } = await r.json();
    if (!files?.length) return null;
    let out = '';
    for (const f of files.slice(0, 10)) {
      if (f.mimeType === 'application/vnd.google-apps.folder') continue;
      const url = f.mimeType === 'application/vnd.google-apps.document'
        ? `https://docs.google.com/document/d/${f.id}/export?format=txt`
        : `https://drive.google.com/uc?export=download&id=${f.id}`;
      const dr = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (dr.ok) out += `\n--- ${f.name} ---\n${(await dr.text()).slice(0, 8000)}\n`;
    }
    return out.trim() || null;
  } catch (err) { console.warn('[bridge] fetchDriveViaAPI:', err.message); return null; }
}

async function fetchDrivePublico(driveLink) {
  try {
    const m = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return null;
    const pr = await fetch(`https://drive.google.com/drive/folders/${m[1]}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) });
    if (!pr.ok) return null;
    const html = await pr.text();
    const ids = new Set();
    let match;
    const re = /"([\w-]{28,44})"/g;
    while ((match = re.exec(html)) !== null) { if (match[1] !== m[1]) ids.add(match[1]); }
    let out = '';
    for (const id of [...ids].slice(0, 5)) {
      try {
        const dr = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { signal: AbortSignal.timeout(10_000) });
        if (dr.ok) { const ct = dr.headers.get('content-type') || ''; if (ct.includes('text')) { const t = await dr.text(); if (t.length > 100) out += `\n${t.slice(0, 8000)}\n`; } }
      } catch (_) {}
    }
    return out.trim() || null;
  } catch (err) { console.warn('[bridge] fetchDrivePublico:', err.message); return null; }
}

async function processAnalise({ job_id, cliente_nome, drive_link, periodo, correcoes }) {
  const periodoLabel = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[periodo] || periodo;
  const clienteLabel = cliente_nome || 'cliente';
  const dadosLoja = await buscarDadosLoja(drive_link, clienteLabel);

  const linhas = [
    'CORREÇÃO ORTOGRÁFICA: Antes de iniciar, corrija silenciosamente todos os erros ortográficos e gramaticais nos dados fornecidos, adaptando o texto sem alterar o sentido.',
    'TOM: Escreva na perspectiva da Consult Delivery (consultoria). Use frases como "Nossa equipe vai configurar...", "Vamos implementar...", "A consultoria irá ajustar...".',
    'TEMPO: NÃO inclua estimativas de tempo de execução para nenhum ajuste.',
  ];
  if (Array.isArray(correcoes) && correcoes.length > 0) {
    linhas.push('', 'CORREÇÕES APRENDIDAS (aplique nestas e em todas as análises futuras):');
    correcoes.forEach(c => linhas.push(`- ${c}`));
  }
  const prefixo = linhas.join('\n');

  const message = dadosLoja
    ? [prefixo, '', 'saída JSON.', `Cliente: ${clienteLabel}. Tipo de análise: ${periodoLabel}.`, '', 'Dados da loja:', dadosLoja, '', 'Gere a análise completa. Retorne SOMENTE o JSON estruturado conforme o system_prompt, sem texto adicional.'].join('\n')
    : `${prefixo}\n\nsaída JSON. Cliente: ${clienteLabel}. Drive: ${drive_link}. Tipo de análise: ${periodoLabel}. Acesse o link e gere a análise. Retorne SOMENTE o JSON estruturado.`;

  console.log(`[bridge] job=${job_id} fonte=${dadosLoja ? 'dados_carregados' : 'link_drive'}`);

  let agentOutput;
  try {
    agentOutput = await runOpenclawAgent('analista-ifood', message, undefined);
    console.log(`[bridge] agente respondeu ${agentOutput.length} chars`);
  } catch (err) {
    console.error('[bridge] falha agente:', err.message);
    await postCallback({ job_id, status: 'error', error_message: `Erro no agente: ${err.message}` });
    return;
  }

  let resultado_json = null, mensagem_whatsapp = null;
  try {
    const cleaned = agentOutput.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    resultado_json = parsed;
    mensagem_whatsapp = parsed.mensagem_whatsapp || null;
  } catch (_) {
    resultado_json = { texto_bruto: agentOutput };
    const wm = agentOutput.match(/"mensagem_whatsapp"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
    if (wm) mensagem_whatsapp = wm[1].replace(/\\n/g, '\n');
  }

  await postCallback({ job_id, status: 'done', resultado_json, mensagem_whatsapp });
}

async function postCallback(payload) {
  try {
    const r = await fetch(EDGE_CALLBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET || '' },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    if (!r.ok) console.error(`[bridge] callback falhou ${r.status}: ${txt}`);
    else console.log(`[bridge] callback ok job=${payload.job_id} status=${payload.status}`);
  } catch (err) { console.error('[bridge] erro callback:', err.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// AGENTS — POST /agents/:slug/run  |  GET /agents/:slug/runs/:id
// Trigger.dev Management API (paths validados contra @trigger.dev/core SDK)
// ════════════════════════════════════════════════════════════════════════════

// Roles que podem invocar agentes cujo slug começa com o prefixo
const ROLE_AGENT_PREFIXES = {
  'marketing':   ['lara-', 'nova-'],
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
  if (!OLLAMA_API_KEY) return res.status(503).json({ error: 'OLLAMA_API_KEY não configurado' });

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

  const systemPrompt = SYSTEM_PROMPTS[command] || SYSTEM_PROMPTS['/resumir'];
  const userContent = command === '/livre' && freePrompt
    ? `Conversa:\n\n${transcript || '(sem mensagens ainda)'}\n\nPergunta do atendente: ${freePrompt}`
    : `Conversa:\n\n${transcript || '(sem mensagens ainda)'}`;

  try {
    const r = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(r.status).json({ error: `Ollama error ${r.status}`, detail });
    }

    const data = await r.json();
    const text = data.message?.content || '';
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

    console.log(`[bridge/chat/ai] ${command} model=${OLLAMA_MODEL} conv=${conversation_id}`);
    res.json({ ok: true, ...parsed });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] ouvindo em 0.0.0.0:${PORT}`);
  console.log(`[bridge] SUPABASE_URL:          ${SUPABASE_URL           ? '✓' : '✗'}`);
  console.log(`[bridge] SUPABASE_ANON_KEY:     ${SUPABASE_ANON_KEY      ? '✓' : '✗ JWT auth desativado'}`);
  console.log(`[bridge] SUPABASE_SERVICE_KEY:  ${SUPABASE_SERVICE_KEY   ? '✓' : '✗ DB writes desativados'}`);
  console.log(`[bridge] INTERNAL_BRIDGE_TOKEN: ${INTERNAL_BRIDGE_TOKEN  ? '✓' : '✗ nexus-dispatch aberto'}`);
  console.log(`[bridge] NEXUS_BASE_URL:        ${NEXUS_BASE_URL         ? '✓' : '✗ mock mode'}`);
  console.log(`[bridge] BRIDGE_SECRET:         ${BRIDGE_SECRET          ? '✓' : '✗'}`);
  console.log(`[bridge] TRIGGER_SECRET_KEY:    ${TRIGGER_SECRET_KEY     ? '✓' : '✗ /agents/:slug/run desativado'}`);
  console.log(`[bridge] ASAAS_WEBHOOK_SECRET:  ${ASAAS_WEBHOOK_SECRET   ? '✓' : '✗ /webhooks/asaas rejeitará tudo'}`);
  console.log(`[bridge] OLLAMA_API_KEY:        ${OLLAMA_API_KEY         ? '✓' : '✗ /chat/ai desativado'} model=${OLLAMA_MODEL}`);
});
