// smoke-read.js — prova de LEITURA (Fase 1). Lista as avaliações pendentes (com comentário, não
// respondidas) da loja piloto e imprime o JSON bruto. NÃO escreve nada no portal.
'use strict';

const { listarAvaliacoesPendentes } = require('./index');

setTimeout(() => { console.error('HARD TIMEOUT (smoke)'); process.exit(2); }, 90000).unref();

(async () => {
  console.error('[smoke] lendo avaliações pendentes do Portal do Parceiro (read-only)...');
  const avaliacoes = await listarAvaliacoesPendentes();
  console.error(`[smoke] ${avaliacoes.length} avaliação(ões) pendente(s) com comentário.`);
  console.log(JSON.stringify(avaliacoes, null, 2)); // JSON bruto em stdout
  process.exit(0);
})().catch((e) => {
  console.error('[smoke] ERRO:', e.message);
  process.exit(1);
});
