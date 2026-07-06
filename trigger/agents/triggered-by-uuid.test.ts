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

const UUID = "11111111-1111-1111-1111-111111111111";

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

  console.log("OK — triggered-by-uuid.test.ts: InputSchema rejeita 'run_abc' e aceita ausente (executar-tarefa + responder-conclusao)");
}

run();
