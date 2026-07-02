// Runner: PUBLICA a resposta do drawer aberto+preenchido. SÓ roda com CONFIRMAR_ENVIO=1.
// Semáforo amarelo: rodar apenas após o Wandson aprovar o texto no viewer.
// O texto aprovado vincula o envio (anti-TOCTOU): vem de env TEXTO_APROVADO (chamada via
// Bridge/aprovação) ou, na ausência dela, arquivo ./texto-resposta.txt (uso manual/local).
// Se o campo divergir do texto aprovado, enviarResposta() aborta.
// Opcional: env REVIEW_ID (selectedReviewId do drawer, retornado por preencherResposta) para cruzar.
const fs = require('fs');
const { enviarResposta } = require('./index');
(async () => {
  try {
    if (process.env.CONFIRMAR_ENVIO !== '1')
      throw new Error('defina CONFIRMAR_ENVIO=1 para publicar (só após "ok" explícito do Wandson)');
    const texto = (process.env.TEXTO_APROVADO || fs.readFileSync('./texto-resposta.txt', 'utf8')).trim();
    const opts = { permitirEnvio: true };
    if (process.env.REVIEW_ID) opts.reviewId = process.env.REVIEW_ID.trim();
    const r = await enviarResposta(texto, opts);
    console.log('RESULTADO=' + JSON.stringify(r));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
