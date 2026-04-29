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

export const Route = createFileRoute("/api/public/v1/parties")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const limit = checkRateLimit(clientKeyFromRequest(request, "parties"), {
          limit: 60,
          windowMs: 60_000,
        });
        const baseHeaders = {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=300",
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
          .from("parties")
          .select(
            "id, slug, name_en, name_mt, short_name, color, website, leader_name, founded_year, slogan_en, slogan_mt, logo_url, wikipedia_url"
          )
          .eq("status", "published")
          .order("name_en", { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ error: "internal_error", message: "Failed to load parties" }),
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
