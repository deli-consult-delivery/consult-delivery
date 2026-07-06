/**
 * PoC — TD#44/#57: janela de horário por-tenant (Opção B da proposta em
 * docs/decisions/scheduler-por-tenant.md).
 *
 * Função pura, sem I/O: dado um horário configurado (HH:MM[:SS], já em BRT —
 * mesma convenção fixa UTC-3 sem DST usada em trigger/bom-dia/envio-agendado.ts)
 * e o instante atual, diz se "agora" cai dentro da janela de tolerância.
 *
 * Usada por uma task de cron fino (ex.: a cada 15 min) que varre todos os
 * tenants e dispara só quem está dentro da própria janela configurada —
 * substitui N schedules.task fixos por 1 cron + fan-out lendo config.
 */

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3, sem DST desde 2020 (SP)

export interface JanelaParams {
  /** Horário configurado do tenant, formato "HH:MM" ou "HH:MM:SS" (já em BRT). */
  horaConfigurada: string;
  /** Instante atual (UTC). */
  agora: Date;
  /** Largura da janela de tolerância em minutos (default 15 — mesmo passo do cron sugerido). */
  toleranciaMin?: number;
}

/** Converte "HH:MM[:SS]" em minutos desde meia-noite. Lança se o formato for inválido. */
export function horaParaMinutos(hora: string): number {
  const m = hora.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) throw new Error(`horaParaMinutos: formato inválido "${hora}" (esperado HH:MM ou HH:MM:SS)`);
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) throw new Error(`horaParaMinutos: hora fora do range "${hora}"`);
  return h * 60 + min;
}

/** Minutos desde meia-noite (BRT) do instante `agora` (UTC). */
export function minutosAgoraBRT(agora: Date): number {
  const brt = new Date(agora.getTime() + BRT_OFFSET_MS);
  return brt.getUTCHours() * 60 + brt.getUTCMinutes();
}

/** true se `agora` (BRT, UTC-3 fixo) cai num sábado. */
export function isSabadoBRT(agora: Date): boolean {
  return new Date(agora.getTime() + BRT_OFFSET_MS).getUTCDay() === 6;
}

/**
 * true se `agora` (BRT) cai dentro de [horaConfigurada, horaConfigurada + toleranciaMin).
 * Não trata virada de dia (00:0X com configurado 23:5X) — casos de borda ficam
 * para quando este PoC virar implementação real, não bloqueiam a prova de conceito.
 */
export function estaNaJanela(params: JanelaParams): boolean {
  const tolerancia = params.toleranciaMin ?? 15;
  const alvo = horaParaMinutos(params.horaConfigurada);
  const atual = minutosAgoraBRT(params.agora);
  return atual >= alvo && atual < alvo + tolerancia;
}
