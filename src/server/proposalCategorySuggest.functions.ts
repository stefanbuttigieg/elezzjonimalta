// AI server function: suggests proposal categories from existing taxonomy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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

const Input = z.object({
  title_en: z.string().nullable().optional(),
  title_mt: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_mt: z.string().nullable().optional(),
  max: z.number().int().min(1).max(5).default(3),
});

export const suggestProposalCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase } = context;
      await assertStaff(supabase as never);

      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      const { data: cats, error } = await supabaseAdmin
        .from("proposal_categories")
        .select("id, name_en, name_mt, description_en")
        .order("sort_order")
        .order("name_en");
      if (error) throw new Error(error.message);
      const categories = cats ?? [];
      if (categories.length === 0) {
        return { ok: true as const, suggestions: [] };
      }

      const proposalText = [
        data.title_en,
        data.title_mt,
        data.description_en,
        data.description_mt,
      ]
        .filter((s) => s && s.trim())
        .join("\n\n");

      if (!proposalText.trim()) {
        return { ok: true as const, suggestions: [] };
      }

      const taxonomy = categories.map((c) => ({
        id: c.id,
        name: c.name_en,
        description: c.description_en ?? "",
      }));

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
              content: `You categorise Maltese political proposals. Pick 1 to ${data.max} categories from the provided taxonomy that BEST match the proposal. Only return categories from the list — never invent new ones. Order by relevance (most relevant first). If nothing fits well, return an empty array.`,
            },
            {
              role: "user",
              content: JSON.stringify({ proposal: proposalText, taxonomy }),
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_categories",
                description: "Return chosen category IDs ordered by relevance.",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      maxItems: data.max,
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          confidence: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                          },
                          reason: { type: "string" },
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
          tool_choice: {
            type: "function",
            function: { name: "return_categories" },
          },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429)
          throw new Error("Rate limited by AI gateway, please retry shortly");
        if (resp.status === 402)
          throw new Error(
            "AI credits exhausted — top up Lovable AI in workspace settings"
          );
        const t = await resp.text();
        throw new Error(`AI gateway error ${resp.status}: ${t.slice(0, 200)}`);
      }

      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ function?: { arguments?: string } }>;
          };
        }>;
      };
      const args =
        json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return { ok: true as const, suggestions: [] };

      const parsed = JSON.parse(args) as {
        suggestions?: Array<{
          id: string;
          confidence: "high" | "medium" | "low";
          reason?: string;
        }>;
      };

      const validIds = new Set(categories.map((c) => c.id));
      const filtered = (parsed.suggestions ?? [])
        .filter((s) => validIds.has(s.id))
        .slice(0, data.max)
        .map((s) => {
          const cat = categories.find((c) => c.id === s.id)!;
          return {
            id: s.id,
            name_en: cat.name_en,
            name_mt: cat.name_mt,
            confidence: s.confidence,
            reason: s.reason ?? "",
          };
        });

      return { ok: true as const, suggestions: filtered };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("suggestProposalCategories failed:", message);
      return { ok: false as const, error: message };
    }
  });
