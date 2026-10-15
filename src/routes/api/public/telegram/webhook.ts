// Telegram webhook receiver. Telegram sends every update here; we verify the
// X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET,
// answer 200 immediately and process the update in the background.
//
// GET ?action=register (with header x-webhook-secret = TELEGRAM_WEBHOOK_SECRET)
// (re)registers the webhook with Telegram — used after publishing.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const WEBHOOK_URL = "https://elezzjonimalta.lovable.app/api/public/telegram/webhook";

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
      GET: async ({ request }) => {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!secret) return json({ error: "not configured" }, 503);
        const got = request.headers.get("x-webhook-secret") ?? "";
        if (!safeEqual(got, secret)) return json({ error: "unauthorized" }, 401);
        const { registerTelegramWebhook, getTelegramWebhookInfo } = await import(
          "@/server/telegramBot.server"
        );
        const action = new URL(request.url).searchParams.get("action");
        if (action === "register") {
          const reg = await registerTelegramWebhook(WEBHOOK_URL, secret);
          return json({ register: reg, info: await getTelegramWebhookInfo() });
        }
        return json({ info: await getTelegramWebhookInfo() });
      },
    },
  },
});
