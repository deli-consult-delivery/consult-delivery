// registry.js — catálogo das tools do evolution-mcp. SÓ LEITURA.
// writeTools vazio de propósito: envio a cliente é draft + aprovação (regra de ouro),
// nunca direto por aqui. O smoke garante que nenhuma mutação subiu.
'use strict';

const readTools = [
  require('./tools/evolution_status'),
];

const writeTools = [];

const allTools = [...readTools, ...writeTools];

module.exports = { readTools, writeTools, allTools };
