// bridge-server/index.js
// Recebe webhook da plataforma, chama openclaw agent, retorna resultado via Edge Function

const express = require('express');
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const BRIDGE_SECRET  = process.env.BRIDGE_SECRET;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const EDGE_CALLBACK  = `${SUPABASE_URL}/functions/v1/analista-callback`;
const TRANSCRICOES   = '/root/.openclaw/agents/analista-ifood/workspace/transcricoes';

app.use(express.json({ limit: '2mb' }));

// CORS — permite chamadas do browser (dev e produção)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-bridge-secret');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.post('/analise', async (req, res) => {
  const incomingSecret = req.headers['x-bridge-secret'];
  if (BRIDGE_SECRET && incomingSecret !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { job_id, cliente_nome, drive_link, periodo } = req.body;
  if (!job_id || !drive_link) {
    return res.status(400).json({ error: 'job_id e drive_link são obrigatórios' });
  }

  res.status(202).json({ ok: true, job_id });

  processAnalise({ job_id, cliente_nome, drive_link, periodo }).catch(err => {
    console.error(`[bridge] erro não tratado job ${job_id}:`, err.message);
  });
});

// ── Estratégia de dados: local → Drive público ────────────────────────────────

async function buscarDadosLoja(driveLink, clienteNome) {
  // 1. Transcrição local (prioritária para clientes conhecidos)
  const local = lerTranscricaoLocal(clienteNome);
  if (local) {
    console.log(`[bridge] usando transcrição local para "${clienteNome}"`);
    return local;
  }

  // 2. Drive via API (se GOOGLE_API_KEY configurado)
  if (GOOGLE_API_KEY) {
    const apiContent = await fetchDriveViaAPI(driveLink);
    if (apiContent) return apiContent;
  }

  // 3. Drive direto (pasta pública, sem API key)
  const publicContent = await fetchDrivePublico(driveLink);
  if (publicContent) return publicContent;

  console.warn(`[bridge] nenhuma fonte de dados acessível para "${clienteNome}"`);
  return null;
}

function lerTranscricaoLocal(clienteNome) {
  if (!clienteNome) return null;
  try {
    const normalizado = clienteNome
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    // Tenta match exato primeiro
    const candidatos = [
      path.join(TRANSCRICOES, `${normalizado}.txt`),
      path.join(TRANSCRICOES, `${normalizado}.md`),
    ];
    for (const p of candidatos) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }

    // Tenta match parcial pelas palavras do nome
    if (!fs.existsSync(TRANSCRICOES)) return null;
    const palavras = normalizado.split('_').filter(w => w.length > 3);
    const arquivos = fs.readdirSync(TRANSCRICOES);
    for (const arq of arquivos) {
      const arqNorm = arq.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (palavras.some(p => arqNorm.includes(p))) {
        return fs.readFileSync(path.join(TRANSCRICOES, arq), 'utf8');
      }
    }
  } catch (err) {
    console.warn('[bridge] lerTranscricaoLocal erro:', err.message);
  }
  return null;
}

async function fetchDriveViaAPI(driveLink) {
  try {
    const folderMatch = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderMatch) return null;
    const folderId = folderMatch[1];

    const listUrl = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&key=${GOOGLE_API_KEY}`;
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(10_000) });
    if (!listRes.ok) return null;

    const { files } = await listRes.json();
    if (!files?.length) return null;

    let conteudo = '';
    for (const file of files.slice(0, 10)) {
      if (file.mimeType === 'application/vnd.google-apps.folder') continue;
      const dlUrl = file.mimeType === 'application/vnd.google-apps.document'
        ? `https://docs.google.com/document/d/${file.id}/export?format=txt`
        : `https://drive.google.com/uc?export=download&id=${file.id}`;

      const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(15_000) });
      if (dlRes.ok) {
        const texto = await dlRes.text();
        conteudo += `\n--- ${file.name} ---\n${texto.slice(0, 8000)}\n`;
      }
    }
    return conteudo.trim() || null;
  } catch (err) {
    console.warn('[bridge] fetchDriveViaAPI erro:', err.message);
    return null;
  }
}

async function fetchDrivePublico(driveLink) {
  // Tenta baixar arquivos de pasta pública via scraping mínimo do HTML do Drive
  try {
    const folderMatch = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderMatch) return null;
    const folderId = folderMatch[1];

    const pageRes = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pageRes.ok) return null;

    const html = await pageRes.text();

    // Extrai IDs de arquivo do HTML (IDs do Drive têm 33 chars alfanuméricos)
    const idRegex = /"([\w-]{28,44})"/g;
    const ids = new Set();
    let m;
    while ((m = idRegex.exec(html)) !== null) {
      if (m[1].length >= 28 && m[1] !== folderId) ids.add(m[1]);
    }

    if (ids.size === 0) return null;

    let conteudo = '';
    for (const id of [...ids].slice(0, 5)) {
      try {
        const dlRes = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (dlRes.ok) {
          const ct = dlRes.headers.get('content-type') || '';
          if (ct.includes('text') || ct.includes('json')) {
            const texto = await dlRes.text();
            if (texto.length > 100) conteudo += `\n${texto.slice(0, 8000)}\n`;
          }
        }
      } catch (_) {}
    }
    return conteudo.trim() || null;
  } catch (err) {
    console.warn('[bridge] fetchDrivePublico erro:', err.message);
    return null;
  }
}

