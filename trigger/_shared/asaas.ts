import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const AsaasBillingType = z.enum([
  "BOLETO",
  "PIX",
  "CREDIT_CARD",
  "UNDEFINED",
]);

export const AsaasChargeStatus = z.enum([
  "PENDING",
  "RECEIVED",
  "CONFIRMED",
  "OVERDUE",
  "REFUNDED",
  "REMOVED",
  "RESTORED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "IN_DEBT_RECOVERY",
]);

export const CreateChargeInput = z.object({
  customer: z.string(),
  billingType: AsaasBillingType,
  value: z.number().positive(),
  dueDate: z.string(), // YYYY-MM-DD
  description: z.string().optional(),
  externalReference: z.string().optional(), // nosso UUID interno
});

export const AsaasCharge = z.object({
  id: z.string(),
  customer: z.string(),
  billingType: AsaasBillingType,
  value: z.number(),
  netValue: z.number().optional(),
  dueDate: z.string(),
  status: AsaasChargeStatus,
  description: z.string().nullable().optional(),
  externalReference: z.string().nullable().optional(),
  invoiceUrl: z.string().nullable().optional(),
  bankSlipUrl: z.string().nullable().optional(),
  pixQrCode: z
    .object({
      encodedImage: z.string().optional(),
      payload: z.string().optional(),
      expirationDate: z.string().optional(),
    })
    .nullable()
    .optional(),
  dateCreated: z.string().optional(),
  paymentDate: z.string().nullable().optional(),
});

export const AsaasListResponse = z.object({
  object: z.literal("list"),
  hasMore: z.boolean(),
  totalCount: z.number(),
  limit: z.number(),
  offset: z.number(),
  data: z.array(AsaasCharge),
});

// Tipos inferidos
export type AsaasBillingTypeValue = z.infer<typeof AsaasBillingType>;
export type AsaasChargeStatusValue = z.infer<typeof AsaasChargeStatus>;
export type CreateChargeInputType = z.infer<typeof CreateChargeInput>;
export type AsaasChargeType = z.infer<typeof AsaasCharge>;
export type AsaasListResponseType = z.infer<typeof AsaasListResponse>;

// ---------------------------------------------------------------------------
// Erro customizado
// ---------------------------------------------------------------------------

export class AsaasApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Config lazy — lida dentro de cada função, nunca no topo do módulo
// ASAAS_ENVIRONMENT: sandbox | production
// ---------------------------------------------------------------------------

interface AsaasConfig {
  baseUrl: string;
  apiKey: string;
}

function getAsaasConfig(): AsaasConfig {
  const env = process.env.ASAAS_ENVIRONMENT ?? "sandbox";
  const apiKey = process.env.ASAAS_API_KEY;

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não configurada. Adicione ao Infisical.");
  }

  const baseUrl =
    env === "sandbox"
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/api/v3";

  return { baseUrl, apiKey };
}

// ---------------------------------------------------------------------------
// Retry com exponential backoff
// Retry apenas em 429 (rate limit) e 5xx (erros Asaas).
// 4xx (exceto 429) indicam payload inválido — não retentamos.
// ---------------------------------------------------------------------------

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  const delaysMs = [0, 1000, 2000]; // tentativa 1: imediato, 2: 1s, 3: 2s

  let lastError: AsaasApiError | Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = delaysMs[attempt] ?? 2000;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err as AsaasApiError | Error;

      // Só retenta se for erro transitório (429 ou 5xx)
      if (err instanceof AsaasApiError && !shouldRetry(err.status)) {
        throw err;
      }

      // Se foi a última tentativa, lança o erro
      if (attempt === maxAttempts - 1) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("withRetry esgotou tentativas sem erro capturado");
}

// ---------------------------------------------------------------------------
// Fetch base — injeta auth header e trata erros HTTP
// ---------------------------------------------------------------------------

async function asaasFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const { baseUrl, apiKey } = getAsaasConfig();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    accept: "application/json",
    access_token: apiKey,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...options, headers });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new AsaasApiError(
      `Asaas API retornou ${response.status}: ${response.statusText}`,
      response.status,
      body
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// Métodos públicos
// ---------------------------------------------------------------------------

/**
 * POST /payments — cria uma cobrança no Asaas.
 */
export async function createCharge(
  data: CreateChargeInputType
): Promise<AsaasChargeType> {
  const validated = CreateChargeInput.parse(data);

  return withRetry(async () => {
    const raw = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify(validated),
    });
    return AsaasCharge.parse(raw);
  });
}

/**
 * GET /payments/:id — busca cobrança por ID Asaas.
 */
export async function getCharge(id: string): Promise<AsaasChargeType> {
  if (!id) throw new Error("getCharge: id é obrigatório");

  return withRetry(async () => {
    const raw = await asaasFetch(`/payments/${encodeURIComponent(id)}`);
    return AsaasCharge.parse(raw);
  });
}

/**
 * GET /payments — lista cobranças com filtros opcionais.
 */
export async function listCharges(filters?: {
  customer?: string;
  status?: string;
  billingType?: string;
  offset?: number;
  limit?: number;
}): Promise<AsaasListResponseType> {
  const params = new URLSearchParams();

  if (filters?.customer) params.set("customer", filters.customer);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.billingType) params.set("billingType", filters.billingType);
  if (filters?.offset !== undefined)
    params.set("offset", String(filters.offset));
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));

  const query = params.toString() ? `?${params.toString()}` : "";

  return withRetry(async () => {
    const raw = await asaasFetch(`/payments${query}`);
    return AsaasListResponse.parse(raw);
  });
}

/**
 * GET /payments — lista TODAS as cobranças, iterando páginas até hasMore=false.
 */
export async function listChargesAll(filters?: {
  customer?: string;
  status?: string;
  billingType?: string;
  dueDateGe?: string; // YYYY-MM-DD
  dueDateLe?: string; // YYYY-MM-DD
}): Promise<AsaasChargeType[]> {
  const all: AsaasChargeType[] = [];
  const PAGE = 100;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams();
    if (filters?.customer)   params.set("customer",   filters.customer);
    if (filters?.status)     params.set("status",     filters.status);
    if (filters?.billingType) params.set("billingType", filters.billingType);
    if (filters?.dueDateGe)  params.set("dueDateGe",  filters.dueDateGe);
    if (filters?.dueDateLe)  params.set("dueDateLe",  filters.dueDateLe);
    params.set("limit",  String(PAGE));
    params.set("offset", String(offset));

    const raw = await withRetry(() =>
      asaasFetch(`/payments?${params.toString()}`)
    );
    const page = AsaasListResponse.parse(raw);
    all.push(...page.data);

    if (!page.hasMore) break;
    offset += PAGE;
  }

  return all;
}

/**
 * POST /payments/:id/refund — estorna uma cobrança.
 */
export async function refundCharge(id: string): Promise<AsaasChargeType> {
  if (!id) throw new Error("refundCharge: id é obrigatório");

  return withRetry(async () => {
    const raw = await asaasFetch(
      `/payments/${encodeURIComponent(id)}/refund`,
      { method: "POST" }
    );
    return AsaasCharge.parse(raw);
  });
}
