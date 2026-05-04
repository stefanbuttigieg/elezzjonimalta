// Auto-fill candidate fields from URLs, web search, and parliament.mt.
// SAFE-MERGE: only updates fields that are currently empty.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./auditLog.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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

const Input = z.object({
  candidate_id: z.string().uuid(),
  urls: z.array(z.string().url()).default([]),
  use_web_search: z.boolean().default(true),
  use_parliament_mt: z.boolean().default(true),
});

const BulkInput = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(20),
  use_web_search: z.boolean().default(true),
  use_parliament_mt: z.boolean().default(true),
});

interface SourceDoc {
  url: string;
  text: string;
}

async function firecrawlScrape(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      data?: { markdown?: string };
      markdown?: string;
    };
    return (json.data?.markdown ?? json.markdown ?? "").trim() || null;
  } catch {
    return null;
  }
}

async function firecrawlSearchUrls(query: string, limit = 5): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, sources: ["web"] }),
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as {
      data?: { web?: Array<{ url?: string }> } | Array<{ url?: string }>;
    };
    const data = json.data;
    const arr = Array.isArray(data) ? data : (data?.web ?? []);
    return arr.map((r) => r.url).filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

const PREFERRED_DOMAINS = [
  "parlament.mt",
  "gov.mt",
  "electoral.gov.mt",
  "pn.org.mt",
  "partitlaburista.org",
  "adpd.mt",
  "abba.com.mt",
  "wikipedia.org",
];

async function gatherSources(
  fullName: string,
  partyName: string | null,
  parliamentUrl: string | null,
  manualUrls: string[],
  useWeb: boolean,
  useParliament: boolean,
): Promise<SourceDoc[]> {
  const urls = new Set<string>();
  for (const u of manualUrls) urls.add(u);
  if (useParliament && parliamentUrl) urls.add(parliamentUrl);

  if (useWeb) {
    const partySuffix = partyName ? ` ${partyName}` : "";
    const queries = [
      `${fullName}${partySuffix} Malta candidate biography`,
      `${fullName} Malta MP profile site:parlament.mt OR site:wikipedia.org`,
    ];
    for (const q of queries) {
      const found = await firecrawlSearchUrls(q, 4);
      for (const u of found) urls.add(u);
      if (urls.size >= 8) break;
    }
  }

  // Prioritise preferred sources, then take first ~6
  const ordered = [...urls].sort((a, b) => {
    const score = (u: string) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        const idx = PREFERRED_DOMAINS.findIndex((d) => host.includes(d));
        return idx === -1 ? 99 : idx;
      } catch {
        return 100;
      }
    };
    return score(a) - score(b);
  });

  const docs: SourceDoc[] = [];
  for (const url of ordered.slice(0, 6)) {
    const text = await firecrawlScrape(url);
    if (text && text.length > 200) {
      docs.push({ url, text: text.slice(0, 8000) });
    }
    if (docs.length >= 4) break;
  }
  return docs;
}

interface ExtractedFields {
  bio_en?: string;
  bio_mt?: string;
  profession?: string;
  date_of_birth?: string; // YYYY-MM-DD
  birthplace?: string;
  education?: string;
  email?: string;
  phone?: string;
  website?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
  tiktok?: string;
  linkedin?: string;
  youtube?: string;
  parlament_mt_url?: string;
  leadership_role?: "leader" | "deputy_leader";
  is_incumbent?: boolean;
}

