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

  // 2. listarMerchants — lista as lojas vinculadas (id + nome) ANTES do catálogo.
  let merchants = [];
  try {
    merchants = await ifood.listarMerchants();
    const lista = Array.isArray(merchants) ? merchants : [];
    process.stdout.write(`[2] listarMerchants   : OK (${lista.length} loja(s))\n`);
    for (const m of lista) {
      process.stdout.write(`      - ${m?.id ?? '(sem id)'}  ${m?.name ?? '(sem nome)'}\n`);
    }
  } catch (err) {
    process.stdout.write(`[2] listarMerchants   : FALHOU — status ${err.status ?? '?'}: ${err.message}\n`);
    if (err.body) process.stdout.write(`    body: ${JSON.stringify(err.body).slice(0, 800)}\n`);
    process.exit(1);
  }

  // 3. listarCatalogos — só se IFOOD_MERCHANT_ID estiver definido.
  if (!merchantId) {
    process.stdout.write('\n[3] listarCatalogos   : PULADO — defina IFOOD_MERCHANT_ID com um dos ids acima e rode de novo.\n');
    process.stdout.write('\nSmoke OK (lojas listadas; catálogo aguarda IFOOD_MERCHANT_ID).\n');
    return;
  }
  try {
    const catalogos = await ifood.listarCatalogos(merchantId);
    const n = Array.isArray(catalogos) ? catalogos.length : 'objeto';
    process.stdout.write(`\n[3] listarCatalogos   : OK (${n} catálogo(s))\n`);
    process.stdout.write(`    raw: ${JSON.stringify(catalogos).slice(0, 800)}\n`);
  } catch (err) {
    process.stdout.write(`\n[3] listarCatalogos   : FALHOU — status ${err.status ?? '?'}: ${err.message}\n`);
    if (err.body) process.stdout.write(`    body: ${JSON.stringify(err.body).slice(0, 800)}\n`);
    process.exit(1);
  }

  process.stdout.write('\nSmoke OK.\n');
})();
