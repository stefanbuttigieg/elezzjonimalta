// Authenticated server functions for the News monitor admin page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runNewsScan } from "./newsScan.server";
import { writeAudit } from "./auditLog.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertStaff(supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : any, userId: string) {
  const { data, error } = await supabase.rpc("get_my_roles");
  if (error) throw new Error("could not verify role");
  const roles = (data ?? []) as string[];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden: staff role required");
  }
  return { roles, userId };
}

const ScanInput = z.object({
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
});

export const triggerNewsScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertStaff(supabase, userId);
    const email = (claims as { email?: string }).email ?? null;
    const result = await runNewsScan({
      trigger: "manual",
      sourceIds: data.sourceIds,
      triggeredBy: userId,
      triggeredByEmail: email,
    });
    return result;
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
    await assertStaff(supabase, userId);
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
    await assertStaff(supabase, userId);
    if (data.findingIds.length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("news_findings")
      .update({ alert_seen_at: new Date().toISOString() })
      .in("id", data.findingIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ReprocessInput = z.object({ findingId: z.string().uuid() });
export const reprocessFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReprocessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertStaff(supabase, userId);
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
