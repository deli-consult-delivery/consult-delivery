import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Lazy singleton: new Anthropic() só é chamado quando getAnthropic() é invocado
// dentro de uma task (runtime). Nunca no import — evita crash do worker Trigger.dev.
let _anthropic: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY é obrigatória para tasks Trigger.dev"
      );
    }
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

interface RunClaudeOptions<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userPrompt: string;
  outputSchema: T;
  maxRetries?: number;
  useWebSearch?: boolean;
  // Chamado a cada resposta da API (inclusive tentativas com parse malsucedido —
  // o token já foi cobrado mesmo quando o retry descarta o resultado). O caller
  // acumula para obter o custo real do run: onUsage: (u) => costUsd += calcularCustoUsd(MODEL, u) ?? 0
  onUsage?: (usage: Anthropic.Usage) => void;
}

export async function runClaudeWithWebSearch<T extends z.ZodTypeAny>({
  systemPrompt,
  userPrompt,
  outputSchema,
  maxRetries = 1,
  useWebSearch = true,
  onUsage,
}: RunClaudeOptions<T>): Promise<z.infer<T>> {
  // web_search_20250305 é a ferramenta de busca aprovada no RESTRUCTURE.md
  const tools: Anthropic.Tool[] = useWebSearch
    ? [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Tool]
    : [];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getAnthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        ...(tools.length > 0 ? { tools } : {}),
      });

      onUsage?.(response.usage);

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return outputSchema.parse(parsed);
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        console.warn(`[claude] tentativa ${attempt + 1} falhou: ${lastError.message}`);
      }
    }
  }

  throw lastError ?? new Error("runClaudeWithWebSearch falhou sem erro capturado");
}
