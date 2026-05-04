// Bulk AI categorisation of proposals.
// For each selected proposal, asks the AI to suggest categories, then MERGES
// suggestions of the requested confidence into proposal_category_assignments
// without removing existing assignments.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const Confidence = z.enum(["high", "medium", "low"]);

const Input = z.object({
  proposal_ids: z.array(z.string().uuid()).min(1).max(50),
  min_confidence: z.array(Confidence).default(["high", "medium"]),
  max_per_proposal: z.number().int().min(1).max(5).default(3),
});

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

interface Suggestion {
  id: string;
  confidence: "high" | "medium" | "low";
}

async function suggestForProposal(
  apiKey: string,
  proposalText: string,
  taxonomy: Array<{ id: string; name: string; description: string }>,
  max: number,
): Promise<Suggestion[]> {
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You categorise Maltese political proposals. Pick 1 to ${max} categories from the provided taxonomy that BEST match the proposal. Only return categories from the list — never invent new ones. Order by relevance. If nothing fits well, return an empty array.`,
        },
        { role: "user", content: JSON.stringify({ proposal: proposalText, taxonomy }) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_categories",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  maxItems: max,
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["id", "confidence"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_categories" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited");
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
  if (!args) return [];
  const parsed = JSON.parse(args) as { suggestions?: Suggestion[] };
  return parsed.suggestions ?? [];
}

export const bulkCategoriseProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase } = context;
      await assertStaff(supabase as never);
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      const minSet = new Set(data.min_confidence);

      const [{ data: proposals, error: pErr }, { data: cats, error: cErr }, { data: existing, error: eErr }] =
        await Promise.all([
          supabaseAdmin
            .from("proposals")
            .select("id, title_en, title_mt, description_en, description_mt")
            .in("id", data.proposal_ids),
          supabaseAdmin
            .from("proposal_categories")
            .select("id, name_en, description_en")
            .order("sort_order")
            .order("name_en"),
          supabaseAdmin
            .from("proposal_category_assignments")
            .select("proposal_id, category_id")
            .in("proposal_id", data.proposal_ids),
        ]);
      if (pErr) throw new Error(pErr.message);
      if (cErr) throw new Error(cErr.message);
      if (eErr) throw new Error(eErr.message);

      const taxonomy = (cats ?? []).map((c) => ({
        id: c.id,
        name: c.name_en,
        description: c.description_en ?? "",
      }));
      if (taxonomy.length === 0) throw new Error("No categories defined");

      const existingByProposal = new Map<string, Set<string>>();
      for (const e of (existing ?? []) as Array<{ proposal_id: string; category_id: string }>) {
        const s = existingByProposal.get(e.proposal_id) ?? new Set<string>();
        s.add(e.category_id);
        existingByProposal.set(e.proposal_id, s);
      }
      const validCats = new Set(taxonomy.map((t) => t.id));

      let processed = 0;
      let added = 0;
      let skipped = 0;
      const errors: string[] = [];
      const newAssignments: Array<{ proposal_id: string; category_id: string; sort_order: number }> = [];

      for (const p of (proposals ?? []) as Array<{
        id: string;
        title_en: string | null;
        title_mt: string | null;
        description_en: string | null;
        description_mt: string | null;
      }>) {
        const text = [p.title_en, p.title_mt, p.description_en, p.description_mt]
          .filter((s) => s && s.trim())
          .join("\n\n");
        if (!text.trim()) {
          skipped++;
          continue;
        }
        try {
          const suggestions = await suggestForProposal(apiKey, text, taxonomy, data.max_per_proposal);
          const existingSet = existingByProposal.get(p.id) ?? new Set<string>();
          let order = existingSet.size;
          for (const s of suggestions) {
            if (!minSet.has(s.confidence)) continue;
            if (!validCats.has(s.id)) continue;
            if (existingSet.has(s.id)) continue;
            newAssignments.push({ proposal_id: p.id, category_id: s.id, sort_order: order++ });
            existingSet.add(s.id);
            added++;
          }
          processed++;
        } catch (err) {
          errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (newAssignments.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("proposal_category_assignments")
          .insert(newAssignments);
        if (insErr) throw new Error(`insert failed: ${insErr.message}`);
      }

      return { ok: true as const, processed, added, skipped, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("bulkCategoriseProposals failed:", message);
      return { ok: false as const, error: message };
    }
  });
