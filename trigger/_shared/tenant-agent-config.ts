import { getSupabase } from "./supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TenantAgentConfig {
  /** Modo operacional override (null = usar modo padrão do agente). */
  modo_override: "humano" | "hibrido" | "ia" | null;
  /** Se false, o agente está desabilitado para o tenant (não processa runs). */
  enabled: boolean;
  /** Config extra em formato livre (provider, limites, prompts customizados, etc.). */
  config: Record<string, unknown>;
}

const DEFAULT_CONFIG: TenantAgentConfig = {
  modo_override: null,
  enabled: true,
  config: {},
};

// ─── Helper principal ─────────────────────────────────────────────────────────

/**
 * Retorna a config registrada para um par (tenant, agente).
 *
 * Usa service_role — pode ser chamado dentro de tasks Trigger.dev sem RLS.
 * Se não houver linha registrada, retorna DEFAULT_CONFIG (enabled=true, sem override).
 *
 * @example
 * const cfg = await getTenantAgentConfig(input.tenant_id, "bom-dia");
 * if (!cfg.enabled) {
 *   logger.info("agente desabilitado para este tenant");
 *   return { skipped: true };
 * }
 * // usar cfg.modo_override, cfg.config
 */
export async function getTenantAgentConfig(
  tenantId: string,
  agentId: string
): Promise<TenantAgentConfig> {
  const { data, error } = await getSupabase()
    .from("tenant_agent_config")
    .select("modo_override, enabled, config")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error) {
    console.warn(
      `[tenant-agent-config] leitura falhou para ${agentId}@${tenantId}: ${error.message}`
    );
    // Soft-fail: retorna defaults para não bloquear a task
    return DEFAULT_CONFIG;
  }

  if (!data) return DEFAULT_CONFIG;

  return {
    modo_override: (data.modo_override ?? null) as TenantAgentConfig["modo_override"],
    enabled: data.enabled ?? true,
    config: (data.config ?? {}) as Record<string, unknown>,
  };
}
