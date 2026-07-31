// registry.js — catálogo das tools do hermes-chat-mcp. Ponte de conversa, não de ação.
'use strict';

const allTools = [
  require('./tools/talk_to_deli'),
  require('./tools/talk_to_ana'),
];

module.exports = { allTools };
