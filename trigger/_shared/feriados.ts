/**
 * Feriados nacionais brasileiros — fonte única de verdade.
 * Inclui 11-20 Consciência Negra (Lei 14.759/2023).
 * Carnaval e Corpus Christi facultativo NÃO listados: empresa trabalha nesses dias.
 */

// Datas móveis derivam do domingo de Páscoa: 2026 → 05-abr (Sexta-feira Santa 03-abr);
// 2027 → 28-mar (Sexta-feira Santa 26-mar). Tiradentes é data FIXA (21-abr todo ano).
// Domingo de Páscoa não entra na lista: domingo já é bloqueado pela regra de horário.
export const FERIADOS_NACIONAIS_POR_ANO: Record<number, string[]> = {
  2026: [
    "01-01", // Confraternização Universal
    "04-03", // Sexta-feira Santa (Paixão de Cristo)
    "04-21", // Tiradentes
    "05-01", // Dia do Trabalho
    "09-07", // Independência
    "10-12", // Nossa Senhora Aparecida
    "11-02", // Finados
    "11-15", // Proclamação da República
    "11-20", // Consciência Negra
    "12-25", // Natal
  ],
  2027: [
    "01-01", // Confraternização Universal
    "03-26", // Sexta-feira Santa (Paixão de Cristo)
    "04-21", // Tiradentes
    "05-01", // Dia do Trabalho
    "09-07", // Independência
    "10-12", // Nossa Senhora Aparecida
    "11-02", // Finados
    "11-15", // Proclamação da República
    "11-20", // Consciência Negra
    "12-25", // Natal
  ],
};

export function isFeriadoNacional(year: number, monthDay: string): boolean {
  return (FERIADOS_NACIONAIS_POR_ANO[year] ?? []).includes(monthDay);
}

/**
 * Linha de retorno para encerramento quando amanhã é feriado nacional.
 * Itera a partir de hoje para encontrar o próximo dia útil (não-domingo, não-feriado).
 */
export function getNextWorkingDayReturnLine(todayDateStr: string): string {
  const [y, m, d] = todayDateStr.split("-").map(Number);
  let candidate = new Date(y, m - 1, d);
  const DAY_NAMES_BR = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado",
  ];

  for (let i = 1; i <= 10; i++) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    const dow = candidate.getDay();
    const yr  = candidate.getFullYear();
    const mm  = String(candidate.getMonth() + 1).padStart(2, "0");
    const dd  = String(candidate.getDate()).padStart(2, "0");
    const md  = `${mm}-${dd}`;
    const yearHolidays = FERIADOS_NACIONAIS_POR_ANO[yr] ?? [];
    if (dow !== 0 && !yearHolidays.includes(md)) {
      const hour = dow === 6 ? "08h" : "09h";
      return `🕘 Amanhã é feriado nacional — voltamos na ${DAY_NAMES_BR[dow]} às ${hour}`;
    }
  }
  return "🕘 Amanhã é feriado nacional — voltamos no próximo dia útil às 09h";
}
