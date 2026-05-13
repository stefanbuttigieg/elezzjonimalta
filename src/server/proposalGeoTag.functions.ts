// AI-assisted geo tagging for proposals.
//
// Each proposal is tagged with:
//   - `geo_scope`     : 'national' | 'regional' | 'local'
//   - `localities`    : canonical names from the districts.localities_* registry
//   - `district_ids`  : derived from those localities
//
// Used both manually (admin "Re-tag" button, bulk action) and automatically
// at the end of a manifesto import apply step.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deriveDistrictIds,
  getLocalityRegistry,
  matchLocalities,
  type LocalityRegistryEntry,
} from "@/lib/localityRegistry.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

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

interface ProposalTextRow {
  id: string;
  title_en: string | null;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
}

interface AiResult {
  scope: "national" | "regional" | "local";
  localities: string[];
}

async function callAi(
  apiKey: string,
  proposal: ProposalTextRow,
  registry: LocalityRegistryEntry[],
): Promise<AiResult> {
  const allowed = registry.map((e) => e.canonical);
  const text = [
    proposal.title_en,
    proposal.title_mt,
    proposal.description_en,
    proposal.description_mt,
  ]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n\n");

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You geo-tag Maltese political proposals.
Pick the geographic SCOPE:
  - "national" : applies to all of Malta (no specific town named).
  - "regional" : applies to a specific area/region or several localities, but not the whole country.
  - "local"    : explicitly mentions one or a few specific localities.
Then list any LOCALITIES the proposal explicitly targets.
ONLY use locality names from the provided allowed list — never invent names.
If no specific locality is mentioned, return [] for localities and "national".`,
        },
        {
          role: "user",
          content: JSON.stringify({ proposal: text, allowed_localities: allowed }),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_geo",
            parameters: {
              type: "object",
              properties: {
                scope: { type: "string", enum: ["national", "regional", "local"] },
                localities: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["scope", "localities"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_geo" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("AI rate limit exceeded");
    if (resp.status === 402) throw new Error("AI credits exhausted");
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 160)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{
      message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
    }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { scope: "national", localities: [] };
  const parsed = JSON.parse(args) as Partial<AiResult>;
  return {
    scope: (parsed.scope as AiResult["scope"]) ?? "national",
    localities: Array.isArray(parsed.localities) ? parsed.localities : [],
  };
}

/** Core helper: tag one proposal. Used by single + bulk + auto paths. */
export async function tagOneProposalCore(
  apiKey: string,
  proposalId: string,
  registry?: LocalityRegistryEntry[],
): Promise<{
  geo_scope: "national" | "regional" | "local";
  localities: string[];
  district_ids: string[];
}> {
  const reg = registry ?? (await getLocalityRegistry());
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("id, title_en, title_mt, description_en, description_mt")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`proposal ${proposalId} not found`);

  const ai = await callAi(apiKey, data as ProposalTextRow, reg);
  const matches = matchLocalities(reg, ai.localities);
  // Reconcile scope with actual matched localities so we never end up with
  // scope="local" but no localities (or vice versa).
  let scope: "national" | "regional" | "local" = ai.scope;
  if (matches.length === 0 && scope !== "national") scope = "national";
  if (matches.length === 1 && scope === "national") scope = "local";

  const localities = matches.map((m) => m.canonical);
  const district_ids = deriveDistrictIds(matches);

  const { error: uErr } = await supabaseAdmin
    .from("proposals")
    .update({
      geo_scope: scope,
      localities,
      district_ids,
      geo_tagged_at: new Date().toISOString(),
      geo_tagged_by: "ai",
    } as never)
    .eq("id", proposalId);
  if (uErr) throw uErr;

  return { geo_scope: scope, localities, district_ids };
}

// ---------- Server functions ----------

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
    z
      .object({
        proposal_ids: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertStaff(context.supabase as never);
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
      const reg = await getLocalityRegistry();
      let processed = 0;
      const errors: string[] = [];
      for (const id of data.proposal_ids) {
        try {
          await tagOneProposalCore(apiKey, id, reg);
          processed++;
        } catch (err) {
          errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Light throttle to avoid hammering the gateway.
        await new Promise((r) => setTimeout(r, 120));
      }
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
      const reg = await getLocalityRegistry();
      let processed = 0;
      const errors: string[] = [];
      for (const id of ids) {
        try {
          await tagOneProposalCore(apiKey, id, reg);
          processed++;
        } catch (err) {
          errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
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
