// live-smoke.js — smoke COM Bridge real (passo de verificação, reservado ao Wandson).
//
// Diferente de smoke.js (offline), este CONECTA de verdade: sobe server.js sobre
// stdio com o env REAL e CHAMA cada uma das 6 tools de leitura uma vez, imprimindo
// o output bruto (summary + amostra). É a prova de que o caminho
//   Hermes → vendaerp-mcp → Bridge (/api/vendaerp/*) → VendaERP
// funciona ponta-a-ponta e grava audit_log. NÃO existe tool de escrita p/ chamar.
//
// Pré-requisito: o BRIDGE já precisa ter os 4 secrets VENDAERP_* no env (GATE 0),
// pm2 restart bridge-server, e o INTERNAL_BRIDGE_TOKEN tem que bater com o do Bridge.
//
// Uso (o Wandson roda, após exportar do Infisical):
//   export BRIDGE_URL=http://127.0.0.1:3001
//   export INTERNAL_BRIDGE_TOKEN=...
//   export SUPABASE_URL=...
//   export SUPABASE_SERVICE_KEY=...
//   export CD_AUDIT_TENANT_ID=...
//   npm run live-smoke
//
// Sai !=0 se faltar env obrigatória, se o handshake falhar, ou se qualquer tool
// retornar erro. NUNCA imprime o valor de segredo — só confirma presença.
'use strict';

const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REQUIRED = ['INTERNAL_BRIDGE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CD_AUDIT_TENANT_ID'];

// Tools de leitura + args mínimos. Ordem = a do registry.
const READ_CALLS = [
  { name: 'erp_status', args: {} },
  { name: 'erp_contratos', args: { pageSize: 3 } },
  { name: 'erp_financeiro', args: { recurso: 'lancamentos', pageSize: 3 } },
  { name: 'erp_estoque', args: { recurso: 'depositos' } },
  { name: 'erp_fiscal', args: {} },
  { name: 'erp_crm', args: {} },
];

function preflight() {
  const faltando = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (faltando.length) {
    process.stderr.write(
      `live-smoke ABORTADO — env obrigatória ausente: ${faltando.join(', ')}\n` +
        `Exporte as obrigatórias e rode de novo.\n`
    );
    process.exit(2);
  }
  process.stdout.write(
    `env ok — BRIDGE_URL=${process.env.BRIDGE_URL || 'http://127.0.0.1:3001 (default)'} · ` +
      `INTERNAL_BRIDGE_TOKEN=<presente, ${String(process.env.INTERNAL_BRIDGE_TOKEN).length} chars> · ` +
      `SUPABASE_URL=${process.env.SUPABASE_URL} · ` +
      `CD_AUDIT_TENANT_ID=${process.env.CD_AUDIT_TENANT_ID}\n\n`
  );
}

function renderResult(res) {
  if (res && Array.isArray(res.content)) {
    return res.content.map((c) => (c && c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
  }
  return JSON.stringify(res);
}

async function main() {
  preflight();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'server.js')],
    env: { ...process.env },
  });

  const client = new Client({ name: 'cd-vendaerp-mcp-live-smoke', version: '0.1.0' });
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
        // amostra: corta saídas gigantes p/ não poluir o terminal
        const txt = renderResult(res);
        process.stdout.write(`${txt.length > 1500 ? txt.slice(0, 1500) + '\n…(truncado)…' : txt}\n\n`);
      }
    } catch (e) {
      falhas++;
      process.stdout.write(`  ERRO (protocolo): ${e.message}\n\n`);
    }
  }

  await client.close();

  if (falhas > 0) {
    process.stdout.write(`live-smoke: ${falhas} tool(s) com erro. Verifique Bridge/credencial VENDAERP_*/conectividade.\n`);
    process.exit(1);
  }
  process.stdout.write('live-smoke OK — as 6 tools de leitura responderam via Bridge contra o VendaERP real.\n');
}

main().catch((e) => {
  process.stderr.write(`live-smoke FAIL: ${e.message}\n`);
  process.exit(1);
});
