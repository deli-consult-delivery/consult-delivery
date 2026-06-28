// bridge-server/test/ifood-criar-item-teste.js
// Smoke de ESCRITA (F2) na loja de teste real do iFood. Cria categoria TESTE-CD
// (reusa se já existir) e um item X-Burger Teste CD, depois lista a categoria.
//
// IDs FIXOS (UUID v4) → rodar 2x NÃO duplica (PUT /items é idempotente; categoria
// reusada pelo nome). Output bruto em cada passo. Sem credencial → exit 1 limpo.
//
//   cd bridge-server && DOTENV_CONFIG_PATH=/root/consult-delivery/bridge-server/.env \
//     node -r dotenv/config test/ifood-criar-item-teste.js
'use strict';

const { randomUUID } = require('node:crypto');
const ifood = require('../lib/ifood');

const MERCHANT = '92a0ec17-6951-4a9b-9c02-ee12963be5f1';
const CATEGORIA_NOME = 'TESTE-CD';
// IDs base FIXOS p/ a 1ª criação. iFood dedupe pelo externalCode (único por
// merchant), então a idempotência real vem do externalCode — se o UUID fixo
// estiver "deleted" no iFood (re-run após delete), geramos um UUID novo e o
// externalCode evita duplicar o item. UUIDs fixos = 1ª run limpa não duplica.
const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const EXTERNAL_CODE = 'CD_TESTE_XBURGER';

// iFood pode devolver array puro OU objeto com .categories/.items — normaliza.
function asArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function log(passo, dado) {
  console.log(`\n=== ${passo} ===`);
  console.log(JSON.stringify(dado, null, 2));
}

async function main() {
  // 1) catalogId
  const catalogos = await ifood.listarCatalogos(MERCHANT);
  log('1. listarCatalogos (bruto)', catalogos);
  const cat0 = asArray(catalogos, 'catalogs')[0] || (Array.isArray(catalogos) ? catalogos[0] : null);
  const catalogId = cat0 && (cat0.catalogId || cat0.id || cat0.groupId);
  if (!catalogId) throw new Error('Nenhum catalogId encontrado na resposta de listarCatalogos');
  console.log(`\n>> catalogId = ${catalogId}`);

  // 2) categoria TESTE-CD (reusa por nome ou cria)
  const categorias = await ifood.listarCategorias(MERCHANT, catalogId);
  log('2. listarCategorias (bruto)', categorias);
  const lista = asArray(categorias, 'categories');
  // iFood normaliza o nome (TESTE-CD → Teste-Cd) → comparar case-insensitive.
  const alvo = CATEGORIA_NOME.trim().toLowerCase();
  let cat = lista.find((c) => (c.name || '').trim().toLowerCase() === alvo);
  if (cat) {
    console.log(`\n>> categoria '${CATEGORIA_NOME}' já existe — reusando id=${cat.id}`);
  } else {
    const criada = await ifood.criarCategoria(MERCHANT, catalogId, { name: CATEGORIA_NOME });
    log('2b. criarCategoria (bruto)', criada);
    cat = criada && (criada.id ? criada : { id: criada.categoryId });
  }
  const categoryId = cat && cat.id;
  if (!categoryId) throw new Error('Não obtive categoryId da categoria TESTE-CD');
  console.log(`\n>> categoryId = ${categoryId}`);

  // 3) criar/atualizar item (idempotente pelo externalCode).
  function montarPayload(itemId, productId) {
    return {
      item: {
        id: itemId,
        type: 'DEFAULT',
        categoryId,
        status: 'AVAILABLE',
        price: { value: 25.0 },
        externalCode: EXTERNAL_CODE,
        productId,
      },
      products: [
        {
          id: productId,
          name: 'X-Burger Teste CD',
          description: 'Item de teste criado pela integracao CD',
          externalCode: EXTERNAL_CODE,
        },
      ],
      optionGroups: [],
      options: [],
    };
  }

  // Idempotência REAL do iFood: PUT /items dedup pelo par (externalCode, productId).
  // Para ATUALIZAR um item já existente é preciso reenviar o id+productId DELE —
  // mandar UUIDs novos com o mesmo externalCode = 409 (criar duplicado). Então:
  // 1º olhamos a categoria; se já há um item com nosso externalCode, reusamos os
  // ids dele. Senão usamos os UUIDs fixos (1ª criação limpa).
  const itensExistentes = asArray(await ifood.listarItensCategoria(MERCHANT, categoryId), 'items');
  const jaExiste = itensExistentes.find((it) => it.externalCode === EXTERNAL_CODE);
  let itemId = ITEM_ID;
  let productId = PRODUCT_ID;
  if (jaExiste) {
    itemId = jaExiste.id;
    productId = jaExiste.productId || PRODUCT_ID;
    console.log(`\n>> item com externalCode '${EXTERNAL_CODE}' já existe — atualizando id=${itemId} productId=${productId}`);
  }

  let payload = montarPayload(itemId, productId);
  log('3. criarOuAtualizarItem (payload enviado)', payload);
  let itemResp;
  try {
    itemResp = await ifood.criarOuAtualizarItem(MERCHANT, payload);
  } catch (err) {
    // 409 "product(s) are deleted": o UUID escolhido foi usado+deletado num run
    // anterior e não há item vivo com esse externalCode. iFood não reusa UUID
    // deletado → criar com UUIDs novos (externalCode livre, sem item vivo).
    const deletedConflict =
      err.status === 409 && /are deleted/i.test(JSON.stringify(err.body || ''));
    if (!deletedConflict) throw err;
    console.log('\n>> 409 (UUID deletado, sem item vivo) — criando com UUIDs novos');
    payload = montarPayload(randomUUID(), randomUUID());
    log('3-retry. criarOuAtualizarItem (payload novo)', payload);
    itemResp = await ifood.criarOuAtualizarItem(MERCHANT, payload);
  }
  log('3b. criarOuAtualizarItem (resposta bruta)', itemResp);

  // 4) listar itens da categoria e imprimir legível
  const itens = await ifood.listarItensCategoria(MERCHANT, categoryId);
  log('4. listarItensCategoria (bruto)', itens);
  const arr = asArray(itens, 'items');
  // No Catalog v2.0 o nome vive em products[], não no item — item só tem productId.
  const produtos = asArray(itens, 'products');
  const nomePorProductId = new Map(produtos.map((p) => [p.id, p.name]));
  console.log(`\n=== ITENS DA CATEGORIA ${CATEGORIA_NOME} (${arr.length}) ===`);
  for (const it of arr) {
    const nome =
      it.name || nomePorProductId.get(it.productId) || (it.product && it.product.name) || '(sem nome)';
    const preco = (it.price && (it.price.value ?? it.price)) ?? '?';
    console.log(`- id=${it.id} | nome=${nome} | preço=${preco} | status=${it.status}`);
  }
  console.log('\nOK — escrita F2 concluída.');
}

main().catch((err) => {
  console.error('\n!!! FALHA');
  console.error('message:', err.message);
  if (err.status !== undefined) console.error('status:', err.status);
  if (err.body !== undefined) console.error('body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
