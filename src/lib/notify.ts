import { getStore } from './store';

/** Kirim notifikasi ke webhook (Discord/Slack/generic JSON) dan/atau Telegram. */
export async function notify(text: string, payload: Record<string, unknown> = {}) {
  const s = getStore().getSettings();
  const jobs: Promise<unknown>[] = [];
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

  if (s.webhookUrl) {
    jobs.push(
      fetch(s.webhookUrl, {
        ...opts,
        body: JSON.stringify({ text, content: text, ...payload }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
  if (s.telegramBotToken && s.telegramChatId) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
        ...opts,
        body: JSON.stringify({ chat_id: s.telegramChatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.warn('[notify] gagal:', r.reason);
}
