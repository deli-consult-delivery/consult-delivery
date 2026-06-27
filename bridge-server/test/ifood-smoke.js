// bridge-server/test/ifood-smoke.js — smoke LIVE da F1 read-only do iFood.
// Autentica (client_credentials) e lista os catálogos da loja piloto.
// Output bruto: token obtido sim/não, catálogos retornados ou erro.
// Degrada com mensagem clara se faltar credencial (IFOOD_CLIENT_ID/SECRET) ou
// IFOOD_MERCHANT_ID — não derruba, só reporta o que falta.
//
// Rodar:  node bridge-server/test/ifood-smoke.js
'use strict';

const ifood = require('../lib/ifood');

(async () => {
  const merchantId = process.env.IFOOD_MERCHANT_ID;
  process.stdout.write('=== iFood F1 smoke (read-only) ===\n');
  process.stdout.write(`IFOOD_CLIENT_ID    : ${process.env.IFOOD_CLIENT_ID ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`IFOOD_CLIENT_SECRET: ${process.env.IFOOD_CLIENT_SECRET ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`IFOOD_MERCHANT_ID  : ${merchantId ? merchantId : 'AUSENTE'}\n\n`);

  // 1. Token
  let token = null;
  try {
    token = await ifood.getAccessToken();
    process.stdout.write(`[1] getAccessToken    : OK (token de ${token.length} chars)\n`);
  } catch (err) {
    process.stdout.write(`[1] getAccessToken    : FALHOU — status ${err.status ?? '?'}: ${err.message}\n`);
    if (err.body) process.stdout.write(`    body: ${JSON.stringify(err.body)}\n`);
    process.stdout.write('\nSmoke abortado: sem token não há leitura. Confira IFOOD_CLIENT_ID/SECRET.\n');
    process.exit(1);
  }

  // 2. listarCatalogos
  if (!merchantId) {
    process.stdout.write('[2] listarCatalogos   : PULADO — defina IFOOD_MERCHANT_ID (loja piloto).\n');
    process.exit(1);
  }
  try {
    const catalogos = await ifood.listarCatalogos(merchantId);
    const n = Array.isArray(catalogos) ? catalogos.length : 'objeto';
    process.stdout.write(`[2] listarCatalogos   : OK (${n} catálogo(s))\n`);
    process.stdout.write(`    raw: ${JSON.stringify(catalogos).slice(0, 800)}\n`);
  } catch (err) {
    process.stdout.write(`[2] listarCatalogos   : FALHOU — status ${err.status ?? '?'}: ${err.message}\n`);
    if (err.body) process.stdout.write(`    body: ${JSON.stringify(err.body).slice(0, 800)}\n`);
    process.exit(1);
  }

  process.stdout.write('\nSmoke OK.\n');
})();
