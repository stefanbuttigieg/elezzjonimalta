// AI-assisted geo tagging for proposals (server-fn shell). The heavy lifting
// lives in `proposalGeoTag.server.ts` so this file stays a thin RPC surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deriveDistrictIds,
  getLocalityRegistry,
  matchLocalities,
} from "@/lib/localityRegistry.server";
import {
  tagOneProposalCore,
  tagProposalsBatch,
} from "@/server/proposalGeoTag.server";

const Scope = z.enum(["national", "regional", "local"]);

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

export const tagProposalGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ proposal_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertStaff(context.supabase as never);
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
      const result = await tagOneProposalCore(apiKey, data.proposal_id);
      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("tagProposalGeo failed:", message);
      return { ok: false as const, error: message };
    }
  });

export const setProposalGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        proposal_id: z.string().uuid(),
        scope: Scope,
        localities: z.array(z.string().min(1).max(120)).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertStaff(context.supabase as never);
      const reg = await getLocalityRegistry();
      const matches = matchLocalities(reg, data.localities);
      const localities = matches.map((m) => m.canonical);
      let scope = data.scope;
      if (matches.length === 0 && scope !== "national") scope = "national";
      const district_ids = deriveDistrictIds(matches);

      const { error } = await supabaseAdmin
        .from("proposals")
        .update({
          geo_scope: scope,
          localities,
          district_ids,
          geo_tagged_at: new Date().toISOString(),
          geo_tagged_by: "human",
        } as never)
        .eq("id", data.proposal_id);
      if (error) throw error;
      return { ok: true as const, scope, localities, district_ids };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

export const bulkTagProposalsGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ proposal_ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertStaff(context.supabase as never);
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
      const { processed, errors } = await tagProposalsBatch(apiKey, data.proposal_ids);
      return { ok: true as const, processed, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

export const tagUntaggedProposalsGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertStaff(context.supabase as never);
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
      const { data: rows, error } = await supabaseAdmin
        .from("proposals")
        .select("id")
        .is("geo_tagged_at", null)
        .is("merged_into_id", null)
        .limit(data.limit);
      if (error) throw error;
      const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
      const { processed, errors } = await tagProposalsBatch(apiKey, ids);
      return { ok: true as const, total: ids.length, processed, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

export const listLocalityRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase as never);
    const reg = await getLocalityRegistry();
    return reg.map((e) => ({
      canonical: e.canonical,
      districtId: e.districtId,
      districtNumber: e.districtNumber,
      districtNameEn: e.districtNameEn,
    }));
  });
