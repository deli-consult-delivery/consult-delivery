// Runner: PREENCHE (sem enviar) a resposta de uma avaliação no portal. NÃO submete.
// Entrada: env PEDIDO (nº do pedido) + texto — env TEXTO_APROVADO (chamada via Bridge/
// aprovação) ou, na ausência dela, arquivo ./texto-resposta.txt (uso manual/local).
const fs = require('fs');
const { preencherResposta } = require('./index');
(async () => {
  try {
    const pedido = (process.env.PEDIDO || '').trim();
    if (!pedido) throw new Error('defina env PEDIDO com o nº do pedido alvo');
    const texto = (process.env.TEXTO_APROVADO || fs.readFileSync('./texto-resposta.txt', 'utf8')).trim();
    console.log('PEDIDO=' + pedido + ' | TEXTO (' + texto.length + ' chars): ' + texto);
    const r = await preencherResposta(pedido, texto, { permitirPreenchimento: true });
    console.log('RESULTADO=' + JSON.stringify(r));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
