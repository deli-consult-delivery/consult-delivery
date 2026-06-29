/**
 * Teste do Revisor — fixture: grounding OK vs alucinado, efeito real confirmado vs não.
 *
 * Sem framework: assert + node. Roda com:
 *   npx tsx trigger/agents/revisor.test.ts
 * ou compilado. chat e fetch são INJETADOS (fakes) — não toca LLM nem Bridge reais.
 */

import assert from "node:assert";
import {
  parseGroundingVerdict,
  avaliarGrounding,
  verificarEfeitoReal,
  revisar,
  type ChatFn,
} from "./revisor";

// fake chat que devolve um veredito fixo
const fakeChat = (content: string): ChatFn => async () => ({ content });

// fake fetch que devolve um status fixo
const fakeFetch = (ok: boolean, bodyOk: boolean): typeof fetch =>
  (async () =>
    ({
      ok,
      status: ok ? 200 : 502,
      json: async () => ({ ok: bodyOk }),
    }) as unknown as Response) as typeof fetch;

async function run() {
  // ── parseGroundingVerdict ──────────────────────────────────────────────────
  assert.deepEqual(
    parseGroundingVerdict('{"grounded": true, "motivo": "fiel"}'),
    { grounded: true, motivo: "fiel" },
    "parse: JSON limpo grounded:true",
  );
  assert.equal(
    parseGroundingVerdict('texto livre {"grounded": false, "motivo": "inventou número"} fim').grounded,
    false,
    "parse: extrai JSON embutido",
  );
  assert.equal(parseGroundingVerdict("não é json").grounded, false, "parse fail-closed: sem JSON");
  assert.equal(parseGroundingVerdict('{"motivo":"sem campo"}').grounded, false, "parse fail-closed: sem grounded");
  assert.equal(parseGroundingVerdict('{"grounded": "yes"}').grounded, false, "parse fail-closed: grounded não-bool");

  // ── avaliarGrounding: resposta fiel ────────────────────────────────────────
  const okResult = { sistema: "vendaerp", status_erp: { pedidos_abertos: 3 }, ok: true };
  const groundedOk = await avaliarGrounding(
    "Você tem 3 pedidos em aberto no momento.",
    okResult,
    fakeChat('{"grounded": true, "motivo": "número 3 confere com status_erp"}'),
  );
  assert.equal(groundedOk.grounded, true, "grounding: resposta fiel aprovada");

  // ── avaliarGrounding: resposta alucinada ───────────────────────────────────
  const groundedHallu = await avaliarGrounding(
    "Seu pedido de R$ 5.000 já foi entregue com sucesso!",
    okResult,
    fakeChat('{"grounded": false, "motivo": "valor 5000 e entrega não existem no resultado"}'),
  );
  assert.equal(groundedHallu.grounded, false, "grounding: alucinação bloqueada");

  // ── avaliarGrounding: LLM quebra → fail-closed ─────────────────────────────
  const groundedErr = await avaliarGrounding("qualquer", okResult, async () => {
    throw new Error("ollama down");
  });
  assert.equal(groundedErr.grounded, false, "grounding fail-closed quando LLM cai");

  // ── verificarEfeitoReal ────────────────────────────────────────────────────
  assert.equal(
    (await verificarEfeitoReal("nenhum", { ok: true }, { bridgeUrl: "x" })).confirmed,
    true,
    "efeito: 'nenhum' confirma (sem ação externa)",
  );
  assert.equal(
    (await verificarEfeitoReal("vendaerp", { ok: false }, { bridgeUrl: "x", bridgeToken: "t" })).confirmed,
    false,
    "efeito: execução ok:false não confirma",
  );
  assert.equal(
    (await verificarEfeitoReal("vendaerp", { ok: true }, { bridgeUrl: "x" })).confirmed,
    false,
    "efeito fail-closed: token ausente",
  );
  assert.equal(
    (await verificarEfeitoReal("vendaerp", { ok: true }, {
      bridgeUrl: "x", bridgeToken: "t", fetchFn: fakeFetch(true, true),
    })).confirmed,
    true,
    "efeito: vendaerp reconsultado ok",
  );
  assert.equal(
    (await verificarEfeitoReal("vendaerp", { ok: true }, {
      bridgeUrl: "x", bridgeToken: "t", fetchFn: fakeFetch(false, false),
    })).confirmed,
    false,
    "efeito fail-closed: Bridge HTTP erro",
  );
  assert.equal(
    (await verificarEfeitoReal("asaas", { ok: true }, { bridgeUrl: "x", bridgeToken: "t" })).confirmed,
    false,
    "efeito fail-closed: sistema sem verificador",
  );

  // ── revisar (gate combinado) ───────────────────────────────────────────────
  const aprovado = await revisar({
    resposta: "Você tem 3 pedidos em aberto.",
    executionResult: okResult,
    targetSystem: "vendaerp",
    bridgeUrl: "x",
    bridgeToken: "t",
    chatFn: fakeChat('{"grounded": true, "motivo": "ok"}'),
    fetchFn: fakeFetch(true, true),
  });
  assert.equal(aprovado.aprovado, true, "gate: grounding ok + efeito ok → aprovado");

  const bloqueadoGrounding = await revisar({
    resposta: "entreguei tudo",
    executionResult: okResult,
    targetSystem: "vendaerp",
    bridgeUrl: "x",
    bridgeToken: "t",
    chatFn: fakeChat('{"grounded": false, "motivo": "alucinou"}'),
    fetchFn: fakeFetch(true, true),
  });
  assert.equal(bloqueadoGrounding.aprovado, false, "gate: alucinação bloqueia mesmo com efeito ok");

  const bloqueadoEfeito = await revisar({
    resposta: "Você tem 3 pedidos em aberto.",
    executionResult: okResult,
    targetSystem: "vendaerp",
    bridgeUrl: "x",
    bridgeToken: "t",
    chatFn: fakeChat('{"grounded": true, "motivo": "ok"}'),
    fetchFn: fakeFetch(false, false),
  });
  assert.equal(bloqueadoEfeito.aprovado, false, "gate: efeito não confirmado bloqueia mesmo com grounding ok");

  console.log("✅ revisor.test.ts: todos os asserts passaram");
}

run().catch((err) => {
  console.error("❌ revisor.test.ts falhou:", err);
  process.exit(1);
});
