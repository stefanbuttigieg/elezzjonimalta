// Server functions to AI-translate proposal text between English and Maltese
// when the opposite-language fields are empty.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./auditLog.server";

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

interface TranslationFields {
  title_en?: string | null;
  title_mt?: string | null;
  description_en?: string | null;
  description_mt?: string | null;
}

interface TranslationOutput {
  title_en: string | null;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
}

async function aiTranslate(input: TranslationFields): Promise<TranslationOutput> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const needsTitleMt = !input.title_mt?.trim() && !!input.title_en?.trim();
  const needsTitleEn = !input.title_en?.trim() && !!input.title_mt?.trim();
  const needsDescMt = !input.description_mt?.trim() && !!input.description_en?.trim();
  const needsDescEn = !input.description_en?.trim() && !!input.description_mt?.trim();

  if (!needsTitleMt && !needsTitleEn && !needsDescMt && !needsDescEn) {
    return {
      title_en: input.title_en ?? null,
      title_mt: input.title_mt ?? null,
      description_en: input.description_en ?? null,
      description_mt: input.description_mt ?? null,
    };
  }

  const systemPrompt = `You are a professional Maltese-English translator specialising in political and policy text for Maltese elections.
Translate faithfully, preserve meaning, tone, numbers, names, and formatting. Do NOT add commentary or explanations.
Maltese should be natural, modern Standard Maltese (not transliteration). English should be clear UK English.
Only translate fields that are missing — leave existing fields untouched.`;

  const userPayload = {
    source: {
      title_en: input.title_en ?? null,
      title_mt: input.title_mt ?? null,
      description_en: input.description_en ?? null,
      description_mt: input.description_mt ?? null,
    },
    instructions: {
      fill_title_mt: needsTitleMt,
      fill_title_en: needsTitleEn,
      fill_description_mt: needsDescMt,
      fill_description_en: needsDescEn,
    },
  };

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_translations",
            description: "Return the proposal in both English and Maltese.",
            parameters: {
              type: "object",
              properties: {
                title_en: { type: "string" },
                title_mt: { type: "string" },
                description_en: { type: "string" },
                description_mt: { type: "string" },
              },
              required: ["title_en", "title_mt"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_translations" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited by AI gateway, please retry shortly");
    if (resp.status === 402)
      throw new Error("AI credits exhausted — top up Lovable AI in workspace settings");
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
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no translation");
  const parsed = JSON.parse(args) as Partial<TranslationOutput>;

  return {
    title_en: input.title_en?.trim()
      ? input.title_en
      : (parsed.title_en?.trim() ?? null),
    title_mt: input.title_mt?.trim()
      ? input.title_mt
      : (parsed.title_mt?.trim() ?? null),
    description_en: input.description_en?.trim()
      ? input.description_en
      : (parsed.description_en?.trim() ?? null),
    description_mt: input.description_mt?.trim()
      ? input.description_mt
      : (parsed.description_mt?.trim() ?? null),
  };
}

const PreviewInput = z.object({
  title_en: z.string().nullable().optional(),
  title_mt: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_mt: z.string().nullable().optional(),
});

// Translate the supplied draft fields without persisting — used inside the
// proposal editor drawer so the editor can review before saving.
export const translateProposalDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase } = context;
      await assertStaff(supabase as never);
      const result = await aiTranslate(data);
      return { ok: true as const, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("translateProposalDraft failed:", message);
      return { ok: false as const, error: message };
    }
  });

const BulkInput = z.object({
  limit: z.number().int().min(1).max(50).default(25),
});

// Find proposals with missing EN or MT text and fill them in via AI.
export const translateMissingProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BulkInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);
      const email = (claims as { email?: string }).email ?? null;

      // Pull candidates: any proposal where EN side or MT side is blank but
      // the opposite side has content. Restrict to non-merged rows.
      const { data: rows, error } = await supabaseAdmin
        .from("proposals")
        .select("id, title_en, title_mt, description_en, description_mt")
        .is("merged_into_id", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);

      const targets = (rows ?? []).filter((r) => {
        const enHas = !!(r.title_en?.trim() || r.description_en?.trim());
        const mtHas = !!(r.title_mt?.trim() || r.description_mt?.trim());
        const titleGap =
          (!!r.title_en?.trim() && !r.title_mt?.trim()) ||
          (!!r.title_mt?.trim() && !r.title_en?.trim());
        const descGap =
          (!!r.description_en?.trim() && !r.description_mt?.trim()) ||
          (!!r.description_mt?.trim() && !r.description_en?.trim());
        return (enHas || mtHas) && (titleGap || descGap);
      });

      const slice = targets.slice(0, data.limit);

      const results: Array<{
        id: string;
        ok: boolean;
        error?: string;
        filled?: string[];
      }> = [];

      for (const row of slice) {
        try {
          const out = await aiTranslate(row);
          const updates: {
            title_en?: string;
            title_mt?: string;
            description_en?: string;
            description_mt?: string;
          } = {};
          const filled: string[] = [];
          if (!row.title_en?.trim() && out.title_en) {
            updates.title_en = out.title_en;
            filled.push("title_en");
          }
          if (!row.title_mt?.trim() && out.title_mt) {
            updates.title_mt = out.title_mt;
            filled.push("title_mt");
          }
          if (!row.description_en?.trim() && out.description_en) {
            updates.description_en = out.description_en;
            filled.push("description_en");
          }
          if (!row.description_mt?.trim() && out.description_mt) {
            updates.description_mt = out.description_mt;
            filled.push("description_mt");
          }
          if (Object.keys(updates).length === 0) {
            results.push({ id: row.id, ok: true, filled: [] });
            continue;
          }
          const { error: upErr } = await supabaseAdmin
            .from("proposals")
            .update(updates)
            .eq("id", row.id);
          if (upErr) throw new Error(upErr.message);
          results.push({ id: row.id, ok: true, filled });
        } catch (err) {
          results.push({
            id: row.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await writeAudit(supabaseAdmin, {
        entityType: "proposals",
        entityId: null,
        action: "ai_translate_bulk",
        actorId: userId,
        actorEmail: email,
        metadata: {
          eligible: targets.length,
          processed: slice.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
        },
      });

      return {
        ok: true as const,
        eligible: targets.length,
        processed: slice.length,
        results,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("translateMissingProposals failed:", message);
      return { ok: false as const, error: message };
    }
  });
