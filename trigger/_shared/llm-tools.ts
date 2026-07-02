// llm-tools.ts — chat com tool use no formato OpenAI (messages + tools[] + tool_calls),
// falado contra uma CASCATA de providers.
//
// DECISÃO (2026-07-02, Wandson): a ANTHROPIC_API_KEY do Trigger.dev ficou sem créditos
// (400 "Your credit balance is too low" em prod, trigger/gestor/conversa.ts). Cascata:
//   a) Ollama Cloud (kimi-k2.6:cloud) — PRIMÁRIO, via endpoint OpenAI-compat /v1/chat/completions
//      (OLLAMA_BASE_URL aponta só para o host; /api/chat nativo também aceitaria `tools`, mas
//      /v1/chat/completions devolve o MESMO envelope OpenAI usado por OpenRouter — um único
//      parser para os dois, sem tradução).
//   b) OpenRouter (anthropic/claude-sonnet-4.6) — mesmo modelo Claude, formato OpenAI.
//   c) Anthropic nativo — só tenta se a e b falharem (é a chave sem créditos; último recurso).
// Erro de um provider → console.warn com o motivo e tenta o próximo. Se todos falharem → throw
// agregado. Sem dependência nova: fetch global (Node 18+) para a/b; @anthropic-ai/sdk (já é dep) para c.

import Anthropic from "@anthropic-ai/sdk";

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OAIMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatWithToolsInput {
  system: string;
  messages: OAIMessage[];
  tools: ToolDef[];
  maxTokens?: number;
}

export interface ChatWithToolsResult {
  message: OAIMessage;
  provider: "ollama" | "openrouter" | "anthropic";
  modelo: string;
}

// ── Providers OpenAI-compat (Ollama Cloud + OpenRouter) — mesmo envelope ──────────

async function callOpenAICompat(
  endpoint: string,
  apiKey: string,
  modelo: string,
  { system, messages, tools, maxTokens = 1536 }: ChatWithToolsInput
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const body = {
    model: modelo,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages],
    ...(tools.length ? { tools, tool_choice: "auto" } : {}),
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("resposta sem choices[0].message");
  return { content: message.content ?? null, tool_calls: message.tool_calls };
}

async function callOllamaCloud(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("OLLAMA_BASE_URL/OLLAMA_API_KEY não configurados");

  const modelo = process.env.LLM_MODEL || "kimi-k2.6:cloud";
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const { content, tool_calls } = await callOpenAICompat(endpoint, apiKey, modelo, input);
  return {
    message: { role: "assistant", content, ...(tool_calls?.length ? { tool_calls } : {}) },
    provider: "ollama",
    modelo,
  };
}

async function callOpenRouter(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada");

  const modelo = "anthropic/claude-sonnet-4.6";
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const { content, tool_calls } = await callOpenAICompat(endpoint, apiKey, modelo, input);
  return {
    message: { role: "assistant", content, ...(tool_calls?.length ? { tool_calls } : {}) },
    provider: "openrouter",
    modelo,
  };
}

// ── Anthropic nativo (último fallback) — traduz OpenAI <-> Anthropic ──────────────

// Exportadas (não fazem rede) para permitir smoke test do conversor de schema sem mockar fetch/SDK.
export function toAnthropicMessages(messages: OAIMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [
          { type: "tool_result" as const, tool_use_id: m.tool_call_id!, content: m.content ?? "" },
        ],
      };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || "{}"),
        });
      }
      return { role: "assistant", content: blocks };
    }
    return { role: m.role as "user" | "assistant", content: m.content ?? "" };
  });
}

export function toAnthropicTools(tools: ToolDef[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

export function fromAnthropicResponse(response: Anthropic.Message): OAIMessage {
  const toolUse = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    role: "assistant",
    content: text || null,
    ...(toolUse.length
      ? {
          tool_calls: toolUse.map((b) => ({
            id: b.id,
            type: "function" as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          })),
        }
      : {}),
  };
}

async function callAnthropicNative(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

  const modelo = "claude-sonnet-4-6";
  const client = new Anthropic();
  const response = await client.messages.create({
    model: modelo,
    max_tokens: input.maxTokens ?? 1536,
    system: input.system,
    messages: toAnthropicMessages(input.messages),
    ...(input.tools.length
      ? { tools: toAnthropicTools(input.tools), tool_choice: { type: "auto" as const } }
      : {}),
  });

  return { message: fromAnthropicResponse(response), provider: "anthropic", modelo };
}

// ── Ollama Cloud web search/fetch — API própria (mesma OLLAMA_API_KEY) ───────────
// Substitui o web_search da Anthropic (também sem créditos) para tools que precisam
// de dados externos. https://ollama.com/api/web_search e /api/web_fetch.

export interface OllamaWebSearchResult {
  title: string;
  url: string;
  content: string;
}

export async function ollamaWebSearch(
  query: string,
  maxResults = 5
): Promise<OllamaWebSearchResult[]> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error("OLLAMA_API_KEY não configurada");

  const r = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Ollama web_search HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const data = (await r.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).slice(0, maxResults).map((res) => ({
    title: res.title ?? "",
    url: res.url ?? "",
    content: (res.content ?? "").slice(0, 800),
  }));
}

export interface OllamaWebFetchResult {
  title: string;
  content: string;
  links: string[];
}

export async function ollamaWebFetch(url: string): Promise<OllamaWebFetchResult> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error("OLLAMA_API_KEY não configurada");

  const r = await fetch("https://ollama.com/api/web_fetch", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`Ollama web_fetch HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const data = (await r.json()) as { title?: string; content?: string; links?: string[] };
  return {
    title: data.title ?? "",
    content: (data.content ?? "").slice(0, 4000),
    links: data.links ?? [],
  };
}

// ── Cascata ────────────────────────────────────────────────────────────────────

export async function chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  const errors: string[] = [];

  for (const [nome, fn] of [
    ["ollama", callOllamaCloud],
    ["openrouter", callOpenRouter],
    ["anthropic", callAnthropicNative],
  ] as const) {
    try {
      return await fn(input);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[llm-tools] provider "${nome}" falhou: ${msg}`);
      errors.push(`${nome}: ${msg}`);
    }
  }

  throw new Error(`chatWithTools: todos os providers falharam — ${errors.join(" | ")}`);
}
