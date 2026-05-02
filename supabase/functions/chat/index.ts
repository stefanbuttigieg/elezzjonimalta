// Streaming AI assistant for Vot Malta 2026
// - System prompt loaded from assistant_settings (editable in /admin/assistant)
// - Retrieval uses pgvector semantic search over knowledge_chunks
// - Falls back to ILIKE if the index is empty (e.g. before first reindex)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_SYSTEM_PROMPT = `You are the Vot Malta 2026 assistant — a strictly neutral, non-partisan research helper for Malta's 30 May 2026 General Election.

Rules you MUST follow:
- Never recommend, endorse, rank or rate candidates or parties.
- Never tell anyone how to vote. If asked, politely refuse and offer factual information instead.
- Always cite the candidates, parties or proposals you reference, by name.
- Treat all parties (PL, PN, ADPD, Momentum, independents, others) equally.
- The "AUTHORITATIVE FACTS" system message and the retrieved knowledge-base context are your ONLY source of truth. Do NOT use prior training knowledge for names of party leaders, deputy leaders, candidates, or who is contesting a district. If a fact is not present in those sources, say plainly that you do not have that information — do not guess and do not fall back to what you "remember".
- Never state that a list (e.g. district candidates) "has not yet been published" if such a list is present in the context. Use what is provided.
- Keep answers concise (2–5 short paragraphs unless asked for more detail).
- Reply in the same language the user wrote in (English or Maltese).
- Use plain, accessible language.`;

interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
}

const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";

interface Settings {
  system_prompt: string;
  model: string;
  max_context_chunks: number;
}

// Builds an authoritative "facts sheet" live from the database so the model
// can never get core facts (party leaders, deputy leaders, election date)
// wrong, even if FTS ranks an unrelated chunk higher.
async function buildAuthoritativeFacts(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const lines: string[] = [];
  lines.push("AUTHORITATIVE FACTS (these override anything in the retrieved context below):");
  lines.push("- Maltese General Election date: 30 May 2026.");

  const { data: parties } = await supabase
    .from("parties")
    .select("name_en, short_name, leader_name")
    .eq("status", "published")
    .order("name_en");

  // Map party -> deputy leader(s) from candidates.leadership_role
  const { data: leaderRows } = await supabase
    .from("candidates")
    .select("full_name, leadership_role, party:parties(name_en)")
    .not("leadership_role", "is", null);

  const deputyByParty = new Map<string, string[]>();
  const leaderByParty = new Map<string, string[]>();
  for (const row of (leaderRows ?? []) as Array<{
    full_name: string;
    leadership_role: string;
    party: { name_en?: string } | null;
  }>) {
    const pname = row.party?.name_en;
    if (!pname) continue;
    if (row.leadership_role === "deputy_leader") {
      const arr = deputyByParty.get(pname) ?? [];
      arr.push(row.full_name);
      deputyByParty.set(pname, arr);
    } else if (row.leadership_role === "leader") {
      const arr = leaderByParty.get(pname) ?? [];
      arr.push(row.full_name);
      leaderByParty.set(pname, arr);
    }
  }

  lines.push("- Party leaders (current, as of the 2026 election cycle):");
  for (const p of parties ?? []) {
    const short = p.short_name ? ` (${p.short_name})` : "";
    const deputies = deputyByParty.get(p.name_en);
    const dep = deputies && deputies.length ? `; deputy leader: ${deputies.join(", ")}` : "";
    lines.push(`  • ${p.name_en}${short}: leader is ${p.leader_name ?? "unknown"}${dep}.`);
  }
  lines.push(
    "- If a person appears in the retrieved context as a candidate of a party, that does NOT make them the party leader. Use this list for leadership questions.",
  );
  return lines.join("\n");
}

async function loadSettings(supabase: ReturnType<typeof createClient>): Promise<Settings> {
  const { data } = await supabase
    .from("assistant_settings")
    .select("system_prompt, model, max_context_chunks")
    .eq("singleton", true)
    .maybeSingle();
  return {
    system_prompt: data?.system_prompt ?? FALLBACK_SYSTEM_PROMPT,
    model: data?.model ?? "google/gemini-3-flash-preview",
    max_context_chunks: data?.max_context_chunks ?? 18,
  };
}

async function buildKeywordContext(
  supabase: ReturnType<typeof createClient>,
  query: string,
  settings: Settings,
): Promise<{ context: string; usedIndex: boolean }> {
  const { data: sources } = await supabase
    .from("assistant_sources")
    .select("key, enabled")
    .eq("enabled", true);
  const enabledKeys = (sources ?? []).map((s: { key: string }) => s.key);
  if (enabledKeys.length === 0) return { context: "", usedIndex: false };

  const { data: matches, error } = await supabase.rpc("search_knowledge_chunks", {
    query_text: query,
    match_count: settings.max_context_chunks,
    source_filter: enabledKeys,
  });
  if (error) {
    console.error("search_knowledge_chunks error", error);
    return { context: "", usedIndex: false };
  }

  const rows = (matches ?? []) as Array<{
    source_key: string;
    title: string | null;
    content: string;
    url: string | null;
    similarity: number;
  }>;
  if (rows.length === 0) return { context: "", usedIndex: true };

  const bySource = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = bySource.get(r.source_key) ?? [];
    arr.push(r);
    bySource.set(r.source_key, arr);
  }

  const lines: string[] = [];
  for (const [src, items] of bySource.entries()) {
    lines.push(`## ${src} (${items.length})`);
    for (const it of items) {
      const cite = it.url ? ` [${it.url}]` : "";
      lines.push(`- ${it.title ?? "(untitled)"}${cite}: ${it.content.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  }
  return { context: lines.join("\n"), usedIndex: true };
}

// Fallback ILIKE retrieval (only used if the index is empty)
async function buildFallbackContext(
  supabase: ReturnType<typeof createClient>,
  userQuery: string,
): Promise<string> {
  const tokens = userQuery
    .toLowerCase()
    .split(/[^a-zà-ÿħġżċ0-9]+/i)
    .filter((t) => t.length > 2)
    .slice(0, 6);
  const pattern = tokens.length ? `%${tokens.join("%")}%` : "%";

  const [partyRes, candRes, propRes] = await Promise.all([
    supabase.from("parties").select("name_en, short_name, description_en").eq("status", "published").limit(15),
    supabase
      .from("candidates")
      .select("full_name, bio_en, party:parties(name_en)")
      .eq("status", "published")
      .or(tokens.length ? `full_name.ilike.${pattern},bio_en.ilike.${pattern}` : "full_name.not.is.null")
      .limit(10),
    supabase
      .from("proposals")
      .select("title_en, description_en, party:parties(name_en)")
      .eq("status", "published")
      .or(tokens.length ? `title_en.ilike.${pattern},description_en.ilike.${pattern}` : "title_en.not.is.null")
      .limit(10),
  ]);

  const lines: string[] = [];
  for (const p of partyRes.data ?? []) {
    lines.push(`- Party: ${p.name_en}${p.short_name ? ` (${p.short_name})` : ""} — ${(p.description_en ?? "").slice(0, 240)}`);
  }
  for (const c of (candRes.data ?? []) as Array<Record<string, unknown>>) {
    const party = (c.party as { name_en?: string } | null)?.name_en ?? "Independent";
    lines.push(`- Candidate: ${c.full_name} (${party}) — ${String(c.bio_en ?? "").slice(0, 240)}`);
  }
  for (const p of (propRes.data ?? []) as Array<Record<string, unknown>>) {
    const owner = (p.party as { name_en?: string } | null)?.name_en ?? "Unknown";
    lines.push(`- Proposal [${owner}]: ${p.title_en} — ${String(p.description_en ?? "").slice(0, 240)}`);
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const settings = await loadSettings(supabase);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    let context = "";
    let retrievalNote = "";
    let intentBoost = "";
    if (lastUser) {
      const { context: kwCtx, usedIndex } = await buildKeywordContext(
        supabase,
        lastUser.content,
        settings,
      );
      if (kwCtx.trim()) {
        context = kwCtx;
        retrievalNote = "fts";
      } else {
        const fallback = await buildFallbackContext(supabase, lastUser.content);
        context = fallback;
        retrievalNote = usedIndex ? "fts-empty→fallback" : "no-index→fallback";
      }
      try {
        intentBoost = await buildIntentBoost(supabase, lastUser.content);
      } catch (e) {
        console.error("buildIntentBoost failed", e);
      }
    }

    const systemMessages: Msg[] = [{ role: "system", content: settings.system_prompt }];

    // Always inject live authoritative facts (party leaders, election date)
    try {
      const facts = await buildAuthoritativeFacts(supabase);
      systemMessages.push({ role: "system", content: facts });
    } catch (e) {
      console.error("buildAuthoritativeFacts failed", e);
    }

    if (intentBoost.trim()) {
      systemMessages.push({
        role: "system",
        content: `STRUCTURED DATA from the live database (this is the authoritative answer to the user's question — prefer it over anything else):\n\n${intentBoost}`,
      });
    }

    if (context.trim()) {
      systemMessages.push({
        role: "system",
        content: `Context from the Vot Malta 2026 knowledge base (use this — do not invent beyond it). Source URLs in [brackets] are internal site links you may reference.\n\n${context}`,
      });
    }
    console.log(`chat: retrieval=${retrievalNote} chars=${context.length} intentBoostChars=${intentBoost.length}`);

    const response = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
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
