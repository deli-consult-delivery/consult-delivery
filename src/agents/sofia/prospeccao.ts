import { executeAgent } from "../shared/runtime";
import type { RunContext } from "../shared/runtime";

export interface SofiaPayload {
  query: string;
  cidade: string;
  fonte: "google_maps" | "ifood" | "instagram";
  dados_brutos: string;
}

export interface SofiaLead {
  nome: string;
  fonte: string;
  cidade: string;
  bairro?: string;
  telefone?: string;
  instagram?: string;
  ifood_url?: string;
  gmaps_url?: string;
  score: number;
  justificativa: string;
  dados_json: Record<string, unknown>;
}

export async function qualificarLead(
  payload: SofiaPayload,
  ctx: RunContext
): Promise<SofiaLead> {
  const result = await executeAgent("sofia", payload, ctx);
  const raw = String(result.output);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("[sofia] output não é JSON válido");
  return JSON.parse(jsonMatch[0]) as SofiaLead;
}
