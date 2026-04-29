import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  checkRateLimit,
  clientKeyFromRequest,
  rateLimitHeaders,
} from "@/server/rateLimit.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/v1/districts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const limit = checkRateLimit(clientKeyFromRequest(request, "districts"), {
          limit: 60,
          windowMs: 60_000,
        });
        const baseHeaders = {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=600",
          ...CORS,
          ...rateLimitHeaders(limit),
        };
        if (!limit.allowed) {
          return new Response(
            JSON.stringify({ error: "rate_limited", message: "Too many requests" }),
            { status: 429, headers: baseHeaders }
          );
        }

        const { data, error } = await supabaseAdmin
          .from("districts")
          .select(
            "id, number, name_en, name_mt, localities_en, localities_mt, source_url"
          )
          .eq("status", "published")
          .order("number", { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ error: "internal_error", message: "Failed to load districts" }),
            { status: 500, headers: baseHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            data,
            meta: { count: data?.length ?? 0, generatedAt: new Date().toISOString() },
          }),
          { status: 200, headers: baseHeaders }
        );
      },
    },
  },
});
