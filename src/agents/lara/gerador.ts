import { executeAgent } from "../shared/runtime";
import type { RunContext } from "../shared/runtime";

export interface LaraPayload {
  tema: string;
  formato: "post" | "story" | "carrossel" | "reels";
  contexto_adicional?: string;
  calendar_id?: string;
}

export interface LaraOutput {
  titulo: string;
  corpo: string;
  hashtags: string[];
  formato: string;
  call_to_action: string;
}

export async function gerarConteudo(
  payload: LaraPayload,
  ctx: RunContext
): Promise<LaraOutput> {
  const result = await executeAgent("lara-editorial", payload, ctx);
  const raw = String(result.output);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("[lara] output não é JSON válido");
  return JSON.parse(jsonMatch[0]) as LaraOutput;
}
