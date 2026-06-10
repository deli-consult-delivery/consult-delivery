// live-smoke.js — smoke COM credencial real (passo 5 da subida, RUNBOOK §).
//
// Diferente de smoke.js/integration.js (offline, env dummy), este CONECTA no banco
// real: sobe server.js sobre stdio com o env REAL (lido de process.env) e CHAMA cada
// uma das 6 tools de leitura uma vez, imprimindo o output bruto (summary + amostra).
// É a prova de que a credencial service_role funciona e as queries retornam — o que
// libera a leitura após GATE 0. NÃO chama cd_propor_draft (escrita fica gated).
//
// Uso (o Wandson roda, depois de exportar as 3 obrigatórias do Infisical):
//   export SUPABASE_URL=...                # endpoint PostgREST
//   export SUPABASE_SERVICE_KEY=...        # token service_role DEDICADO
//   export CD_AUDIT_TENANT_ID=...          # tenant_id da plataforma/CD
//   npm run live-smoke
//
// Sai !=0 se faltar env obrigatória, se o handshake falhar, ou se qualquer tool
// retornar erro de protocolo. NUNCA imprime o valor do segredo — só confirma presença.
'use strict';

const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CD_AUDIT_TENANT_ID'];

// Tools de leitura + args mínimos (limit baixo: smoke, não dump). Ordem = a do design.
const READ_CALLS = [
  { name: 'cd_status', args: {} },
  { name: 'cd_lojas', args: { limit: 3 } },
  { name: 'cd_agent_runs', args: { limit: 3 } },
  { name: 'cd_drafts_pendentes', args: { limit: 3 } },
  { name: 'cd_inadimplencia', args: { limit: 3 } },
  { name: 'cd_audit', args: { limit: 3 } },
];

function preflight() {
  const faltando = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (faltando.length) {
    process.stderr.write(
      `live-smoke ABORTADO — env obrigatória ausente: ${faltando.join(', ')}\n` +
        `Exporte as 3 (SUPABASE_URL, SUPABASE_SERVICE_KEY, CD_AUDIT_TENANT_ID) e rode de novo.\n`
    );
    process.exit(2);
  }
  // confirma presença sem vazar valor
  process.stdout.write(
    `env ok — SUPABASE_URL=${process.env.SUPABASE_URL} · ` +
      `SUPABASE_SERVICE_KEY=<presente, ${String(process.env.SUPABASE_SERVICE_KEY).length} chars> · ` +
      `CD_AUDIT_TENANT_ID=${process.env.CD_AUDIT_TENANT_ID}\n\n`
  );
}

// extrai o texto da resposta MCP (content[].text) de forma tolerante ao shape
function renderResult(res) {
  if (res && Array.isArray(res.content)) {
    return res.content
      .map((c) => (c && c.type === 'text' ? c.text : JSON.stringify(c)))
      .join('\n');
  }
  return JSON.stringify(res);
}

async function main() {
  preflight();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'server.js')],
    // env REAL — herda process.env (que já tem as 3 obrigatórias exportadas).
    env: { ...process.env },
  });

  const client = new Client({ name: 'cd-admin-mcp-live-smoke', version: '0.1.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  process.stdout.write(`handshake ok — ${tools.length} tools anunciadas\n\n`);

  let falhas = 0;
  for (const call of READ_CALLS) {
    process.stdout.write(`── ${call.name} ${JSON.stringify(call.args)} ──\n`);
    try {
      const res = await client.callTool({ name: call.name, arguments: call.args });
      if (res && res.isError) {
        falhas++;
        process.stdout.write(`  ERRO (tool): ${renderResult(res)}\n\n`);
      } else {
        process.stdout.write(`${renderResult(res)}\n\n`);
      }
    } catch (e) {
      falhas++;
      process.stdout.write(`  ERRO (protocolo): ${e.message}\n\n`);
    }
  }

  await client.close();

  if (falhas > 0) {
    process.stdout.write(`live-smoke: ${falhas} tool(s) com erro. Verifique credencial/RLS/conectividade.\n`);
    process.exit(1);
  }
  process.stdout.write('live-smoke OK — as 6 tools de leitura responderam contra o banco real.\n');
}

main().catch((e) => {
  process.stderr.write(`live-smoke FAIL: ${e.message}\n`);
  process.exit(1);
});
