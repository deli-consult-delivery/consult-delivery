// registry.js — catálogo das tools do ifood-mcp. SÓ LEITURA.
//
// `writeTools` existe vazio de propósito: deixa explícito que a escrita no iFood é
// uma classe à parte (rota Bridge + draft/aprovação) e dá ao smoke um lugar para
// assertar que NENHUMA tool de mutação subiu sem querer.
'use strict';

const readTools = [
  require('./tools/ifood_status'),
  require('./tools/ifood_catalogo'),
  require('./tools/ifood_cardapio'),
  require('./tools/ifood_reviews'),
  require('./tools/ifood_vendas'),
];

const writeTools = [];

const allTools = [...readTools, ...writeTools];

module.exports = { readTools, writeTools, allTools };
