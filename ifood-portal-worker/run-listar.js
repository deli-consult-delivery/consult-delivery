// Runner read-only: lista avaliações pendentes reais da Café Container. NÃO escreve nada.
const { listarAvaliacoesPendentes } = require('./index');
(async () => {
  try {
    const lista = await listarAvaliacoesPendentes();
    console.log('TOTAL_PENDENTES=' + lista.length);
    console.log(JSON.stringify(lista, null, 2));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
