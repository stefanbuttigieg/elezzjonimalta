import { createFileRoute } from "@tanstack/react-router";
import { runTelegramPoll } from "@/server/telegramBot.server";

// Public endpoint hit by pg_cron every minute. The handler runs a long-poll
// loop against Telegram getUpdates for ~50 seconds, processing any incoming
// commands and persisting the new offset/messages.
export const Route = createFileRoute("/api/public/hooks/telegram-poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runTelegramPoll();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          console.error("telegram-poll error", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => {
        // Convenience for manual triggering from a browser.
        try {
          const result = await runTelegramPoll();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
