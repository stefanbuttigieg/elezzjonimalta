// Fire-and-forget logger for public API requests.
// Writes to public.api_request_logs via the service-role client so it bypasses RLS.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function ipFromRequest(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function hashIp(ip: string): string {
  // Hash IPs so we never store raw addresses (privacy-friendly logs).
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function logApiRequest(params: {
  request: Request;
  endpoint: string;
  statusCode: number;
  startedAt: number;
}): void {
  const { request, endpoint, statusCode, startedAt } = params;
  const url = new URL(request.url);
  const responseMs = Math.max(0, Date.now() - startedAt);

  // Don't await — we never want logging to slow the response.
  void supabaseAdmin
    .from("api_request_logs")
    .insert({
      endpoint,
      method: request.method,
      status_code: statusCode,
      query_string: url.search ? url.search.slice(1).slice(0, 500) : null,
      ip_hash: hashIp(ipFromRequest(request)),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      response_time_ms: responseMs,
    })
    .then(({ error }) => {
      if (error) console.error("api log insert failed", error.message);
    });
}
