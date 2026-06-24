#!/usr/bin/env node
/**
 * SessionStart hook — injeta a diretriz do Pipeline ECC em TODA sessão deste projeto.
 *
 * Por que existe: as skills/agentes do ECC só são acionados quando chamados pelo
 * namespace `ecc:`. Nomes sem prefixo (code-review, security-scan, tdd-guide...)
 * resolvem para os plugins genéricos/oficiais, NÃO para o ECC. Sem este lembrete,
 * as sessões nunca usam o ECC (0 invocações observadas em 9 sessões anteriores).
 *
 * O hook não bloqueia nada: só devolve additionalContext para o modelo.
 */

const ADDITIONAL_CONTEXT = [
  "PIPELINE ECC ATIVO NESTE PROJETO (consult-delivery).",
  "",
  "Ao acionar qualquer fase do pipeline ECC (Research → Plan → Execute → QA → Review → Security),",
  "PREFIRA EXPLICITAMENTE as skills/comandos/agentes do namespace `ecc:`. Nomes sem o prefixo `ecc:`",
  "resolvem para plugins genéricos/oficiais — NÃO para o ECC. Para de fato usar o ECC, o prefixo é obrigatório.",
  "",
  "Mapeamento das fases → recursos ECC a preferir (nomes verificados no disco/registry):",
  "- Review de código → agentes `ecc:code-reviewer`, `ecc:react-reviewer`, `ecc:typescript-reviewer`, `ecc:python-reviewer`, `ecc:database-reviewer`, `ecc:silent-failure-hunter`",
  "- Segurança        → skills `ecc:security-scan`, `ecc:security-review`, `ecc:repo-scan` | agente `ecc:security-reviewer`",
  "- QA / testes      → skills `ecc:react-testing`, `ecc:tdd-workflow`, `ecc:e2e-testing` | agentes `ecc:tdd-guide`, `ecc:e2e-runner`, `ecc:pr-test-analyzer`",
  "- Build quebrado   → agentes `ecc:react-build-resolver`, `ecc:build-error-resolver`",
  "- Plan / arquitetura → agentes `ecc:planner`, `ecc:architect`, `ecc:code-architect`",
  "- Gate de qualidade → skills `ecc:gateguard`, `ecc:plankton-code-quality`",
  "- Performance / refactor → agentes `ecc:performance-optimizer`, `ecc:refactor-cleaner`",
  "",
  "Regra prática: se existir um equivalente no namespace `ecc:`, use a versão `ecc:`. Só caia na versão",
  "sem prefixo quando não houver equivalente ECC. Isto NÃO substitui nenhuma regra do CLAUDE.md — só fixa",
  "qual implementação das fases do pipeline usar.",
].join("\n");

const output = {
  continue: true,
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ADDITIONAL_CONTEXT,
  },
};

process.stdout.write(JSON.stringify(output));
