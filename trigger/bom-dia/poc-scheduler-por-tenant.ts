/**
 * PoC — TD#44/#57 (scheduler por-tenant, Opção B).
 * Ver docs/decisions/scheduler-por-tenant.md para a proposta completa.
 *
 * ⚠️ NÃO É PRODUÇÃO. Esta task:
 *   - NÃO envia bom-dia (nenhuma chamada a Evolution/WhatsApp).
 *   - NÃO escreve no banco (só SELECT em bom_dia_config).
 *   - NÃO substitui nem desativa `bomDiaEnvioAgendadoSemana/Sabado`
 *     (trigger/bom-dia/envio-agendado.ts) — aquelas continuam intocadas,
 *     cron fixo 12h/11h UTC, rodando normalmente.
 *   - Só é registrada no Trigger.dev se este arquivo for incluído num
 *     `npx trigger.dev deploy` — esta sessão NÃO fez deploy (regra da task).
 *
 * Objetivo: provar que dá pra ler `bom_dia_config.hora_semana/hora_sabado`
 * (colunas que hoje só são logadas, nunca respeitadas — TD#44) e decidir,
 * por tenant, se "agora" é a hora configurada, usando 1 cron fino
 * (`* /15 * * * *`) em vez de 1 schedule fixo por tenant.
 */

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { estaNaJanela, isSabadoBRT } from "../_shared/tenant-window";

const TenantConfigSchema = z.object({
  tenant_id: z.string().uuid(),
  auto_send: z.boolean(),
  hora_semana: z.string(),
  hora_sabado: z.string(),
});

const OutputSchema = z.object({
  is_sabado: z.boolean(),
  tenants_avaliados: z.number().int(),
  tenants_na_janela: z.array(z.string().uuid()),
});

export const bomDiaPocSchedulerPorTenant = schedules.task({
  id: "bom-dia-poc-scheduler-por-tenant",
  cron: "*/15 * * * *",
  retry: { maxAttempts: 1 }, // PoC — sem retry agressivo, é só leitura/log

  run: async (payload) => {
    const agora = payload.timestamp;
    const sabado = isSabadoBRT(agora);
    const sb = getSupabase();

    const { data, error } = await sb
      .from("bom_dia_config")
      .select("tenant_id, auto_send, hora_semana, hora_sabado")
      .eq("auto_send", true);

    if (error) throw new Error(`poc-scheduler-por-tenant: falha ao buscar bom_dia_config: ${error.message}`);

    const configs = (data ?? []).map((c) => TenantConfigSchema.parse(c));

    const naJanela = configs
      .filter((c) => estaNaJanela({ horaConfigurada: sabado ? c.hora_sabado : c.hora_semana, agora }))
      .map((c) => c.tenant_id);

    logger.info("bom-dia-poc-scheduler-por-tenant: avaliação concluída (dry-run, nenhum envio)", {
      is_sabado: sabado,
      tenants_avaliados: configs.length,
      tenants_na_janela: naJanela,
    });

    return OutputSchema.parse({
      is_sabado: sabado,
      tenants_avaliados: configs.length,
      tenants_na_janela: naJanela,
    });
  },
});
