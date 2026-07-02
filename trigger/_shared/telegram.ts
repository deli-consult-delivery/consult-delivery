// telegram.ts — notifier Telegram compartilhado.
// Extraído de trigger/_shared/loop-tasks.ts (notificarCeoAutorizacao), que tinha o
// fetch à Telegram Bot API inline. Centralizado aqui para reuso por outras tasks
// (ex.: trigger/gestor/coleta-diaria.ts) sem duplicar o soft-fail.

/**
 * Envia uma mensagem ao chat do CEO via Telegram Bot API.
 * Soft-fail: nunca lança — token/chat ausentes ou erro de rede só geram console.warn,
 * a task chamadora nunca deve quebrar por causa de uma notificação.
 */
export async function notifyTelegram(texto: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CEO_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN/CEO_TELEGRAM_CHAT_ID não configurados — notificação ignorada"
    );
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[telegram] HTTP ${res.status} (soft):`, body.slice(0, 200));
    }
  } catch (err) {
    console.warn("[telegram] falhou (soft):", (err as Error).message);
  }
}
