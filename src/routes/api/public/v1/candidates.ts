import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  checkRateLimit,
  clientKeyFromRequest,
  rateLimitHeaders,
} from "@/server/rateLimit.server";
import { logApiRequest } from "@/server/apiLogger.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ENDPOINT = "/api/public/v1/candidates";

export const Route = createFileRoute("/api/public/v1/candidates")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const url = new URL(request.url);
        const districtParam = url.searchParams.get("district");
        const partyParam = url.searchParams.get("party");
        const limitParam = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? 100), 1),
          500
        );

        const rl = checkRateLimit(clientKeyFromRequest(request, "candidates"), {
          limit: 60,
          windowMs: 60_000,
        });
        const baseHeaders = {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=300",
          ...CORS,
          ...rateLimitHeaders(rl),
        };
        if (!rl.allowed) {
          return new Response(
            JSON.stringify({ error: "rate_limited", message: "Too many requests" }),
            { status: 429, headers: baseHeaders }
          );
        }

        let query = supabaseAdmin
          .from("candidates")
          .select(
            "id, slug, full_name, photo_url, website, facebook, twitter, electoral_confirmed, is_incumbent, primary_district_id, party:parties(id, slug, short_name, name_en, name_mt, color)"
          )
          .eq("status", "published")
          .order("full_name", { ascending: true })
          .limit(limitParam);

        if (districtParam) {
          // Accept either a UUID or a district number (1-13).
          const asNumber = Number(districtParam);
          if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 13) {
            const { data: d } = await supabaseAdmin
              .from("districts")
              .select("id")
              .eq("number", asNumber)
              .eq("status", "published")
              .maybeSingle();
            if (d?.id) query = query.eq("primary_district_id", d.id);
          } else {
            query = query.eq("primary_district_id", districtParam);
          }
        }
        if (partyParam) {
          // Accept either a UUID or a party slug.
          if (/^[0-9a-f-]{36}$/i.test(partyParam)) {
            query = query.eq("party_id", partyParam);
          } else {
            const { data: p } = await supabaseAdmin
              .from("parties")
              .select("id")
              .eq("slug", partyParam)
              .maybeSingle();
            if (p?.id) query = query.eq("party_id", p.id);
          }
        }

        const { data, error } = await query;
        if (error) {
          return new Response(
            JSON.stringify({ error: "internal_error", message: "Failed to load candidates" }),
            { status: 500, headers: baseHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            data,
            meta: {
              count: data?.length ?? 0,
              limit: limitParam,
              filters: { district: districtParam, party: partyParam },
              generatedAt: new Date().toISOString(),
            },
          }),
          { status: 200, headers: baseHeaders }
        );
      },
    },
  },
});
