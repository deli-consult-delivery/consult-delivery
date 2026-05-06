// bridge-server/index.js

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
const GOOGLE_API_KEY         = process.env.GOOGLE_API_KEY || '';
const EDGE_CALLBACK          = `${SUPABASE_URL}/functions/v1/analista-callback`;
const TRANSCRICOES           = '/root/.openclaw/agents/analista-ifood/workspace/transcricoes';

app.use(express.json({ limit: '2mb' }));

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
        const text = w.result?.meta?.finalAssistantRawText || w.response || w.content || w.text || stdout;
        resolve(typeof text === 'string' ? text : JSON.stringify(text));
      } catch (_) { resolve(stdout); }
    });
    child.on('error', reject);
  });
}

// ── Helper: Supabase REST write (service role) ────────────────────────────────
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
// 1. POST /invoke/lara — frontend → LARA (SSE)
// ════════════════════════════════════════════════════════════════════════════
app.post('/invoke/lara', requireJwt, async (req, res) => {
  const { tenant_id, loja_id, message, session_id } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  sse('stage', { stage: 'verifying', label: 'Conectando com a LARA...' });

  try {
    sse('stage', { stage: 'thinking', label: 'LARA processando...' });
    const text = await runOpenclawAgent('lara', message, session_id);
    sse('message', { role: 'assistant', text });
    sse('done', { session_id: session_id || null });
  } catch (err) {
    console.error('[bridge/lara] erro:', err.message);
    sse('error', { message: err.message });
  } finally {
    res.end();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. POST /api/nexus-dispatch/:agent — LARA → Nexus (proxy interno)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/nexus-dispatch/:agent', requireInternalToken, async (req, res) => {
  const { agent } = req.params;
  if (!['pesquisa', 'regua', 'midia'].includes(agent))
    return res.status(400).json({ error: 'agent inválido' });

  const { request_id = crypto.randomUUID(), tenant_id, loja_id, payload } = req.body;

  // Registra no Supabase (best-effort)
  supabaseInsert('nexus_requests', {
    tenant_id, loja_id, agent, request_id, status: 'queued',
    request_payload: payload || {},
  }).catch(e => console.warn('[bridge/nexus-dispatch] insert:', e.message));

  // Se Nexus não configurado, retorna mock
  if (!NEXUS_BASE_URL || !NEXUS_API_KEY) {
    console.log(`[bridge/nexus-dispatch] NEXUS_BASE_URL não configurado — mock para ${agent}`);
    return res.json({ ok: true, request_id, estimated_duration_seconds: 90, queued_at: new Date().toISOString(), mock: true });
  }

  try {
    const r = await fetch(`${NEXUS_BASE_URL}/agents/${agent}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NEXUS_API_KEY}` },
      body: JSON.stringify({ request_id, tenant_id, loja_id, payload, callback_url: `https://app.consultdelivery.com.br/api/nexus-callback` }),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json({ ok: r.ok, request_id, ...data });
  } catch (err) {
    console.error('[bridge/nexus-dispatch] erro Nexus:', err.message);
    res.status(502).json({ error: 'nexus unreachable', detail: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. POST /api/nexus-callback — Nexus → Bridge (HMAC)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/nexus-callback', express.json(), async (req, res) => {
  // Valida assinatura HMAC
  if (NEXUS_CALLBACK_SECRET) {
    const sig      = req.headers['x-nexus-signature'] || '';
    const expected = crypto.createHmac('sha256', NEXUS_CALLBACK_SECRET)
                           .update(JSON.stringify(req.body)).digest('hex');
    if (sig !== expected) {
      console.warn('[bridge/nexus-callback] assinatura inválida');
      return res.status(401).json({ error: 'invalid signature' });
    }
  }

  const { event, request_id, tenant_id, loja_id } = req.body;
  if (!request_id) return res.status(400).json({ error: 'request_id required' });

  console.log(`[bridge/nexus-callback] evento=${event} request_id=${request_id}`);

  // Persiste conforme tipo de evento
  let persistedId = null;
  try {
    if (event === 'pesquisa_concluida') {
      const row = await supabaseInsert('marca_pesquisa', {
        tenant_id, loja_id,
        documento_jsonb: req.body.documento || req.body,
        fontes: req.body.fontes || [],
        origem: 'nexus_pesquisa',
      });
      persistedId = row?.id;
    } else if (event === 'regua_concluida') {
      const row = await supabaseInsert('reguas', {
        tenant_id, loja_id,
        pesquisa_id: req.body.pesquisa_id || null,
        status: 'rascunho',
        cobertura_dias: req.body.cobertura_dias || 90,
        criada_por_agente: 'nexus_regua',
        metadata: req.body,
      });
      persistedId = row?.id;
    } else if (event === 'midia_concluida') {
      const row = await supabaseInsert('campanha_ativos', {
        tenant_id,
        campanha_id: req.body.campanha_id,
        variacao: req.body.variacao || 1,
        legenda: req.body.legenda || '',
        midia_url: req.body.midia_url || null,
        tipo_midia: req.body.tipo_midia || null,
        fonte: 'nexus',
        metadata: req.body,
      });
      persistedId = row?.id;
    }

    // Atualiza nexus_requests
    if (SUPABASE_SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/nexus_requests?request_id=eq.${request_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ status: 'done', responded_at: new Date().toISOString(), response_payload: req.body }),
      });
    }
  } catch (err) {
    console.error('[bridge/nexus-callback] persist erro:', err.message);
    return res.status(500).json({ error: 'persist failed', detail: err.message });
  }

  res.json({ ok: true, persisted_id: persistedId });
});

// ════════════════════════════════════════════════════════════════════════════
// ANALISE (analista-ifood — mantido intacto)
// ════════════════════════════════════════════════════════════════════════════
app.post('/analise', async (req, res) => {
  const incomingSecret = req.headers['x-bridge-secret'];
  if (BRIDGE_SECRET && incomingSecret !== BRIDGE_SECRET)
    return res.status(401).json({ error: 'unauthorized' });

  const { job_id, cliente_nome, drive_link, periodo, correcoes } = req.body;
  if (!job_id || !drive_link) return res.status(400).json({ error: 'job_id e drive_link são obrigatórios' });

  res.status(202).json({ ok: true, job_id });
  processAnalise({ job_id, cliente_nome, drive_link, periodo, correcoes: correcoes || [] })
    .catch(err => console.error(`[bridge] erro job ${job_id}:`, err.message));
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] ouvindo em 0.0.0.0:${PORT}`);
  console.log(`[bridge] SUPABASE_URL:          ${SUPABASE_URL           ? '✓' : '✗'}`);
  console.log(`[bridge] SUPABASE_ANON_KEY:     ${SUPABASE_ANON_KEY      ? '✓' : '✗ JWT auth desativado'}`);
  console.log(`[bridge] SUPABASE_SERVICE_KEY:  ${SUPABASE_SERVICE_KEY   ? '✓' : '✗ DB writes desativados'}`);
  console.log(`[bridge] INTERNAL_BRIDGE_TOKEN: ${INTERNAL_BRIDGE_TOKEN  ? '✓' : '✗ nexus-dispatch aberto'}`);
  console.log(`[bridge] NEXUS_BASE_URL:        ${NEXUS_BASE_URL         ? '✓' : '✗ mock mode'}`);
  console.log(`[bridge] BRIDGE_SECRET:         ${BRIDGE_SECRET          ? '✓' : '✗'}`);
});
