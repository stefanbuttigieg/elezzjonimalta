import { createFileRoute } from "@tanstack/react-router";
import { runNewsScan } from "@/server/newsScan.server";

export const Route = createFileRoute("/api/public/hooks/scan-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NEWS_CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runNewsScan({ trigger: "cron" });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
