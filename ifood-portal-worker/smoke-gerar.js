// smoke-gerar.js — prova da FASE 2 (geração por IA). Gera respostas para 2 casos e imprime o
// TEXTO bruto. NÃO toca no portal, NÃO envia nada. Casos:
//   (a) avaliação NEGATIVA fictícia (nota 2, demora/comida fria)
//   (b) caso real da Fase 1 (Pedido 6975, nota 5, comentário positivo)
'use strict';

const { gerarResposta, providerInfo, RespostaSchema } = require('./gerarResposta');

setTimeout(() => { console.error('HARD TIMEOUT (smoke)'); process.exit(2); }, 90000).unref();

const CASOS = [
  {
    rotulo: '(a) NEGATIVA fictícia — nota 2, demora + comida fria',
    avaliacao: {
      nota: 2,
      comentario:
        'Demorou mais de uma hora pra chegar e quando chegou o lanche estava frio. Decepcionado.',
      autor: null,
    },
  },
  {
    rotulo: '(b) REAL Fase 1 — Pedido 6975, nota 5, comentário positivo',
    avaliacao: {
      nota: 5,
      comentario: 'Comida maravilhosa, entrega rápida e tudo bem embalado. Recomendo demais!',
      autor: null,
    },
  },
];

(async () => {
  const info = providerInfo(); // { tipo, modelo, endpoint } — SEM a key
  console.error(`[smoke] provider=${info.tipo} | modelo=${info.modelo} | endpoint=${info.endpoint}`);
  for (const caso of CASOS) {
    console.error(`\n[smoke] ${caso.rotulo}`);
    const texto = await gerarResposta(caso.avaliacao);
    // RespostaSchema já rodou dentro de gerarResposta; reforça a checagem explícita aqui.
    RespostaSchema.parse(texto);
    console.error(`[smoke] OK — ${texto.length} chars, sem placeholder, validado.`);
    console.log('────────────────────────────────────────────────────────');
    console.log(`CASO ${caso.rotulo}`);
    console.log(`NOTA ${caso.avaliacao.nota} | COMENTÁRIO: ${caso.avaliacao.comentario}`);
    console.log('RESPOSTA GERADA:');
    console.log(texto);
    console.log('────────────────────────────────────────────────────────');
  }
  console.error('\n[smoke] 2/2 respostas geradas e validadas.');
  process.exit(0);
})().catch((e) => {
  console.error('[smoke] ERRO:', e.message);
  process.exit(1);
});
