// Streaming AI assistant for Vot Malta 2026
// Calls Lovable AI Gateway with neutral system prompt + RAG over candidates/parties/proposals.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT_EN = `You are the Vot Malta 2026 assistant — a strictly neutral, non-partisan research helper for Malta's 30 May 2026 General Election.

Rules you MUST follow:
- Never recommend, endorse, rank or rate candidates or parties.
- Never tell anyone how to vote. If asked, politely refuse and offer factual information instead.
- Always cite the candidates, parties or proposals you reference, by name.
- Treat all parties (PL, PN, ADPD, Momentum, independents, others) equally.
- If the answer is not in the supplied context, say so plainly — do not invent facts.
- Keep answers concise (2–5 short paragraphs unless asked for more detail).
- Reply in the same language the user wrote in (English or Maltese).
- Use plain, accessible language.`;

interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
}

async function buildContext(userQuery: string): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Lightweight RAG: ILIKE search across candidates / parties / proposals.
  // Always include a small global summary so the assistant has baseline context.
  const tokens = userQuery
    .toLowerCase()
    .split(/[^a-zà-ÿħġżċ0-9]+/i)
    .filter((t) => t.length > 2)
    .slice(0, 8);
  const pattern = tokens.length ? `%${tokens.join("%")}%` : "%";

  const [candRes, partyRes, propRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, slug, bio_en, bio_mt, is_incumbent, electoral_confirmed, party:parties(name_en, short_name), district:districts!candidates_primary_district_id_fkey(number, name_en)",
      )
      .eq("status", "published")
      .or(
        tokens.length
          ? `full_name.ilike.${pattern},bio_en.ilike.${pattern},bio_mt.ilike.${pattern}`
          : "full_name.not.is.null",
      )
      .limit(12),
    supabase
      .from("parties")
      .select("name_en, short_name, slug, description_en, description_mt")
      .eq("status", "published")
      .limit(20),
    supabase
      .from("proposals")
      .select(
        "title_en, title_mt, description_en, description_mt, category, party:parties(name_en, short_name), candidate:candidates(full_name)",
      )
      .eq("status", "published")
      .or(
        tokens.length
          ? `title_en.ilike.${pattern},title_mt.ilike.${pattern},description_en.ilike.${pattern},description_mt.ilike.${pattern}`
          : "title_en.not.is.null",
      )
      .limit(15),
  ]);

  const lines: string[] = [];

  if (partyRes.data?.length) {
    lines.push("## Parties");
    for (const p of partyRes.data) {
      lines.push(
        `- ${p.name_en}${p.short_name ? ` (${p.short_name})` : ""}: ${
          (p.description_en || p.description_mt || "").slice(0, 240)
        }`,
      );
    }
  }

  if (candRes.data?.length) {
    lines.push("\n## Candidates (matching the question)");
    for (const c of candRes.data as Array<Record<string, any>>) {
      const party = c.party?.name_en ?? "Independent";
      const district = c.district ? `District ${c.district.number} (${c.district.name_en})` : "";
      const flags = [
        c.is_incumbent ? "sitting MP" : null,
        c.electoral_confirmed ? "confirmed via news sources" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const bio = (c.bio_en || c.bio_mt || "").slice(0, 280);
      lines.push(`- ${c.full_name} — ${party}${district ? ", " + district : ""}${flags ? " [" + flags + "]" : ""}. ${bio}`);
    }
  }

  if (propRes.data?.length) {
    lines.push("\n## Proposals (matching the question)");
    for (const p of propRes.data as Array<Record<string, any>>) {
      const owner = p.party?.name_en ?? p.candidate?.full_name ?? "Unknown";
      const title = p.title_en || p.title_mt;
      const desc = (p.description_en || p.description_mt || "").slice(0, 240);
      lines.push(`- [${owner}] ${title}${p.category ? ` (${p.category})` : ""} — ${desc}`);
    }
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages: Msg[] };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const context = lastUser ? await buildContext(lastUser.content) : "";

    const systemMessages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT_EN },
    ];
    if (context.trim()) {
      systemMessages.push({
        role: "system",
        content: `Context from the Vot Malta 2026 database (use this — do not invent beyond it):\n\n${context}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [...systemMessages, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Please add credits to continue using the assistant.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