async function extractWithAI(
  fullName: string,
  partyName: string | null,
  docs: SourceDoc[],
): Promise<ExtractedFields | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const corpus = docs
    .map((d, i) => `## SOURCE ${i + 1} — ${d.url}\n\n${d.text}`)
    .join("\n\n---\n\n");

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract structured profile data about Maltese political candidates from web sources. " +
            "Return ONLY information clearly supported by the provided sources. " +
            "If a field is not stated or you are unsure, OMIT it (do not guess). " +
            "For bio_en/bio_mt write 2-4 neutral sentences in the requested language. " +
            "For social handles, return full URLs. For date_of_birth use YYYY-MM-DD only when explicit.",
        },
        {
          role: "user",
          content: `Candidate: ${fullName}${partyName ? ` (${partyName})` : ""}\n\n${corpus}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_profile",
            parameters: {
              type: "object",
              properties: {
                bio_en: { type: "string" },
                bio_mt: { type: "string" },
                profession: { type: "string" },
                date_of_birth: { type: "string" },
                birthplace: { type: "string" },
                education: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                website: { type: "string" },
                facebook: { type: "string" },
                twitter: { type: "string" },
                instagram: { type: "string" },
                tiktok: { type: "string" },
                linkedin: { type: "string" },
                youtube: { type: "string" },
                parlament_mt_url: { type: "string" },
                leadership_role: { type: "string", enum: ["leader", "deputy_leader"] },
                is_incumbent: { type: "boolean" },
              },
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_profile" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited by AI gateway");
    if (resp.status === 402) throw new Error("AI credits exhausted");
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 160)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  return JSON.parse(args) as ExtractedFields;
}

const FIELD_KEYS = [
  "bio_en",
  "bio_mt",
  "profession",
  "date_of_birth",
  "birthplace",
  "education",
  "email",
  "phone",
  "website",
  "facebook",
  "twitter",
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "parlament_mt_url",
  "leadership_role",
] as const;

type CandidateRow = Record<string, unknown> & { id: string; full_name: string };

function buildSafeMergePatch(
  current: CandidateRow,
  extracted: ExtractedFields,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    const cur = current[key];
    const next = extracted[key];
    if (next === undefined || next === null || (typeof next === "string" && !next.trim())) continue;
    if (cur && typeof cur === "string" && cur.trim()) continue; // already filled
    if (key === "date_of_birth" && typeof next === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) continue;
    }
    patch[key] = next;
  }
  // Booleans only when currently false AND we have explicit true.
  if (extracted.is_incumbent === true && current.is_incumbent === false) {
    // Don't auto-flip — too consequential. Keep manual.
  }
  return patch;
}

async function autofillOne(
  candidateId: string,
  urls: string[],
  useWeb: boolean,
  useParliament: boolean,
): Promise<{
  ok: true;
  updated_fields: string[];
  source_urls: string[];
} | { ok: false; error: string }> {
  const { data: row, error } = await supabaseAdmin
    .from("candidates")
    .select(
      "id, full_name, bio_en, bio_mt, profession, date_of_birth, birthplace, education, email, phone, website, facebook, twitter, instagram, tiktok, linkedin, youtube, parlament_mt_url, leadership_role, is_incumbent, source_url, party:parties(name_en)",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Candidate not found" };

  const partyName = (row.party as { name_en?: string } | null)?.name_en ?? null;
  const docs = await gatherSources(
    row.full_name,
    partyName,
    (row as { parlament_mt_url?: string | null }).parlament_mt_url ?? null,
    urls,
    useWeb,
    useParliament,
  );
  if (docs.length === 0) {
    return { ok: false, error: "No usable sources found" };
  }

  const extracted = await extractWithAI(row.full_name, partyName, docs);
  if (!extracted) return { ok: false, error: "AI returned no data" };

  const patch = buildSafeMergePatch(row as CandidateRow, extracted);
  const sourceUrls = docs.map((d) => d.url);

  // If source_url is empty, set the first preferred one.
  if (!(row as { source_url?: string | null }).source_url && sourceUrls.length > 0) {
    patch.source_url = sourceUrls[0];
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, updated_fields: [], source_urls: sourceUrls };
  }

  const { error: upErr } = await supabaseAdmin
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, updated_fields: Object.keys(patch), source_urls: sourceUrls };
}

export const autofillCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const result = await autofillOne(
        data.candidate_id,
        data.urls,
        data.use_web_search,
        data.use_parliament_mt,
      );

      await writeAudit(supabaseAdmin, {
        entityType: "candidates",
        entityId: data.candidate_id,
        action: "candidate_autofill",
        actorId: userId,
        actorEmail: email,
        metadata: {
          ok: result.ok,
          urls_provided: data.urls.length,
          use_web_search: data.use_web_search,
          ...(result.ok
            ? { updated_fields: result.updated_fields, source_urls: result.source_urls }
            : { error: result.error }),
        },
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("autofillCandidate failed:", message);
      return { ok: false as const, error: message };
    }
  });

export const bulkAutofillCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BulkInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const results: Array<{
        id: string;
        ok: boolean;
        updated_count?: number;
        error?: string;
      }> = [];

      for (const id of data.candidate_ids) {
        const r = await autofillOne(id, [], data.use_web_search, data.use_parliament_mt);
        if (r.ok) {
          results.push({ id, ok: true, updated_count: r.updated_fields.length });
        } else {
          results.push({ id, ok: false, error: r.error });
        }
      }

      await writeAudit(supabaseAdmin, {
        entityType: "candidates",
        entityId: null,
        action: "candidate_autofill_bulk",
        actorId: userId,
        actorEmail: email,
        metadata: {
          processed: results.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
        },
      });

      return { ok: true as const, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("bulkAutofillCandidates failed:", message);
      return { ok: false as const, error: message };
    }
  });
