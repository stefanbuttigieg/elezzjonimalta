// Server functions to find candidate photos using Firecrawl web search.
// Strategy: query the web for "<full_name> <party>" and pick the first
// reasonable image result from a trusted/likely-official source.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./auditLog.server";

async function assertStaff(supabase: {
  rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
}) {
  const { data, error } = await supabase.rpc("get_my_roles");
  if (error) throw new Error("could not verify role");
  const roles = (Array.isArray(data) ? data : []) as string[];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden: staff role required");
  }
}

interface FirecrawlSearchResult {
  url?: string;
  title?: string;
  description?: string;
  metadata?: { ogImage?: string; "og:image"?: string };
}

// Image hosts/domains we don't want to pull from (stock, generic, etc.)
const BLOCKED_HOSTS = [
  "gravatar.com",
  "lookaside.facebook.com", // requires login redirect
  "scontent", // facebook CDN — requires auth params, often expires
  "lookaside.fbsbx.com",
  "twimg.com/profile_images",
  "pbs.twimg.com",
];

// Domains that typically host candidate photos we trust.
const PREFERRED_HOSTS = [
  "parlament.mt",
  "gov.mt",
  "wikipedia.org",
  "wikimedia.org",
  "timesofmalta.com",
  "independent.com.mt",
  "maltatoday.com.mt",
  "lovinmalta.com",
  "newsbook.com.mt",
  "tvm.com.mt",
  "one.com.mt",
  "net.com.mt",
  "pn.org.mt",
  "partitlaburista.org",
];

function isLikelyImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (BLOCKED_HOSTS.some((h) => u.hostname.includes(h))) return false;
    return /\.(jpe?g|png|webp)(\?|$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

function preferenceScore(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const idx = PREFERRED_HOSTS.findIndex((h) => host.includes(h));
    return idx === -1 ? 100 : idx;
  } catch {
    return 999;
  }
}

async function firecrawlSearch(query: string): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  const resp = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 10,
      sources: ["web", "images"],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Firecrawl search failed ${resp.status}: ${t.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    data?: {
      web?: FirecrawlSearchResult[];
      images?: FirecrawlSearchResult[];
    } | FirecrawlSearchResult[];
  };
  const data = json.data;
  if (Array.isArray(data)) return data;
  const images = data?.images ?? [];
  const web = data?.web ?? [];
  return [...images, ...web];
}

async function verifyImageUrl(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!resp.ok) return false;
    const ct = resp.headers.get("content-type") ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

interface CandidateContext {
  full_name: string;
  party_name: string | null;
}

async function findPhotoForCandidate(c: CandidateContext): Promise<string | null> {
  const partySuffix = c.party_name ? ` ${c.party_name}` : "";
  const queries = [
    `${c.full_name}${partySuffix} Malta MP photo`,
    `${c.full_name} Malta candidate portrait`,
    `${c.full_name} parlament.mt`,
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const q of queries) {
    let results: FirecrawlSearchResult[] = [];
    try {
      results = await firecrawlSearch(q);
    } catch (err) {
      console.warn("firecrawl search error", q, err);
      continue;
    }
    for (const r of results) {
      // Image source has direct url; web source may have an ogImage in metadata.
      const candidatesUrls = [
        r.url,
        r.metadata?.ogImage,
        r.metadata?.["og:image"],
      ].filter((x): x is string => typeof x === "string" && x.length > 0);
      for (const u of candidatesUrls) {
        if (seen.has(u)) continue;
        seen.add(u);
        if (isLikelyImageUrl(u)) candidates.push(u);
      }
    }
    if (candidates.length >= 5) break;
  }

  candidates.sort((a, b) => preferenceScore(a) - preferenceScore(b));

  for (const url of candidates.slice(0, 8)) {
    if (await verifyImageUrl(url)) return url;
  }
  return null;
}

const SingleInput = z.object({ candidate_id: z.string().uuid() });

// Find a photo for one candidate and persist it.
export const findPhotoForCandidateById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SingleInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const { data: row, error } = await supabaseAdmin
        .from("candidates")
        .select("id, full_name, photo_url, party:parties(name_en)")
        .eq("id", data.candidate_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Candidate not found");

      const partyName = (row.party as { name_en?: string } | null)?.name_en ?? null;
      const url = await findPhotoForCandidate({
        full_name: row.full_name,
        party_name: partyName,
      });

      if (!url) {
        return { ok: true as const, found: false, photo_url: null };
      }

      const { error: upErr } = await supabaseAdmin
        .from("candidates")
        .update({ photo_url: url })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);

      await writeAudit(supabaseAdmin, {
        entityType: "candidates",
        entityId: row.id,
        action: "auto_photo_found",
        actorId: userId,
        actorEmail: email,
        metadata: { photo_url: url },
      });

      return { ok: true as const, found: true, photo_url: url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("findPhotoForCandidateById failed:", message);
      return { ok: false as const, error: message };
    }
  });

const BulkInput = z.object({
  limit: z.number().int().min(1).max(25).default(10),
});

// Bulk: find photos for candidates that don't currently have one.
export const findMissingCandidatePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BulkInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const { data: rows, error } = await supabaseAdmin
        .from("candidates")
        .select("id, full_name, photo_url, party:parties(name_en)")
        .or("photo_url.is.null,photo_url.eq.")
        .order("is_incumbent", { ascending: false })
        .order("full_name")
        .limit(data.limit);
      if (error) throw new Error(error.message);

      const results: Array<{
        id: string;
        full_name: string;
        ok: boolean;
        photo_url?: string | null;
        error?: string;
      }> = [];

      for (const row of rows ?? []) {
        try {
          const partyName =
            (row.party as { name_en?: string } | null)?.name_en ?? null;
          const url = await findPhotoForCandidate({
            full_name: row.full_name,
            party_name: partyName,
          });
          if (url) {
            const { error: upErr } = await supabaseAdmin
              .from("candidates")
              .update({ photo_url: url })
              .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
          }
          results.push({
            id: row.id,
            full_name: row.full_name,
            ok: true,
            photo_url: url,
          });
        } catch (err) {
          results.push({
            id: row.id,
            full_name: row.full_name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await writeAudit(supabaseAdmin, {
        entityType: "candidates",
        entityId: null,
        action: "auto_photo_bulk",
        actorId: userId,
        actorEmail: email,
        metadata: {
          processed: results.length,
          found: results.filter((r) => r.ok && r.photo_url).length,
          missing: results.filter((r) => r.ok && !r.photo_url).length,
          failed: results.filter((r) => !r.ok).length,
        },
      });

      return {
        ok: true as const,
        processed: results.length,
        results,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("findMissingCandidatePhotos failed:", message);
      return { ok: false as const, error: message };
    }
  });
