import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/server/auditLog.server";

const APPLIABLE_FIELDS = new Set([
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
]);

const ReviewInput = z.object({
  suggestion_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => (r as { role: string }).role);
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden");
  }
}

export const reviewCandidateSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    await assertStaff(userId);
    const email = (claims as { email?: string }).email ?? null;

    const { data: sugg, error: getErr } = await supabaseAdmin
      .from("candidate_field_suggestions")
      .select("*")
      .eq("id", data.suggestion_id)
      .maybeSingle();
    if (getErr) return { ok: false as const, error: getErr.message };
    if (!sugg) return { ok: false as const, error: "Not found" };
    const s = sugg as {
      id: string;
      candidate_id: string;
      field_key: string;
      suggested_value: string;
      status: string;
    };
    if (s.status !== "pending") {
      return { ok: false as const, error: `Already ${s.status}` };
    }

    if (data.action === "approve") {
      if (!APPLIABLE_FIELDS.has(s.field_key)) {
        return { ok: false as const, error: `Field ${s.field_key} cannot be auto-applied` };
      }
      const patch: Record<string, unknown> = { [s.field_key]: s.suggested_value };
      const { error: upErr } = await supabaseAdmin
        .from("candidates")
        .update(patch as never)
        .eq("id", s.candidate_id);
      if (upErr) return { ok: false as const, error: upErr.message };
    }

    const { error: updErr } = await supabaseAdmin
      .from("candidate_field_suggestions")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      } as never)
      .eq("id", s.id);
    if (updErr) return { ok: false as const, error: updErr.message };

    await writeAudit(supabaseAdmin, {
      entityType: "candidates",
      entityId: s.candidate_id,
      action: `suggestion_${data.action}`,
      actorId: userId,
      actorEmail: email,
      metadata: { field_key: s.field_key, suggestion_id: s.id },
    });

    return { ok: true as const };
  });
