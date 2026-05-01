// Authenticated server functions for the News monitor admin page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runNewsScan, scanSingleUrl, scrapeArticle } from "./newsScan.server";
import { writeAudit } from "./auditLog.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function assertStaff(supabase: { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }) {
  const { data, error } = await supabase.rpc("get_my_roles");
  if (error) throw new Error("could not verify role");
  const roles = (Array.isArray(data) ? data : []) as string[];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden: staff role required");
  }
  return roles;
}

const ScanInput = z.object({
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
});

export const triggerNewsScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;
      const result = await runNewsScan({
        trigger: "manual",
        sourceIds: data.sourceIds,
        triggeredBy: userId,
        triggeredByEmail: email,
      });
      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("triggerNewsScan failed:", message);
      return { ok: false as const, error: message };
    }
  });

const ScanUrlInput = z.object({
  url: z.string().trim().url().max(2000),
  sourceId: z.string().uuid().nullable().optional(),
  force: z.boolean().optional(),
});

export const scanUrlNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;
      const result = await scanSingleUrl({
        url: data.url,
        sourceId: data.sourceId ?? null,
        force: data.force ?? false,
        triggeredBy: userId,
        triggeredByEmail: email,
      });
      return { ...result, ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("scanUrlNow failed:", message);
      return { ok: false as const, error: message };
    }
  });

const FindingActionInput = z.object({
  findingId: z.string().uuid(),
  action: z.enum(["dismiss", "mark_reviewed", "reopen"]),
  note: z.string().max(500).optional(),
});

export const updateFindingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FindingActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertStaff(supabase as never);
    const email = (claims as { email?: string }).email ?? null;

    const { data: before } = await supabaseAdmin
      .from("news_findings")
      .select("status")
      .eq("id", data.findingId)
      .single();

    const newStatus =
      data.action === "dismiss" ? "dismissed" : data.action === "mark_reviewed" ? "reviewed" : "pending";

    const { error } = await supabaseAdmin
      .from("news_findings")
      .update({
        status: newStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.findingId);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      entityType: "news_finding",
      entityId: data.findingId,
      action: data.action,
      actorId: userId,
      actorEmail: email,
      note: data.note ?? null,
      before: before ?? null,
      after: { status: newStatus },
    });

    return { ok: true, status: newStatus };
  });

