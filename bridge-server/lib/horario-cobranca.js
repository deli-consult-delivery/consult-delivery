'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Horário legal de cobrança por WhatsApp (contato direto com o devedor).
//
//   Seg–Sex: 8h–21h · Sábado: 8h–12h · Domingo e feriados nacionais: PROIBIDO.
//
// Base: prática de mercado para cobrança/telemarketing (analogia ao Decreto
// 6.523/2008 e códigos estaduais de defesa do consumidor). A cobrança
// AUTOMÁTICA de boleto/PIX (Asaas) NÃO passa por aqui — segue sem restrição;
// a guarda vale só para o contato direto via WhatsApp/SMS.
//
// Fuso fixo America/Sao_Paulo (mesmo padrão de supabase/functions/
// evolution-webhook/index.ts). Feriados espelhados de trigger/_shared/feriados.ts.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';

// Espelho de trigger/_shared/feriados.ts — formato "MM-DD" (sem facultativos).
// Datas móveis: 2026 Sexta-feira Santa 04-03; 2027 Sexta-feira Santa 03-26.
// Tiradentes fixo 04-21. Domingo de Páscoa não entra (domingo já é bloqueado).
const FERIADOS_NACIONAIS_POR_ANO = {
  2026: ['01-01', '04-03', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'],
  2027: ['01-01', '03-26', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'],
};

const DIAS_BR = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WD_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MS_DIA = 24 * 60 * 60 * 1000;

// Extrai componentes de uma data no fuso de São Paulo.
function partsSP(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    weekday: WD_MAP[p.weekday], // 0=domingo .. 6=sábado
    year: Number(p.year),
    monthDay: `${p.month}-${p.day}`, // "MM-DD"
    day: p.day,
    month: p.month,
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

// Feriado nacional no fuso de São Paulo?
function isFeriado(date) {
  const { year, monthDay } = partsSP(date);
  return (FERIADOS_NACIONAIS_POR_ANO[year] || []).includes(monthDay);
}

// Janela legal do dia em horas [início, fim). null = dia sem janela (domingo).
function janelaDoDia(weekday) {
  if (weekday === 0) return null; // domingo
  if (weekday === 6) return [8, 12]; // sábado
  return [8, 21]; // seg–sex
}

// Rótulo legível da próxima janela, ex.: "amanhã (22/06) às 08h".
function rotulo(date, hora, quando) {
  const { day, month } = partsSP(date);
  return `${quando} (${day}/${month}) às ${String(hora).padStart(2, '0')}h`;
}

// Calcula a próxima janela permitida a partir de `fromDate` (inclui o próprio dia).
function proximaJanela(fromDate) {
  for (let i = 0; i < 14; i++) {
    const cand = new Date(fromDate.getTime() + i * MS_DIA);
    if (isFeriado(cand)) continue;
    const { weekday, hour } = partsSP(cand);
    const janela = janelaDoDia(weekday);
    if (!janela) continue; // domingo

    if (i === 0) {
      if (hour >= janela[1]) continue; // janela de hoje já passou
      return rotulo(cand, janela[0], 'hoje'); // antes da janela → hoje no início
    }
    const quando = i === 1 ? 'amanhã' : DIAS_BR[weekday];
    return rotulo(cand, janela[0], quando);
  }
  return null;
}

/**
 * Verifica se `date` está dentro do horário legal de cobrança por WhatsApp.
 * @param {Date} [date] data/hora a avaliar (default: agora)
 * @returns {{ permitido: boolean, motivo: string, proximaJanela: string|null }}
 */
function dentroHorarioLegal(date = new Date()) {
  const { weekday, hour } = partsSP(date);

  // Fail-safe: se o parse de fuso falhar, bloquear (nunca liberar por engano).
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(hour)) {
    return {
      permitido: false,
      motivo: 'Não foi possível determinar o horário no fuso de São Paulo — envio bloqueado por segurança.',
      proximaJanela: null,
    };
  }

  const janela = janelaDoDia(weekday);

  let motivo = '';
  if (isFeriado(date)) {
    motivo = 'Feriado nacional — cobrança por WhatsApp não é permitida.';
  } else if (!janela) {
    motivo = 'Domingo — cobrança por WhatsApp não é permitida.';
  } else if (hour < janela[0]) {
    motivo = `Antes do horário permitido (${DIAS_BR[weekday]} a partir das ${janela[0]}h).`;
  } else if (hour >= janela[1]) {
    motivo = `Após o horário permitido (${DIAS_BR[weekday]} até as ${janela[1]}h).`;
  } else {
    return { permitido: true, motivo: '', proximaJanela: null };
  }

  return { permitido: false, motivo, proximaJanela: proximaJanela(date) };
}

module.exports = { dentroHorarioLegal, isFeriado, FERIADOS_NACIONAIS_POR_ANO };
