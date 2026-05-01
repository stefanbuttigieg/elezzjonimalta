// Authenticated server functions for the News monitor admin page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runNewsScan, scanSingleUrl } from "./newsScan.server";
import { writeAudit } from "./auditLog.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
      return { ok: true as const, ...result };
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
        if (!p.title_en) throw new Error("title_en required");
        const { data: row, error } = await supabaseAdmin
          .from("proposals")
          .insert({
            title_en: p.title_en,
            description_en: p.description_en || null,
            category: p.category || null,
            party_id: p.party_id || null,
            candidate_id: p.candidate_id || null,
            source_url: sourceUrl,
            status: "pending_review",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        createdEntity = { type: "proposal", id: row.id };
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

    return { ok: true };
  });
