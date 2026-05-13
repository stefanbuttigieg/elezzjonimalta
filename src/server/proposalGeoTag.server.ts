// Server-only core for proposal geo tagging. Kept separate from
// `proposalGeoTag.functions.ts` so the functions file stays a thin shell of
// `createServerFn` declarations (any plain export from a *.functions.ts file
// can leak its top-level imports — including supabaseAdmin — into client
// bundles, per the TanStack/Supabase import-graph rules).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deriveDistrictIds,
  getLocalityRegistry,
  matchLocalities,
  type LocalityRegistryEntry,
} from "@/lib/localityRegistry.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

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
                localities: { type: "array", items: { type: "string" } },
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

export async function tagProposalsBatch(
  apiKey: string,
  proposalIds: string[],
): Promise<{ processed: number; errors: string[] }> {
  const reg = await getLocalityRegistry();
  let processed = 0;
  const errors: string[] = [];
  for (const id of proposalIds) {
    try {
      await tagOneProposalCore(apiKey, id, reg);
      processed++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return { processed, errors };
}
