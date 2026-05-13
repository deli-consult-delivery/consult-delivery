import { z } from "zod";

// Schemas Zod compartilhados entre agentes

export const TenantContextSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
});

export const AgentRunMetaSchema = z.object({
  agent_slug: z.string(),
  triggered_by: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
});

// Output base para qualquer task de agente
export const BaseOutputSchema = z.object({
  ok: z.boolean(),
  agent_slug: z.string(),
  timestamp: z.string().datetime(),
});
