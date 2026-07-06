/**
 * Teste da régua de reengajamento CSAT — fixtures: enviada há 4d sem resposta
 * (draft), respondida (nada), já reengajada (nada). Sem rede.
 * Roda com: npx tsx trigger/lara/csat-reengajamento.test.ts
 */

import assert from "node:assert";
import {
  decidirReengajamento,
  montarMensagemReengajamento,
  REENGAJAMENTO_DIAS_MIN,
  type AvaliacaoCandidata,
} from "./csat-reengajamento";

function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

function diasNaFrente(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

function run() {
  const agora = new Date();

  // ── Caso 1: enviada há 4 dias, ainda pendente, token válido, nunca reengajada → cria draft ──
  const enviada4dSemResposta: Pick<AvaliacaoCandidata, "status" | "msg_enviada_at" | "public_token_expires_at"> = {
    status: "pendente",
    msg_enviada_at: diasAtras(4),
    public_token_expires_at: diasNaFrente(3),
  };
  const decisao1 = decidirReengajamento(enviada4dSemResposta, agora, false);
  assert.strictEqual(decisao1.criar, true, "4 dias sem resposta deve ser elegível");
  assert.strictEqual(decisao1.motivo, "elegivel");

  // ── Caso 2: já respondida → nunca cria draft, mesmo com dias suficientes ──
  const respondida: Pick<AvaliacaoCandidata, "status" | "msg_enviada_at" | "public_token_expires_at"> = {
    status: "respondida",
    msg_enviada_at: diasAtras(10),
    public_token_expires_at: diasNaFrente(50),
  };
  const decisao2 = decidirReengajamento(respondida, agora, false);
  assert.strictEqual(decisao2.criar, false, "respondida não deve gerar reengajamento");
  assert.strictEqual(decisao2.motivo, "ja_respondida_ou_expirada");

  // ── Caso 3: já reengajada antes → nunca cria 2º draft (dedup — precedente #526) ──
  const decisao3 = decidirReengajamento(enviada4dSemResposta, agora, true);
  assert.strictEqual(decisao3.criar, false, "já reengajada não deve gerar 2º draft");
  assert.strictEqual(decisao3.motivo, "ja_reengajado");

  // ── Caso 4: dentro do prazo mínimo (2 dias < 3) → ainda não é hora ──
  const enviada2d: Pick<AvaliacaoCandidata, "status" | "msg_enviada_at" | "public_token_expires_at"> = {
    status: "pendente",
    msg_enviada_at: diasAtras(2),
    public_token_expires_at: diasNaFrente(5),
  };
  const decisao4 = decidirReengajamento(enviada2d, agora, false);
  assert.strictEqual(decisao4.criar, false, "2 dias é antes do prazo mínimo de reengajamento");
  assert.strictEqual(decisao4.motivo, "dentro_do_prazo");
  assert.strictEqual(REENGAJAMENTO_DIAS_MIN, 3, "prazo mínimo documentado no briefing é 3 dias");

  // ── Caso 5: token expirado → não reengaja link morto ──
  const tokenExpirado: Pick<AvaliacaoCandidata, "status" | "msg_enviada_at" | "public_token_expires_at"> = {
    status: "pendente",
    msg_enviada_at: diasAtras(8),
    public_token_expires_at: diasAtras(1),
  };
  const decisao5 = decidirReengajamento(tokenExpirado, agora, false);
  assert.strictEqual(decisao5.criar, false, "token expirado não deve gerar reengajamento");

  // ── Caso 6: sem msg_enviada_at (nunca enviada) → não elegível ──
  const semEnvio: Pick<AvaliacaoCandidata, "status" | "msg_enviada_at" | "public_token_expires_at"> = {
    status: "pendente",
    msg_enviada_at: null,
    public_token_expires_at: diasNaFrente(5),
  };
  const decisao6 = decidirReengajamento(semEnvio, agora, false);
  assert.strictEqual(decisao6.criar, false, "sem envio prévio não deve gerar reengajamento");
  assert.strictEqual(decisao6.motivo, "sem_envio");

  // ── Mensagem: curta, tom leve, com nome e link ──────────────────────────
  const msg = montarMensagemReengajamento(
    { nome_cliente: "Maria", public_token: "abc-123" },
    "https://app.consultdelivery.com.br"
  );
  assert.ok(msg.includes("Maria"), "mensagem deve personalizar com o nome do cliente");
  assert.ok(msg.includes("https://app.consultdelivery.com.br/avaliacao/abc-123"), "mensagem deve conter o link público");
  assert.ok(msg.length < 300, "mensagem de reengajamento deve ser curta");

  const msgSemNome = montarMensagemReengajamento(
    { nome_cliente: null, public_token: "abc-123" },
    "https://app.consultdelivery.com.br"
  );
  assert.ok(msgSemNome.includes("cliente"), "fallback genérico quando não há nome do cliente");

  console.log("OK — csat-reengajamento.test.ts: detecção, dedup e mensagem íntegros");
}

run();
