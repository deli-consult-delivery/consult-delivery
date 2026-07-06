/**
 * Smoke test: InputSchema de agent-executar-tarefa e agent-responder-conclusao
 * exige `triggered_by` como UUID (ou ausente) — nunca aceita o formato de
 * ctx.run.id do Trigger.dev ("run_xxx"). Mesma classe de bug do fallback
 * `ctx.run.id` em trigger/breno/processar-webhook.ts (message_id): se alguém
 * reintroduzir `triggered_by: ctx.run.id` como fallback, o Zod tem que barrar
 * antes de virar um ZodError silencioso na execução do agente. Sem rede.
 * Roda com: npx tsx trigger/agents/triggered-by-uuid.test.ts
 */
import assert from "node:assert";
import { InputSchema as ExecutarTarefaInputSchema } from "./executar-tarefa";
import { InputSchema as ResponderConclusaoInputSchema } from "./responder-conclusao";
import { uuidDeterministico } from "../breno/processar-webhook";

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function run() {
  // agent-executar-tarefa ────────────────────────────────────────────────────
  const executarComRunId = ExecutarTarefaInputSchema.safeParse({
    tenant_id: UUID,
    task_id: UUID,
    triggered_by: "run_abc",
  });
  assert.strictEqual(executarComRunId.success, false, "executar-tarefa deveria rejeitar triggered_by='run_abc'");

  const executarSemTriggeredBy = ExecutarTarefaInputSchema.safeParse({
    tenant_id: UUID,
    task_id: UUID,
  });
  assert.strictEqual(executarSemTriggeredBy.success, true, "executar-tarefa deveria aceitar triggered_by ausente");

  // agent-responder-conclusao ──────────────────────────────────────────────────
  const responderComRunId = ResponderConclusaoInputSchema.safeParse({
    tenant_id: UUID,
    task_id: UUID,
    conversation_id: UUID,
    triggered_by: "run_abc",
  });
  assert.strictEqual(responderComRunId.success, false, "responder-conclusao deveria rejeitar triggered_by='run_abc'");

  const responderSemTriggeredBy = ResponderConclusaoInputSchema.safeParse({
    tenant_id: UUID,
    task_id: UUID,
    conversation_id: UUID,
  });
  assert.strictEqual(responderSemTriggeredBy.success, true, "responder-conclusao deveria aceitar triggered_by ausente");

  // uuidDeterministico (fallback de message_id em processar-webhook.ts) ───────
  // Precisa ser: (1) formato UUID válido, (2) ESTÁVEL pro mesmo seed — é isso
  // que preserva a idempotência entre os retries da task (retry:{maxAttempts:2}).
  const runId = "run_abc123";
  const uuid1 = uuidDeterministico(runId);
  const uuid2 = uuidDeterministico(runId);
  assert.match(uuid1, UUID_REGEX, "uuidDeterministico deveria produzir formato UUID válido");
  assert.strictEqual(uuid1, uuid2, "uuidDeterministico deveria ser determinístico (mesmo seed → mesmo UUID, preserva idempotência em retries)");
  assert.notStrictEqual(uuidDeterministico("run_outro"), uuid1, "seeds diferentes deveriam produzir UUIDs diferentes");

  console.log("OK — triggered-by-uuid.test.ts: InputSchema rejeita 'run_abc' e aceita ausente (executar-tarefa + responder-conclusao); uuidDeterministico é estável");
}

run();
