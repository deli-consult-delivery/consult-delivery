// =============================================================
// Cliente Asaas da DEFESA (assinaturas R$147) — PR10
// Env próprio: ASAAS_DEFESA_API_KEY / ASAAS_DEFESA_ENVIRONMENT
// com fallback para ASAAS_API_KEY / ASAAS_ENVIRONMENT (CORA).
// Permite rodar a Defesa em SANDBOX sem tocar a config existente.
// Lazy: nada lido no topo do módulo.
// =============================================================

interface AsaasDefesaConfig { baseUrl: string; apiKey: string; ambiente: string }

export function getAsaasDefesaConfig(): AsaasDefesaConfig {
  const ambiente = process.env.ASAAS_DEFESA_ENVIRONMENT ?? process.env.ASAAS_ENVIRONMENT ?? "sandbox";
  const apiKey = process.env.ASAAS_DEFESA_API_KEY ?? process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_DEFESA_API_KEY (ou ASAAS_API_KEY) não configurada");
  const baseUrl = ambiente === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
  return { baseUrl, apiKey, ambiente };
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const { baseUrl, apiKey } = getAsaasDefesaConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: apiKey, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = body?.errors?.[0]?.description ?? res.statusText;
    throw new Error(`Asaas ${res.status}: ${desc}`);
  }
  return body;
}

export async function criarCustomer(p: { name: string; email?: string; cpfCnpj: string; externalReference?: string }) {
  return asaasFetch("/customers", { method: "POST", body: JSON.stringify(p) });
}

export async function criarSubscription(p: {
  customer: string; value: number; nextDueDate: string; description?: string; externalReference?: string;
}) {
  return asaasFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ billingType: "UNDEFINED", cycle: "MONTHLY", ...p }),
  });
}

export async function listarPagamentosDaAssinatura(subscriptionId: string) {
  return asaasFetch(`/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=12`);
}
