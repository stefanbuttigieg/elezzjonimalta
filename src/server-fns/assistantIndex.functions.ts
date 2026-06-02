import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mirror of ALL_SOURCE_KEYS from ./assistantIndex.server (kept here to avoid
// pulling a server-only module into the client bundle at module scope).
const ALL_SOURCE_KEYS = [
  "candidates",
  "parties",
  "proposals",
  "voting_faqs",
  "districts",
  "news_findings",
] as const;
type SourceKey = (typeof ALL_SOURCE_KEYS)[number];

const reindexSchema = z.object({
  sourceKeys: z.array(z.enum(ALL_SOURCE_KEYS)).optional(),
});

export const triggerReindex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => reindexSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { runReindex } = await import("@/server/assistantIndex.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    // Verify staff
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "editor");
    if (!isStaff) throw new Error("forbidden");
    try {
      const res = await runReindex({
        sourceKeys: data.sourceKeys as SourceKey[] | undefined,
        triggeredBy: userId,
        trigger: "manual",
      });
      return { ok: true as const, ...res };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reindex failed";
      return { ok: false as const, error: msg };
    }
  });
