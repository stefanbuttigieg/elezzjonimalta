// Auto-fill candidate fields from URLs, web search, and parliament.mt.
// SAFE-MERGE: only updates fields that are currently empty.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  "timesofmalta.com",
  "independent.com.mt",
  "maltatoday.com.mt",
  "lovinmalta.com",
  "newsbook.com.mt",
  "tvmnews.mt",
  "one.com.mt",
  "net.com.mt",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "x.com",
  "twitter.com",
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
      `${fullName}${partySuffix} Malta site:timesofmalta.com OR site:independent.com.mt OR site:maltatoday.com.mt`,
      `${fullName}${partySuffix} Malta site:facebook.com OR site:linkedin.com`,
      `${fullName}${partySuffix} Malta education profession career`,
      `${fullName}${partySuffix} Malta contact email phone`,
    ];
    for (const q of queries) {
      const found = await firecrawlSearchUrls(q, 5);
      for (const u of found) urls.add(u);
      if (urls.size >= 20) break;
    }
  }

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
  for (const url of ordered.slice(0, 12)) {
    const text = await firecrawlScrape(url);
    if (text && text.length > 200) {
      docs.push({ url, text: text.slice(0, 8000) });
    }
    if (docs.length >= 8) break;
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

function buildSuggestionDiffs(
  current: CandidateRow,
  extracted: ExtractedFields,
): Array<{ field_key: string; current_value: string | null; suggested_value: string }> {
  const out: Array<{ field_key: string; current_value: string | null; suggested_value: string }> = [];
  for (const key of FIELD_KEYS) {
    const next = extracted[key];
    if (next === undefined || next === null) continue;
    const nextStr = typeof next === "string" ? next.trim() : String(next);
    if (!nextStr) continue;
    if (key === "date_of_birth" && !/^\d{4}-\d{2}-\d{2}$/.test(nextStr)) continue;
    const cur = current[key];
    const curStr = cur == null ? "" : typeof cur === "string" ? cur.trim() : String(cur);
    if (curStr && curStr.toLowerCase() === nextStr.toLowerCase()) continue;
    out.push({ field_key: key, current_value: curStr || null, suggested_value: nextStr });
  }
  return out;
}

async function autofillOne(
  candidateId: string,
  urls: string[],
  useWeb: boolean,
  useParliament: boolean,
  actorId: string,
): Promise<{
  ok: true;
  suggestions_created: number;
  source_urls: string[];
  run_id: string;
} | { ok: false; error: string }> {
  const { data: run, error: runErr } = await supabaseAdmin
    .from("candidate_discovery_runs")
    .insert({
      candidate_id: candidateId,
      triggered_by: actorId,
      status: "running",
      ai_model: MODEL,
    } as never)
    .select("id")
    .single();
  if (runErr || !run) return { ok: false, error: runErr?.message ?? "Failed to start run" };
  const runId = (run as { id: string }).id;

  const finishRun = async (patch: Record<string, unknown>) => {
    await supabaseAdmin
      .from("candidate_discovery_runs")
      .update({ ...patch, finished_at: new Date().toISOString() } as never)
      .eq("id", runId);
  };

  const { data: row, error } = await supabaseAdmin
    .from("candidates")
    .select(
      "id, full_name, bio_en, bio_mt, profession, date_of_birth, birthplace, education, email, phone, website, facebook, twitter, instagram, tiktok, linkedin, youtube, parlament_mt_url, leadership_role, is_incumbent, source_url, party:parties(name_en)",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) {
    await finishRun({ status: "failed", error: error.message });
    return { ok: false, error: error.message };
  }
  if (!row) {
    await finishRun({ status: "failed", error: "Candidate not found" });
    return { ok: false, error: "Candidate not found" };
  }

  const partyName = (row.party as { name_en?: string } | null)?.name_en ?? null;
  const docs = await gatherSources(
    row.full_name,
    partyName,
    (row as { parlament_mt_url?: string | null }).parlament_mt_url ?? null,
    urls,
    useWeb,
    useParliament,
  );
  const sourceUrls = docs.map((d) => d.url);

  if (docs.length === 0) {
    await finishRun({ status: "failed", error: "No usable sources found", source_urls: sourceUrls });
    return { ok: false, error: "No usable sources found" };
  }

  let extracted: ExtractedFields | null = null;
  try {
    extracted = await extractWithAI(row.full_name, partyName, docs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun({ status: "failed", error: msg, source_urls: sourceUrls });
    return { ok: false, error: msg };
  }
  if (!extracted) {
    await finishRun({ status: "failed", error: "AI returned no data", source_urls: sourceUrls });
    return { ok: false, error: "AI returned no data" };
  }

  const diffs = buildSuggestionDiffs(row as CandidateRow, extracted);

  // Mark previous pending suggestions for same fields as superseded
  if (diffs.length > 0) {
    await supabaseAdmin
      .from("candidate_field_suggestions")
      .update({ status: "superseded" } as never)
      .eq("candidate_id", candidateId)
      .eq("status", "pending")
      .in(
        "field_key",
        diffs.map((d) => d.field_key),
      );

    const rows = diffs.map((d) => ({
      candidate_id: candidateId,
      field_key: d.field_key,
      current_value: d.current_value,
      suggested_value: d.suggested_value,
      source_urls: sourceUrls,
      ai_model: MODEL,
      status: "pending" as const,
      run_id: runId,
    }));
    const { error: insErr } = await supabaseAdmin
      .from("candidate_field_suggestions")
      .insert(rows as never);
    if (insErr) {
      await finishRun({ status: "failed", error: insErr.message, source_urls: sourceUrls });
      return { ok: false, error: insErr.message };
    }
  }

  await finishRun({
    status: "completed",
    source_urls: sourceUrls,
    suggestion_count: diffs.length,
  });

  return { ok: true, suggestions_created: diffs.length, source_urls: sourceUrls, run_id: runId };
}

export const autofillCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const result = await autofillOne(
        data.candidate_id,
        data.urls,
        data.use_web_search,
        data.use_parliament_mt,
        userId,
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
            ? { suggestions_created: result.suggestions_created, source_urls: result.source_urls, run_id: result.run_id }
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const results: Array<{
        id: string;
        ok: boolean;
        suggestions_created?: number;
        error?: string;
      }> = [];

      for (const id of data.candidate_ids) {
        const r = await autofillOne(id, [], data.use_web_search, data.use_parliament_mt, userId);
        if (r.ok) {
          results.push({ id, ok: true, suggestions_created: r.suggestions_created });
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
