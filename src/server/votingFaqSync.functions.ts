// Authenticated server functions for the voting FAQs admin page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAllFaqSources, syncFaqSource, FAQ_SOURCES } from "./votingFaqSync.server";
import { writeAudit } from "./auditLog.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertStaff(supabase: { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }) {
  const { data, error } = await supabase.rpc("get_my_roles");
  if (error) throw new Error("could not verify role");
  const roles = (Array.isArray(data) ? data : []) as string[];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden: staff role required");
  }
}

const SyncInput = z.object({
  sourceKey: z.enum(["intmalta", "pn_mt", "pn_en"]).optional(),
});

export const triggerFaqSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SyncInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      const results = data.sourceKey
        ? [await syncFaqSource(data.sourceKey, userId)]
        : await syncAllFaqSources(userId);

      await writeAudit(supabaseAdmin, {
        entityType: "voting_faqs",
        entityId: null,
        action: "sync",
        actorId: userId,
        actorEmail: email,
        metadata: { results, scope: data.sourceKey ?? "all" },
      });

      return { ok: true as const, results, sources: FAQ_SOURCES };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("triggerFaqSync failed:", message);
      return { ok: false as const, error: message };
    }
  });
