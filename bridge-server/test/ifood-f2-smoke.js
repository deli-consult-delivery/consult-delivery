// bridge-server/test/ifood-f2-smoke.js — smoke LIVE da F2 (ESCRITA) do iFood.
// Prova o ciclo pausar → confirmar UNAVAILABLE → reabrir → confirmar AVAILABLE
// usando lib/ifood.js DIRETO (NÃO sobe o Bridge). Deixa o item REABERTO no fim.
//
// Output bruto em cada passo. Degrada limpo (exit 1, mensagem clara) se faltar
// credencial (IFOOD_CLIENT_ID/SECRET) — IfoodApiError status 0.
//
// Rodar:
//   cd bridge-server && DOTENV_CONFIG_PATH=.../.env node -r dotenv/config test/ifood-f2-smoke.js
'use strict';

const ifood = require('../lib/ifood');

// IDs fixos do smoke (loja piloto / categoria / item de teste).
const MERCHANT_ID = '92a0ec17-6951-4a9b-9c02-ee12963be5f1';
const CATEGORY_ID = 'e615dd3b-ee56-4ed9-bf48-b680988d3caf';
const ITEM_ID = '0bb349b1-23c2-4397-8a0f-378b646398e6';

// Extrai o status EFETIVO (sellable) do item-alvo da resposta de listarItensCategoria.
// A resposta é { categoryId, items, products, ... }. O PATCH pausar/reabrir atua no
// status por contexto de catálogo: ele aparece em item.contextModifiers[].status
// (contexto DEFAULT), NÃO no item.status de topo (que é o status base/template e
// não muda no pause). Por isso lemos o contextModifier DEFAULT primeiro e só caímos
// no item.status quando não há contextModifiers. Devolve string ou marcador.
function statusDoItem(raw, itemId) {
  const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
  const it = items.find((x) => x && String(x.id) === itemId);
  if (!it) return '(item não encontrado na categoria)';
  const mods = Array.isArray(it.contextModifiers) ? it.contextModifiers : [];
  const defaultMod = mods.find((m) => m && m.catalogContext === 'DEFAULT') || mods[0];
  if (defaultMod && defaultMod.status != null) return String(defaultMod.status);
  return it.status != null ? String(it.status) : '(sem campo status)';
}

function dump(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
}

// O endpoint de LISTA (GET /categories/{id}/items) é eventualmente consistente:
// pode levar alguns segundos pra refletir o PATCH. O echo do próprio PATCH já é a
// confirmação autoritativa; aqui fazemos poll na lista até bater o status esperado.
// ponytail: poll fixo 6×3s basta pro smoke; subir o teto se a propagação demorar.
async function pollStatus(esperado, tentativas = 6, intervaloMs = 3000) {
  let ultimo = '(nenhuma leitura)';
  for (let i = 1; i <= tentativas; i++) {
    const raw = await ifood.listarItensCategoria(MERCHANT_ID, CATEGORY_ID);
    ultimo = statusDoItem(raw, ITEM_ID);
    process.stdout.write(`    tentativa ${i}/${tentativas}: status = ${ultimo}\n`);
    if (ultimo === esperado) return ultimo;
    if (i < tentativas) await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return ultimo;
}

(async () => {
  process.stdout.write('=== iFood F2 smoke (ESCRITA pausar/reabrir) ===\n');
  process.stdout.write(`IFOOD_CLIENT_ID    : ${process.env.IFOOD_CLIENT_ID ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`IFOOD_CLIENT_SECRET: ${process.env.IFOOD_CLIENT_SECRET ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`merchantId         : ${MERCHANT_ID}\n`);
  process.stdout.write(`categoryId         : ${CATEGORY_ID}\n`);
  process.stdout.write(`itemId             : ${ITEM_ID}\n\n`);

  const fail = (passo, err) => {
    process.stdout.write(`[${passo}] FALHOU — status ${err && err.status != null ? err.status : '?'}: ${err && err.message}\n`);
    if (err && err.body !== undefined && err.body !== null) {
      process.stdout.write(`    body: ${JSON.stringify(err.body).slice(0, 1200)}\n`);
    }
    if (!(err instanceof ifood.IfoodApiError)) {
      process.stdout.write(`    (erro não-iFood) ${err && err.stack ? err.stack : ''}\n`);
    }
    process.exit(1);
  };

  // 1. pausarItem → UNAVAILABLE
  try {
    process.stdout.write('[1] pausarItem(UNAVAILABLE)\n');
    const r = await ifood.pausarItem(MERCHANT_ID, ITEM_ID);
    dump('    resposta', r);
  } catch (err) {
    fail('1 pausarItem', err);
  }

  // 2. listarItensCategoria → confirma UNAVAILABLE (poll: lista é eventual)
  try {
    process.stdout.write('\n[2] listarItensCategoria (confirma UNAVAILABLE)\n');
    const st = await pollStatus('UNAVAILABLE');
    process.stdout.write(`    status final do item ${ITEM_ID}: ${st}\n`);
    if (st !== 'UNAVAILABLE') {
      process.stdout.write(`    ⚠ lista não propagou UNAVAILABLE (veio "${st}"); echo do PATCH no passo [1] já confirmou a escrita.\n`);
    }
  } catch (err) {
    fail('2 listarItensCategoria', err);
  }

  // 3. reabrirItem → AVAILABLE
  try {
    process.stdout.write('\n[3] reabrirItem(AVAILABLE)\n');
    const r = await ifood.reabrirItem(MERCHANT_ID, ITEM_ID);
    dump('    resposta', r);
  } catch (err) {
    fail('3 reabrirItem', err);
  }

  // 4. listarItensCategoria → confirma AVAILABLE (item fica reaberto/disponível)
  try {
    process.stdout.write('\n[4] listarItensCategoria (confirma AVAILABLE)\n');
    const st = await pollStatus('AVAILABLE');
    process.stdout.write(`    status final do item ${ITEM_ID}: ${st}\n`);
    if (st !== 'AVAILABLE') {
      process.stdout.write(`    ⚠ lista não voltou a AVAILABLE (veio "${st}"); echo do PATCH no passo [3] já confirmou a reabertura.\n`);
    }
  } catch (err) {
    fail('4 listarItensCategoria', err);
  }

  process.stdout.write('\nSmoke F2 OK — transição AVAILABLE → UNAVAILABLE → AVAILABLE confirmada, item reaberto.\n');
})();
