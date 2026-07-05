/**
 * MIA-02: LLM Client — abstrai provider via env
 *
 * Providers suportados:
 *   LLM_PROVIDER=ollama-cloud  → usa OLLAMA_BASE_URL + OLLAMA_API_KEY + OLLAMA_MODEL
 *   LLM_PROVIDER=anthropic     → usa ANTHROPIC_API_KEY + ANTHROPIC_MODEL (fallback)
 *
 * ATENÇÃO: lazy getters — nunca inicializar no topo do módulo (derruba worker Trigger.dev)
 */

import Anthropic from "@anthropic-ai/sdk";
import { calcularCustoUsd } from "../_shared/pricing";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  modelo: string;
  latencia_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  // null: provider não-Anthropic (Ollama Cloud) ou modelo fora da tabela de preços — nunca 0 fake.
  cost_usd?: number | null;
}

const TIMEOUT_MS = 120_000;

// ─── Ollama Cloud ─────────────────────────────────────────────────────────────
async function chatOllamaCloud(messages: ChatMessage[], forceJson = true): Promise<ChatResponse> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const apiKey  = process.env.OLLAMA_API_KEY;
  const model   = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || "kimi-k2.6:cloud";

  if (!baseUrl) throw new Error("OLLAMA_BASE_URL não definido");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(forceJson ? { format: "json" } : {}),
        options: { temperature: 0.1, num_predict: 8192 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama Cloud HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      model?: string;
      error?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    if (data.error) throw new Error(`Ollama error: ${data.error}`);

    const content = data.message?.content ?? "";
    if (!content) throw new Error("Ollama retornou content vazio (thinking consumiu todo num_predict?)");

    return {
      content,
      modelo:     data.model ?? model,
      latencia_ms: Date.now() - t0,
      tokens_in:  data.prompt_eval_count,
      tokens_out: data.eval_count,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Anthropic SDK (fallback) ─────────────────────────────────────────────────
async function chatAnthropic(messages: ChatMessage[]): Promise<ChatResponse> {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não definido");

  const client = new Anthropic();
  const t0 = Date.now();

  // Separa system do restante
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMsgs  = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:   systemMsg,
    messages: userMsgs,
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  return {
    content:    text,
    modelo:     model,
    latencia_ms: Date.now() - t0,
    tokens_in:  response.usage?.input_tokens,
    tokens_out: response.usage?.output_tokens,
    cost_usd:   response.usage ? calcularCustoUsd(model, response.usage) : null,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function chat(messages: ChatMessage[], forceJson = true): Promise<ChatResponse> {
  const provider = process.env.LLM_PROVIDER || "ollama-cloud";

  if (provider === "ollama-cloud") return chatOllamaCloud(messages, forceJson);
  if (provider === "anthropic")    return chatAnthropic(messages);

  throw new Error(`LLM_PROVIDER inválido: "${provider}". Use "ollama-cloud" ou "anthropic"`);
}
