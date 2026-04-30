import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/server/auditLog.server";

const InputSchema = z.object({ candidateId: z.string().uuid() });

export const syncCandidateFromParliament = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "FIRECRAWL_API_KEY not configured" };
    }

    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("candidates")
      .select("id, full_name, parliament_member_id, parlament_mt_url")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (candErr || !candidate) {
      return { ok: false as const, error: candErr?.message ?? "Candidate not found" };
    }

    const memberId = candidate.parliament_member_id;
    const memberUrl = memberId
      ? `https://www.parlament.mt/en/13th-leg/political-groups/?mid=${encodeURIComponent(memberId)}`
      : candidate.parlament_mt_url;
    if (!memberUrl) {
      return { ok: false as const, error: "No parliament_member_id or parlament_mt_url set" };
    }

    // Scrape the MP page via Firecrawl
    let markdown = "";
    let title: string | undefined;
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url: memberUrl,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (!res.ok) {
        return { ok: false as const, error: `Firecrawl error: ${res.status}` };
      }
      const json = (await res.json()) as {
        data?: { markdown?: string; metadata?: { title?: string } };
        markdown?: string;
        metadata?: { title?: string };
      };
      markdown = json.data?.markdown ?? json.markdown ?? "";
      title = json.data?.metadata?.title ?? json.metadata?.title;
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Scrape failed" };
    }

    // Heuristic extraction: look for "Committee", "Minister", "Parliamentary Secretary",
    // "Speaker", "Whip" lines. Each becomes a position in the current legislature.
    const positions: { title: string; body: string | null }[] = [];
    const lineRe = /^[\s\-*]*([A-Z][^\n]{4,120}(Committee|Minister|Parliamentary Secretary|Speaker|Deputy Speaker|Whip|Chairperson|Member))/gm;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(markdown)) !== null) {
      const text = m[1].trim().replace(/\s+/g, " ");
      if (text.length > 140) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      positions.push({ title: text, body: null });
      if (positions.length >= 20) break;
    }

    // Detect legislature number from URL (e.g. "/en/13th-leg/")
    const legMatch = memberUrl.match(/(\d{1,2})(?:st|nd|rd|th)-leg/i);
    const legislature = legMatch ? Number(legMatch[1]) : null;

    // Upsert positions
    let upserted = 0;
    for (const p of positions) {
      const { error } = await supabaseAdmin.from("candidate_positions").upsert(
        {
          candidate_id: candidate.id,
          legislature_number: legislature,
          title: p.title,
          body: p.body,
          is_current: true,
          source_url: memberUrl,
        },
        { onConflict: "id" },
      );
      if (!error) upserted++;
    }

    await supabaseAdmin
      .from("candidates")
      .update({ parliament_synced_at: new Date().toISOString() })
      .eq("id", candidate.id);

    await writeAudit(supabaseAdmin, {
      entityType: "candidate",
      entityId: candidate.id,
      action: "parliament_sync",
      note: title ?? null,
      metadata: { positions_added: upserted, legislature, url: memberUrl },
    });

    return {
      ok: true as const,
      legislature,
      positionsAdded: upserted,
      pageTitle: title ?? null,
    };
  });
