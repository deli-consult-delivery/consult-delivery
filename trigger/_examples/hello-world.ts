import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

const InputSchema = z.object({
  name: z.string().min(1, "name é obrigatório"),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

/**
 * Task de sanidade — nunca remover.
 * Dispare com { "name": "Wandson" } pelo dashboard do Trigger.dev para validar
 * que a conexão cloud está funcionando.
 *
 * Como executar:
 *   1. Dashboard → Tasks → hello-world → Test
 *   2. Input: { "name": "Wandson" }
 *   3. Output esperado: { "ok": true, "message": "Olá, Wandson! ..." }
 */
export const helloWorld = task({
  id: "hello-world",
  retry: { maxAttempts: 1 },
  run: async (payload: z.infer<typeof InputSchema>) => {
    const input = InputSchema.parse(payload);

    return OutputSchema.parse({
      ok: true,
      message: `Olá, ${input.name}! Task Trigger.dev funcionando na Consult Delivery.`,
    });
  },
});
