/**
 * Smoke test do conversor de schema OpenAI <-> Anthropic em llm-tools.ts.
 * NÃO chama rede — só exercita toAnthropicTools/toAnthropicMessages/fromAnthropicResponse.
 * Roda com: npx tsx trigger/_shared/llm-tools.test.ts
 */

import assert from "node:assert";
import Anthropic from "@anthropic-ai/sdk";
import {
  toAnthropicTools,
  toAnthropicMessages,
  fromAnthropicResponse,
  type ToolDef,
  type OAIMessage,
} from "./llm-tools";

async function run() {
  // 1. Tool OpenAI (type:'function', function:{name,description,parameters}) vira
  //    Anthropic.Tool (name, description, input_schema) preservando o schema.
  const toolOpenAI: ToolDef = {
    type: "function",
    function: {
      name: "consultar_metricas",
      description: "Consulta métricas",
      parameters: {
        type: "object",
        properties: { loja_id: { type: "string" } },
        required: ["loja_id"],
      },
    },
  };
  const [toolAnthropic] = toAnthropicTools([toolOpenAI]);
  assert.strictEqual(toolAnthropic.name, "consultar_metricas");
  assert.strictEqual(toolAnthropic.description, "Consulta métricas");
  assert.deepStrictEqual(toolAnthropic.input_schema, toolOpenAI.function.parameters);

  // 2. Mensagem assistant com tool_calls (formato OpenAI) vira bloco tool_use Anthropic.
  const messages: OAIMessage[] = [
    { role: "user", content: "oi" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "consultar_metricas", arguments: JSON.stringify({ loja_id: "abc" }) },
        },
      ],
    },
    { role: "tool", tool_call_id: "call_1", content: "[]" },
  ];
  const anthropicMessages = toAnthropicMessages(messages);
  assert.strictEqual(anthropicMessages.length, 3);
  assert.strictEqual(anthropicMessages[0].role, "user");
  const assistantBlock = anthropicMessages[1].content;
  assert.ok(Array.isArray(assistantBlock));
  const toolUse = (assistantBlock as Anthropic.ContentBlockParam[]).find(
    (b) => b.type === "tool_use"
  ) as Anthropic.ToolUseBlockParam;
  assert.strictEqual(toolUse.name, "consultar_metricas");
  assert.deepStrictEqual(toolUse.input, { loja_id: "abc" });
  const toolResultBlock = anthropicMessages[2].content;
  assert.ok(Array.isArray(toolResultBlock));
  assert.strictEqual(
    (toolResultBlock as Anthropic.ContentBlockParam[])[0].type,
    "tool_result"
  );

  // 3. Resposta Anthropic com tool_use volta para o formato OpenAI (tool_calls com arguments string).
  const fakeAnthropicResponse = {
    content: [
      { type: "text", text: "Vou checar" },
      { type: "tool_use", id: "toolu_1", name: "consultar_metricas", input: { loja_id: "xyz" } },
    ],
  } as unknown as Anthropic.Message;
  const oaiMessage = fromAnthropicResponse(fakeAnthropicResponse);
  assert.strictEqual(oaiMessage.role, "assistant");
  assert.strictEqual(oaiMessage.content, "Vou checar");
  assert.strictEqual(oaiMessage.tool_calls?.length, 1);
  assert.strictEqual(oaiMessage.tool_calls?.[0].function.name, "consultar_metricas");
  assert.deepStrictEqual(
    JSON.parse(oaiMessage.tool_calls![0].function.arguments),
    { loja_id: "xyz" }
  );

  console.log("OK — llm-tools.test.ts: conversor de schema OpenAI<->Anthropic íntegro (sem rede)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
