import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/elcom-refresh")({
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
          const { refreshAllCachedElcomEntries } = await import(
            "@/lib/elcomCandidateCounts.functions"
          );
          const result = await refreshAllCachedElcomEntries();
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
