// Gate de horário para BRENO — timezone America/Belem (UTC-3, sem DST)
// Expediente: Seg-Sex 09-12 e 13-18 | Sáb 08-12 | Dom: off inteiro
// Off-hours inclui almoço (12-13), noite, fins de semana e feriados

import Holidays from 'date-holidays';

export type OffHoursMotivo =
  | 'expediente'
  | 'almoco'
  | 'noite'
  | 'domingo'
  | 'feriado'
  | 'sabado_tarde';

export function isBrenoOffHours(ts: Date = new Date()): {
  offHours: boolean;
  motivo: OffHoursMotivo;
} {
  const TZ = 'America/Belem';
  const uf = process.env.BRENO_UF || 'PA';

  const hd = new Holidays('BR', uf);

  const overrides: string[] = JSON.parse(
    process.env.BRENO_FERIADOS_OVERRIDE || '[]',
  );

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ts);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday').toLowerCase(); // 'mon', 'tue', ..., 'sun'
  const hour    = parseInt(get('hour'),   10);
  const min     = parseInt(get('minute'), 10);
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD

  if (overrides.includes(dateStr) || hd.isHoliday(ts)) {
    return { offHours: true, motivo: 'feriado' };
  }

  if (weekday === 'sun') {
    return { offHours: true, motivo: 'domingo' };
  }

  const totalMin = hour * 60 + min;

  if (weekday === 'sat') {
    if (totalMin >= 480 && totalMin < 720) {
      return { offHours: false, motivo: 'expediente' };
    }
    return { offHours: true, motivo: 'sabado_tarde' };
  }

  // Seg-Sex
  if (totalMin >= 540 && totalMin < 720)  return { offHours: false, motivo: 'expediente' }; // 09-12
  if (totalMin >= 720 && totalMin < 780)  return { offHours: true,  motivo: 'almoco' };      // 12-13
  if (totalMin >= 780 && totalMin < 1080) return { offHours: false, motivo: 'expediente' }; // 13-18

  return { offHours: true, motivo: 'noite' };
}
