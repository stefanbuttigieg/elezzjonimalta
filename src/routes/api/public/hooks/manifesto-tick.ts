// Public webhook driven by pg_cron every minute. Advances any
// manifesto import that's stuck in `processing` because the admin who
// started it closed the browser tab. Each call performs ONE pipeline
// step on a single row to stay well within the Worker CPU budget.
//
// Auth: Supabase anon key in the `apikey` header.
// Watchdog: rows that haven't progressed for >15min are marked failed.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runManifestoImportStep } from "@/server/manifestoImport.server";

const STALE_AFTER_SECONDS = 30;
const WATCHDOG_AFTER_SECONDS = 15 * 60;

async function tickOne() {
  const cutoffStale = new Date(Date.now() - STALE_AFTER_SECONDS * 1000).toISOString();
  const cutoffDead = new Date(Date.now() - WATCHDOG_AFTER_SECONDS * 1000).toISOString();

  // Watchdog first: anything that hasn't moved in WATCHDOG_AFTER_SECONDS
  // gets marked failed so admins notice it in the UI.
  const { data: dead } = await supabaseAdmin
    .from("manifesto_imports" as never)
    .select("id, updated_at")
    .eq("status", "processing")
    .lt("updated_at", cutoffDead);
  for (const row of (dead ?? []) as Array<{ id: string }>) {
    await supabaseAdmin
      .from("manifesto_imports" as never)
      .update({
        status: "failed",
        stage: "Failed (watchdog)",
        error:
          "Import was stuck in processing for more than 15 minutes with no progress and was auto-failed. Retry from the admin UI.",
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id);
  }

  // Pick the oldest stalled row (no progress in STALE_AFTER_SECONDS).
  const { data: stalled } = await supabaseAdmin
    .from("manifesto_imports" as never)
    .select("id, updated_at")
    .eq("status", "processing")
    .lt("updated_at", cutoffStale)
    .order("updated_at", { ascending: true })
    .limit(1);
  const row = (stalled ?? [])[0] as { id: string } | undefined;
  if (!row) return { ticked: 0 as const };

  const result = await runManifestoImportStep(row.id);
  return { ticked: 1 as const, importId: row.id, result };
}

export const Route = createFileRoute("/api/public/hooks/manifesto-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey");
        const cronSecret = request.headers.get("x-cron-secret");
        const okApiKey =
          !!provided &&
          (provided === process.env.SUPABASE_ANON_KEY ||
            provided === process.env.SUPABASE_PUBLISHABLE_KEY);
        const okCron =
          !!cronSecret &&
          !!process.env.NEWS_CRON_SECRET &&
          cronSecret === process.env.NEWS_CRON_SECRET;
        if (!okApiKey && !okCron) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const out = await tickOne();
          return new Response(JSON.stringify({ ok: true, ...out }), {
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
