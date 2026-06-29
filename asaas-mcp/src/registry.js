// registry.js — catálogo das tools do asaas-mcp. SÓ LEITURA.
// writeTools vazio de propósito: cobrança/envio a cliente é draft + aprovação (CORA),
// nunca direto por aqui. O smoke garante que nenhuma mutação subiu.
'use strict';

const readTools = [
  require('./tools/asaas_saldo'),
  require('./tools/asaas_situacao_mes'),
];

const writeTools = [];

const allTools = [...readTools, ...writeTools];

module.exports = { readTools, writeTools, allTools };
