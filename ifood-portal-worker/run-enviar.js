// Runner: PUBLICA a resposta do drawer aberto+preenchido. SÓ roda com CONFIRMAR_ENVIO=1.
// Semáforo amarelo: rodar apenas após o Wandson aprovar o texto no viewer.
const { enviarResposta } = require('./index');
(async () => {
  try {
    if (process.env.CONFIRMAR_ENVIO !== '1')
      throw new Error('defina CONFIRMAR_ENVIO=1 para publicar (só após "ok" explícito do Wandson)');
    const r = await enviarResposta({ permitirEnvio: true });
    console.log('RESULTADO=' + JSON.stringify(r));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
