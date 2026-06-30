// Runner: gera o texto de resposta (Ollama Cloud) para uma avaliação. NÃO toca no portal.
// Entrada: env AVALIACAO_JSON = {"nota":5,"comentario":"...","autor":null}
const { gerarResposta, providerInfo } = require('./gerarResposta');
(async () => {
  try {
    const av = JSON.parse(process.env.AVALIACAO_JSON || '{}');
    if (!av.comentario) throw new Error('defina AVALIACAO_JSON com {nota, comentario, autor?}');
    console.error('PROVIDER=' + JSON.stringify(providerInfo()));
    const texto = await gerarResposta(av);
    console.log('--- TEXTO GERADO (' + texto.length + ' chars) ---');
    console.log(texto);
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