// ── Processamento principal ───────────────────────────────────────────────────

async function processAnalise({ job_id, cliente_nome, drive_link, periodo }) {
  const periodoLabel = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[periodo] || periodo;
  const clienteLabel = cliente_nome || 'cliente';

  const dadosLoja = await buscarDadosLoja(drive_link, clienteLabel);

  const instrucoesPrefixo = [
    'CORREÇÃO ORTOGRÁFICA: Antes de iniciar, corrija silenciosamente todos os erros ortográficos e gramaticais nos dados fornecidos, adaptando o texto sem alterar o sentido.',
    'TOM: Escreva na perspectiva da Consult Delivery (consultoria). Os ajustes serão executados pela consultoria após autorização do cliente. Use frases como "Nossa equipe vai configurar...", "Vamos implementar...", "A consultoria irá ajustar...".',
    'TEMPO: NÃO inclua estimativas de tempo de execução para nenhum ajuste.',
  ].join('\n');

  let message;
  if (dadosLoja) {
    message = [
      instrucoesPrefixo,
      '',
      'saída JSON.',
      `Cliente: ${clienteLabel}. Tipo de análise: ${periodoLabel}.`,
      '',
      'Dados da loja:',
      dadosLoja,
      '',
      'Gere a análise completa. Retorne SOMENTE o JSON estruturado conforme o system_prompt, sem texto adicional.',
    ].join('\n');
  } else {
    message = `${instrucoesPrefixo}\n\nsaída JSON. Cliente: ${clienteLabel}. Drive: ${drive_link}. Tipo de análise: ${periodoLabel}. Acesse o link e gere a análise. Retorne SOMENTE o JSON estruturado.`;
  }

  console.log(`[bridge] chamando agente job=${job_id} fonte=${dadosLoja ? 'dados_carregados' : 'link_drive'}`);

  let agentOutput;
  try {
    agentOutput = await runAgent(message);
    console.log(`[bridge] agente respondeu ${agentOutput.length} chars`);
  } catch (err) {
    console.error('[bridge] falha agente:', err.message);
    await postCallback({ job_id, status: 'error', error_message: `Erro no agente: ${err.message}` });
    return;
  }

  let resultado_json    = null;
  let mensagem_whatsapp = null;

  try {
    const cleaned = agentOutput.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    resultado_json    = parsed;
    mensagem_whatsapp = parsed.mensagem_whatsapp || null;
    console.log(`[bridge] JSON ok — loja: ${parsed.loja_nome || clienteLabel}`);
  } catch (_) {
    console.warn('[bridge] resposta não é JSON puro — salvando texto bruto');
    resultado_json = { texto_bruto: agentOutput };
    const waMatch = agentOutput.match(/"mensagem_whatsapp"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
    if (waMatch) mensagem_whatsapp = waMatch[1].replace(/\\n/g, '\n');
  }

  await postCallback({ job_id, status: 'done', resultado_json, mensagem_whatsapp });
}

function runAgent(message) {
  return new Promise((resolve, reject) => {
    const child = spawn('openclaw', [
      'agent', '--agent', 'analista-ifood', '--message', message, '--json',
    ], {
      timeout: 300_000,
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code !== 0) return reject(new Error(`openclaw código ${code}: ${stderr.slice(0, 500)}`));
      try {
        const wrapper = JSON.parse(stdout);
        // OpenClaw --json: { runId, result: { meta: { finalAssistantRawText: "..." } } }
        const text = wrapper.result?.meta?.finalAssistantRawText
          || wrapper.response
          || wrapper.content
          || wrapper.text
          || stdout;
        resolve(typeof text === 'string' ? text : JSON.stringify(text));
      } catch (_) {
        resolve(stdout);
      }
    });

    child.on('error', err => reject(err));
  });
}

async function postCallback(payload) {
  try {
    const res = await fetch(EDGE_CALLBACK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET || '' },
      body:    JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) console.error(`[bridge] callback falhou ${res.status}: ${txt}`);
    else         console.log(`[bridge] callback ok job=${payload.job_id} status=${payload.status}`);
  } catch (err) {
    console.error('[bridge] erro callback:', err.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] ouvindo em 0.0.0.0:${PORT}`);
  console.log(`[bridge] SUPABASE_URL:   ${SUPABASE_URL   ? '✓' : '✗ não configurado'}`);
  console.log(`[bridge] BRIDGE_SECRET:  ${BRIDGE_SECRET  ? '✓' : '✗ não configurado'}`);
  console.log(`[bridge] GOOGLE_API_KEY: ${GOOGLE_API_KEY ? '✓' : 'não configurado (modo público/local)'}`);
});
