// write-live-smoke.js — smoke de ESCRITA com Bridge real (reservado ao Wandson).
// Sobe server.js sobre stdio com env real, chama erp_propor_oportunidade, lê o
// proposal_id, e chama erp_confirmar — provando propor→confirmar ponta-a-ponta.
// Use uma op REVERSÍVEL (oportunidade de teste). Imprime output bruto.
//
// Diferente de live-smoke.js (só leitura), este GRAVA no ERP real: prova o caminho
//   Hermes → vendaerp-mcp → erp_confirmar → Bridge (POST /api/vendaerp/oportunidade)
//   → VendaERP (POST /api/request/Oportunidades/Cadastrar)
// e marca a proposta como executed em vendaerp_proposals + audit_log.
//
// ALTO-1 (PascalCase): além de propor→confirmar, este smoke IMPRIME explicitamente o
// SHAPE do body que será despachado ao ERP (as chaves do arguments do propor, que
// viram o `payload` guardado e o JSON.stringify do corpo no Bridge). É a evidência
// crua p/ o Wandson conferir se o ERP aceitou o shape enviado (vs. PascalCase).
//
// Pré-requisito: o BRIDGE já precisa ter os 4 secrets VENDAERP_* no env (GATE 0),
// pm2 restart bridge-server, e o INTERNAL_BRIDGE_TOKEN tem que bater com o do Bridge.
//
// Uso (após exportar do Infisical):
//   export BRIDGE_URL=http://127.0.0.1:3001
//   export INTERNAL_BRIDGE_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... CD_AUDIT_TENANT_ID=...
//   npm run write-live-smoke
//
// Sai !=0 se faltar env obrigatória, se não houver proposal_id, ou se erp_confirmar falhar.
'use strict';

const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REQUIRED = ['INTERNAL_BRIDGE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CD_AUDIT_TENANT_ID'];

// Op reversível usada na escrita real. As chaves deste objeto = o SHAPE do body
// que chega ao ERP (vendaerp-mcp guarda args como payload; o Bridge faz
// JSON.stringify(payload) direto em POST /api/request/Oportunidades/Cadastrar).
const PROPOR_ARGS = { titulo: 'TESTE Hermes Fase 2 (apagar)', cliente: 'Teste' };

function preflight() {
  const faltando = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (faltando.length) {
    process.stderr.write(`write-live-smoke ABORTADO — env ausente: ${faltando.join(', ')}\n`);
    process.exit(2);
  }
}

function text(res) {
  return (res && Array.isArray(res.content) ? res.content : [])
    .map((c) => (c && c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
}

(async () => {
  preflight();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'server.js')],
    env: { ...process.env },
  });
  const client = new Client({ name: 'write-live-smoke', version: '0.1.0' });
  await client.connect(transport);

  // ALTO-1: imprime o shape do body que será despachado ao ERP (chaves + JSON cru).
  process.stdout.write(
    `shape do body → keys=[${Object.keys(PROPOR_ARGS).join(', ')}] ` +
      `json=${JSON.stringify(PROPOR_ARGS)}\n` +
      `(este é o corpo que o Bridge faz JSON.stringify em POST /api/request/Oportunidades/Cadastrar)\n\n`
  );

  process.stdout.write('→ erp_propor_oportunidade\n');
  const proporRes = await client.callTool({
    name: 'erp_propor_oportunidade',
    arguments: PROPOR_ARGS,
  });
  const proporText = text(proporRes);
  process.stdout.write(proporText + '\n');

  const m = proporText.match(/"proposal_id"\s*:\s*"([^"]+)"/);
  if (!m) { process.stderr.write('FALHOU: sem proposal_id no retorno do propor\n'); process.exit(1); }
  const proposalId = m[1];

  process.stdout.write(`→ erp_confirmar ${proposalId}\n`);
  const confRes = await client.callTool({ name: 'erp_confirmar', arguments: { proposal_id: proposalId } });
  const confText = text(confRes);
  process.stdout.write(confText + '\n');

  await client.close();

  // Falha fechada: se o ERP recusou o shape, erp_confirmar devolve ok:false.
  if (/"ok"\s*:\s*false/.test(confText)) {
    process.stderr.write('\nwrite-live-smoke FALHOU: erp_confirmar não gravou (ok:false). Confira o shape/credencial.\n');
    process.exit(1);
  }
  process.stdout.write('\nwrite-live-smoke concluído — confira vendaerp_proposals (status=executed) e audit_log.\n');
})().catch((e) => { process.stderr.write(`write-live-smoke ERRO: ${e.message}\n`); process.exit(1); });