const AckInput = z.object({ findingIds: z.array(z.string().uuid()).max(200) });
export const ackFindingAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AckInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase as never);
    if (data.findingIds.length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("news_findings")
      .update({ alert_seen_at: new Date().toISOString() })
      .in("id", data.findingIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ConvertInput = z.object({
  findingId: z.string().uuid(),
  target: z.enum(["new_candidate", "update_candidate", "new_proposal", "new_party"]),
  payload: z.record(z.string(), z.unknown()),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export const convertFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConvertInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const { data: finding, error: fErr } = await supabaseAdmin
        .from("news_findings")
        .select("id, article_id, articles:news_articles!inner(url)")
        .eq("id", data.findingId)
        .single();
      if (fErr || !finding) throw new Error("finding not found");
      const sourceUrl = (finding as { articles?: { url?: string } }).articles?.url ?? null;

      const p = data.payload as Record<string, string | undefined>;
      let createdEntity: { type: string; id: string } | null = null;

      if (data.target === "new_candidate") {
        if (!p.full_name) throw new Error("full_name required");
        const slug = p.slug || slugify(p.full_name) + "-" + Math.random().toString(36).slice(2, 6);
        const { data: row, error } = await supabaseAdmin
          .from("candidates")
          .insert({
            full_name: p.full_name,
            slug,
            party_id: p.party_id || null,
            primary_district_id: p.primary_district_id || null,
            bio_en: p.bio_en || null,
            source_url: sourceUrl,
            status: "pending_review",
            imported_from: "news_monitor",
            notes: p.notes || null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        createdEntity = { type: "candidate", id: row.id };
      } else if (data.target === "update_candidate") {
        if (!p.candidate_id) throw new Error("candidate_id required");
        const { error } = await supabaseAdmin
          .from("candidates")
          .update({
            bio_en: p.bio_en || undefined,
            party_id: p.party_id || undefined,
            primary_district_id: p.primary_district_id || undefined,
            notes: p.notes || undefined,
            source_url: sourceUrl || undefined,
          })
          .eq("id", p.candidate_id);
        if (error) throw new Error(error.message);
        createdEntity = { type: "candidate", id: p.candidate_id };
      } else if (data.target === "new_proposal") {
        // Support either a single proposal (legacy fields on payload) or
        // a batch via payload.proposals = [{ title_en, description_en, ... }].
        type ProposalRow = {
          title_en?: string;
          description_en?: string;
          category?: string;
          party_id?: string;
          candidate_id?: string;
        };
        const batch: ProposalRow[] = Array.isArray(
          (data.payload as { proposals?: unknown }).proposals
        )
          ? ((data.payload as { proposals: ProposalRow[] }).proposals)
          : [
              {
                title_en: p.title_en,
                description_en: p.description_en,
                category: p.category,
                party_id: p.party_id,
                candidate_id: p.candidate_id,
              },
            ];

        const valid = batch.filter((r) => r.title_en && r.title_en.trim().length > 0);
        if (valid.length === 0) throw new Error("at least one proposal title is required");

        const rows = valid.map((r) => ({
          title_en: r.title_en!.trim(),
          description_en: r.description_en?.trim() || null,
          category: r.category?.trim() || null,
          party_id: r.party_id || null,
          candidate_id: r.candidate_id || null,
          source_url: sourceUrl,
          status: "pending_review" as const,
        }));

        const { data: inserted, error } = await supabaseAdmin
          .from("proposals")
          .insert(rows)
          .select("id");
        if (error) throw new Error(error.message);
        const ids = (inserted ?? []).map((r) => r.id);
        // Link the finding to the first proposal; report all created IDs.
        createdEntity = { type: "proposal", id: ids[0] };
        (createdEntity as { ids?: string[] }).ids = ids;
      } else if (data.target === "new_party") {
        if (!p.name_en) throw new Error("name_en required");
        const slug = p.slug || slugify(p.name_en);
        const { data: row, error } = await supabaseAdmin
          .from("parties")
          .insert({
            name_en: p.name_en,
            slug,
            short_name: p.short_name || null,
            color: p.color || null,
            website: p.website || null,
            description_en: p.description_en || null,
            source_url: sourceUrl,
            status: "draft",
            imported_from: "news_monitor",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        createdEntity = { type: "party", id: row.id };
      }

      // Mark finding reviewed and link if applicable
      await supabaseAdmin
        .from("news_findings")
        .update({
          status: "reviewed",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          candidate_id: createdEntity?.type === "candidate" ? createdEntity.id : undefined,
          proposal_id: createdEntity?.type === "proposal" ? createdEntity.id : undefined,
        })
        .eq("id", data.findingId);

      await writeAudit(supabaseAdmin, {
        entityType: createdEntity?.type ?? "news_finding",
        entityId: createdEntity?.id ?? data.findingId,
        action: `convert_${data.target}`,
        actorId: userId,
        actorEmail: email,
        metadata: { findingId: data.findingId, payload: data.payload },
      });

      return { ok: true as const, entity: createdEntity };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("convertFinding failed:", message);
      return { ok: false as const, error: message };
    }
  });

const ReprocessInput = z.object({ findingId: z.string().uuid() });
export const reprocessFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReprocessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertStaff(supabase as never);
    const email = (claims as { email?: string }).email ?? null;

    const { data: finding } = await supabaseAdmin
      .from("news_findings")
      .select("id, article_id, articles:news_articles!inner(url)")
      .eq("id", data.findingId)
      .single();
    if (!finding) throw new Error("finding not found");

    await writeAudit(supabaseAdmin, {
      entityType: "news_finding",
      entityId: data.findingId,
      action: "reprocess_requested",
      actorId: userId,
      actorEmail: email,
    });

    // Reset status so the next scan picks it up; staff can also re-run manually.
    await supabaseAdmin
      .from("news_findings")
      .update({ status: "pending", alert_seen_at: null })
      .eq("id", data.findingId);

  });

// ───────────────────────────────────────────────────────────────────────────
// Auto-fill: ask the AI to suggest values for the Convert-to-action form.
// Re-fetches the article markdown, sends it (plus the AI's earlier extracted
// hints and short lookup tables for parties/districts/candidates) to Gemini,
// and asks for a strict JSON payload. We never auto-write — the staff member
// reviews and edits the values before pressing Create.
// ───────────────────────────────────────────────────────────────────────────

const AutofillInput = z.object({
  findingId: z.string().uuid(),
  target: z.enum(["new_candidate", "update_candidate", "new_proposal", "new_party"]),
});

interface AutofillSuggestion {
  suggested_target?: "new_candidate" | "update_candidate" | "new_proposal" | "new_party";
  reasoning?: string;
  fields: Record<string, string>;
}

const AUTOFILL_PROMPT = `You are a strictly neutral assistant helping Maltese election-monitor staff
turn a news article into a structured database record. Be factual, never opinionated.
Never invent names, parties, districts, dates, or quotes that are not in the article.
If a field is not stated in the article, return an empty string for it.

You will receive:
- the target entity type the staff picked (new_candidate / update_candidate / new_proposal / new_party)
- the article (URL, title, markdown content)
- earlier AI hints extracted at scan time
- short lookup tables of EXISTING parties, districts, candidates so you can match IDs

Return ONLY valid JSON with this exact shape:
{
  "suggested_target": "<one of: new_candidate | update_candidate | new_proposal | new_party>",
  "reasoning": "<one short sentence explaining the choice>",
  "fields": { "<key>": "<value>", ... }
}

Field keys per target (use empty string when unknown — do NOT omit the key):
- new_candidate: full_name, party_id (UUID from lookup or ""), primary_district_id (UUID from lookup or ""), bio_en, notes
- update_candidate: candidate_id (UUID from lookup, REQUIRED if you can match), party_id, primary_district_id, bio_en, notes
- new_proposal: title_en, description_en, category, party_id, candidate_id
- new_party: name_en, short_name, color, website, description_en

Rules:
- For *_id fields, ONLY use a UUID that appears verbatim in the lookup tables. Otherwise return "".
- Match by exact or near-exact name (case-insensitive, ignoring punctuation/accents). Don't guess.
- Keep description_en / bio_en / notes to 1-3 short factual sentences in English.
- "category" should be a single short phrase (e.g. "Health", "Transport", "Energy").
- "color" must be a #RRGGBB hex if mentioned, otherwise "".`;

export const autofillFindingForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AutofillInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase } = context;
      await assertStaff(supabase as never);

      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      // Load the finding + its article URL + the earlier AI hints.
      const { data: finding, error: fErr } = await supabaseAdmin
        .from("news_findings")
        .select(
          "id, kind, title, summary_en, summary_mt, extracted, articles:news_articles!inner(url, title)"
        )
        .eq("id", data.findingId)
        .single();
      if (fErr || !finding) throw new Error("finding not found");
      const articleUrl = (finding as { articles?: { url?: string } }).articles?.url ?? null;
      const articleTitle = (finding as { articles?: { title?: string } }).articles?.title ?? null;
      if (!articleUrl) throw new Error("article URL missing");

      // Re-fetch the article body for the model (truncate to keep prompt small).
      const scraped = await scrapeArticle(articleUrl);
      const articleBody = (scraped?.markdown ?? "").slice(0, 4500);

      // Lookup tables — keep small. Names + UUIDs only.
      const [partiesRes, districtsRes, candidatesRes] = await Promise.all([
        supabaseAdmin.from("parties").select("id, name_en, short_name").limit(50),
        supabaseAdmin.from("districts").select("id, number, name_en").order("number").limit(20),
        supabaseAdmin.from("candidates").select("id, full_name").order("full_name").limit(400),
      ]);

      const lookups = {
        parties: (partiesRes.data ?? []).map((p) => ({
          id: p.id,
          name: p.name_en,
          short: p.short_name,
        })),
        districts: (districtsRes.data ?? []).map((d) => ({
          id: d.id,
          label: `${d.number} · ${d.name_en}`,
        })),
        candidates: (candidatesRes.data ?? []).map((c) => ({
          id: c.id,
          name: c.full_name,
        })),
      };

      const userMessage = [
        `TARGET: ${data.target}`,
        `ARTICLE_URL: ${articleUrl}`,
        `ARTICLE_TITLE: ${scraped?.title ?? articleTitle ?? finding.title ?? ""}`,
        `EARLIER_AI_KIND: ${finding.kind}`,
        `EARLIER_AI_TITLE: ${finding.title ?? ""}`,
        `EARLIER_AI_SUMMARY_EN: ${finding.summary_en ?? ""}`,
        `EARLIER_AI_HINTS: ${JSON.stringify(finding.extracted ?? {})}`,
        ``,
        `LOOKUPS (use UUIDs verbatim or return ""):`,
        JSON.stringify(lookups),
        ``,
        `ARTICLE_CONTENT:`,
        articleBody || "(article content could not be re-fetched — work from the AI hints above)",
      ].join("\n");

      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: AUTOFILL_PROMPT },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content ?? "";
      let parsed: AutofillSuggestion;
      try {
        parsed = JSON.parse(raw) as AutofillSuggestion;
      } catch {
        throw new Error("AI returned invalid JSON");
      }
      if (!parsed.fields || typeof parsed.fields !== "object") {
        parsed = { ...parsed, fields: {} };
      }

      // Defensive: validate UUID-shaped values against the lookup tables to
      // strip any AI hallucinations before they hit the form.
      const validIds = new Set<string>([
        ...lookups.parties.map((p) => p.id),
        ...lookups.districts.map((d) => d.id),
        ...lookups.candidates.map((c) => c.id),
      ]);
      const cleanedFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.fields)) {
        const value = typeof v === "string" ? v : "";
        if (k.endsWith("_id") && value && !validIds.has(value)) {
          cleanedFields[k] = "";
        } else {
          cleanedFields[k] = value;
        }
      }

      return {
        ok: true as const,
        suggestedTarget: parsed.suggested_target ?? null,
        reasoning: parsed.reasoning ?? "",
        fields: cleanedFields,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("autofillFindingForm failed:", message);
      return { ok: false as const, error: message };
    }
  });
