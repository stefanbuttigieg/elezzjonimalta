// Classify candidate_positions free-text title/body into a structured position_kind + portfolio
// using the Lovable AI Gateway.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const POSITION_KINDS = [
  "prime_minister",
  "deputy_pm",
  "minister",
  "parliamentary_secretary",
  "cabinet_member",
  "opposition_leader",
  "shadow_minister",
  "speaker",
  "deputy_speaker",
  "whip",
  "committee_chair",
  "committee_member",
  "mep",
  "other",
] as const;

const Input = z.object({
  candidateId: z.string().uuid().optional(),
  positionIds: z.array(z.string().uuid()).optional(),
  onlyOther: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(50),
});

interface ClassifyResult {
  kind: (typeof POSITION_KINDS)[number];
  portfolio: string | null;
}

async function classifyOne(title: string, body: string | null): Promise<ClassifyResult | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const prompt = [
    "Classify this Maltese parliamentary / cabinet position.",
    "",
    `Title: ${title}`,
    body ? `Notes: ${body}` : "",
    "",
    `Respond with JSON: {"kind": one of [${POSITION_KINDS.join(", ")}], "portfolio": string or null}.`,
    "Use 'minister' for cabinet ministers (extract portfolio like 'Health', 'Foreign Affairs').",
    "Use 'parliamentary_secretary' for parl-secs (extract their portfolio).",
    "Use 'mep' only for Members of European Parliament.",
    "Use 'other' if not clearly any of the listed kinds.",
  ].join("\n");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as { kind?: string; portfolio?: string | null };
    const kind = POSITION_KINDS.find((k) => k === parsed.kind) ?? "other";
    const portfolio =
      typeof parsed.portfolio === "string" && parsed.portfolio.trim() ? parsed.portfolio.trim() : null;
    return { kind, portfolio };
  } catch {
    return null;
  }
}

export const classifyCandidatePositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }) => {
    let query = supabaseAdmin
      .from("candidate_positions")
      .select("id, title, body, position_kind, portfolio");

    if (data.candidateId) query = query.eq("candidate_id", data.candidateId);
    if (data.positionIds?.length) query = query.in("id", data.positionIds);
    if (data.onlyOther) query = query.eq("position_kind", "other");

    const { data: rows, error } = await query.limit(data.limit);
    if (error) return { ok: false, error: error.message, total: 0, updated: 0 } as const;

    let updated = 0;
    const total = rows?.length ?? 0;

    for (const row of rows ?? []) {
      try {
        const result = await classifyOne(row.title, row.body ?? null);
        if (!result) continue;
        const { error: upErr } = await supabaseAdmin
          .from("candidate_positions")
          .update({
            position_kind: result.kind,
            portfolio: result.portfolio ?? row.portfolio ?? null,
          })
          .eq("id", row.id);
        if (!upErr) updated += 1;
      } catch (e) {
        console.error("classify position error", row.id, e);
      }
    }

    return { ok: true as const, total, updated };
  });
