// registry.js — catálogo das tools expostas pelo admin MCP.
//
// Duas classes (design §3), separadas para o gateway poder desligar a escrita sem
// a leitura: `readTools` (sempre liberadas pós-GATE 0) e `writeTools` (propõe-e-
// aprova, gated). NÃO existe classe de mutação direta cliente-facing (cd_executar_*).
'use strict';

const readTools = [
  require('./tools/cd_status'),
  require('./tools/cd_lojas'),
  require('./tools/cd_agent_runs'),
  require('./tools/cd_drafts_pendentes'),
  require('./tools/cd_inadimplencia'),
  require('./tools/cd_audit'),
];

const writeTools = [
  require('./tools/cd_propor_draft'),
];

const allTools = [...readTools, ...writeTools];

module.exports = { readTools, writeTools, allTools };
