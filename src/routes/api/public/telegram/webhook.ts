// Telegram webhook receiver. Telegram sends every update here; we verify the
// X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET,
// answer 200 immediately and process the update in the background.
// Registration is self-healing: see ensureTelegramWebhook (called by the
// manifesto-tick cron), which re-registers if Telegram's URL ever drifts.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!secret) return json({ error: "not configured" }, 503);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, secret)) return json({ error: "unauthorized" }, 401);

        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return json({ ok: true, ignored: true });
        }
        if (!update || typeof (update as { update_id?: unknown }).update_id !== "number") {
          return json({ ok: true, ignored: true });
        }

        const [{ handleTelegramUpdate }, { runInBackground }] = await Promise.all([
          import("@/server/telegramBot.server"),
          import("@/server/runInBackground.server"),
        ]);
        runInBackground(handleTelegramUpdate(update));
        return json({ ok: true });
      },
    },
  },
});
