// registry.js — catálogo das tools do vendaerp-mcp.
//
// Fase 1 = SÓ LEITURA. `writeTools` existe vazio de propósito: deixa explícito que
// a escrita é uma classe à parte (Fase 2, com confirmação no Telegram) e dá ao
// smoke um lugar para assertar que NENHUMA tool de mutação subiu sem querer.
'use strict';

const readTools = [
  require('./tools/erp_status'),
  require('./tools/erp_contratos'),
  require('./tools/erp_financeiro'),
  require('./tools/erp_estoque'),
  require('./tools/erp_fiscal'),
  require('./tools/erp_crm'),
];

const writeTools = []; // Fase 2

const allTools = [...readTools, ...writeTools];

module.exports = { readTools, writeTools, allTools };
