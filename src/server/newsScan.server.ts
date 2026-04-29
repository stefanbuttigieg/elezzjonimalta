// Server-only news scan implementation.
// Discovers recent articles from configured news sources, extracts content with
// Firecrawl, classifies with Lovable AI, and writes findings for staff review.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./auditLog.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const PER_SOURCE_LIMIT = 3;
const TOTAL_LIMIT = 10;
const ARTICLE_CONTENT_LIMIT = 6000;

type Trigger = "cron" | "manual";

interface ScanOptions {
  trigger: Trigger;
  sourceIds?: string[];
  triggeredBy?: string | null;
  triggeredByEmail?: string | null;
}

interface ScanResult {
  runId: string;
  articlesDiscovered: number;
  articlesScanned: number;
  findingsCreated: number;
  errors: string[];
}

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  sitemap_url: string | null;
}

interface AIFinding {
  kind: "proposal" | "new_candidate" | "election_development" | "not_relevant";
  confidence: number;
  title?: string;
  summary_en?: string;
  summary_mt?: string;
  candidate_name?: string;
  party_hint?: string;
  district_hint?: string;
  proposal_category?: string;
}

const SYSTEM_PROMPT = `You are a strictly neutral, non-partisan election news classifier for Malta's 30 May 2026 General Election.
Your job: read a news article and extract factual, election-relevant signals. NEVER express opinions, endorsements, or rankings.

Classify the article as ONE of:
- "proposal": a candidate or party announces a concrete policy proposal or commitment
- "new_candidate": a person is announced/confirmed as a candidate (or withdraws)
- "election_development": other electoral news (district changes, debates, campaign events, electoral commission updates)
- "not_relevant": not about the 2026 Malta general election

Return ONLY valid JSON with this exact shape:
{
  "kind": "proposal" | "new_candidate" | "election_development" | "not_relevant",
  "confidence": 0.0-1.0,
  "title": "short factual headline",
  "summary_en": "2-3 sentence neutral factual summary in English",
  "summary_mt": "2-3 sentence neutral factual summary in Maltese, or empty",
  "candidate_name": "full name if applicable, else empty",
  "party_hint": "party name/abbreviation if mentioned, else empty",
  "district_hint": "district number or name if mentioned, else empty",
  "proposal_category": "short category if proposal, else empty"
}`;

async function discoverUrls(source: SourceRow): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const res = await fetch(`${FIRECRAWL_BASE}/map`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: source.base_url,
      limit: 200,
      includeSubdomains: false,
      sitemap: "include",
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl map ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { links?: Array<string | { url: string }> };
  const urls = (data.links ?? [])
    .map((l) => (typeof l === "string" ? l : l.url))
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"));
  return urls;
}

function looksLikeArticle(url: string): boolean {
  const lowered = url.toLowerCase();
  if (
    lowered.includes("/tag/") ||
    lowered.includes("/category/") ||
    lowered.includes("/author/") ||
    lowered.includes("/page/") ||
    lowered.endsWith(".xml") ||
    lowered.endsWith(".jpg") ||
    lowered.endsWith(".png")
  ) return false;
  // Heuristic: article URLs usually have a slug segment of >= 3 words
  return /\/[a-z0-9-]{12,}/.test(lowered);
}

async function scrapeArticle(url: string): Promise<{ markdown: string; title?: string; published?: string } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY!;
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { markdown?: string; metadata?: { title?: string; publishedTime?: string } };
    markdown?: string;
    metadata?: { title?: string; publishedTime?: string };
  };
  const markdown = json.data?.markdown ?? json.markdown;
  const meta = json.data?.metadata ?? json.metadata;
  if (!markdown) return null;
  return {
    markdown: markdown.slice(0, ARTICLE_CONTENT_LIMIT),
    title: meta?.title,
    published: meta?.publishedTime,
  };
}

async function classifyArticle(url: string, title: string | undefined, content: string): Promise<AIFinding | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `URL: ${url}\nTitle: ${title ?? ""}\n\nArticle content:\n${content}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AIFinding;
    if (!parsed.kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function runNewsScan(opts: ScanOptions): Promise<ScanResult> {
  const errors: string[] = [];
  let articlesDiscovered = 0;
  let articlesScanned = 0;
  let findingsCreated = 0;

  const { data: run, error: runErr } = await supabaseAdmin
    .from("news_scan_runs")
    .insert({
      trigger: opts.trigger,
      triggered_by: opts.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(`failed to create run: ${runErr?.message}`);
  const runId = run.id;

  let sourcesQuery = supabaseAdmin.from("news_sources").select("*").eq("enabled", true);
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    sourcesQuery = sourcesQuery.in("id", opts.sourceIds);
  }
  const { data: sources, error: srcErr } = await sourcesQuery;
  if (srcErr || !sources) throw new Error(`failed to load sources: ${srcErr?.message}`);

  let totalScanned = 0;

  for (const source of sources) {
    if (totalScanned >= TOTAL_LIMIT) break;
    try {
      const urls = await discoverUrls(source as SourceRow);
      const candidateUrls = urls.filter(looksLikeArticle).slice(0, 80);
      articlesDiscovered += candidateUrls.length;

      // Filter out URLs we already have
      const { data: existing } = await supabaseAdmin
        .from("news_articles")
        .select("url")
        .in("url", candidateUrls);
      const seen = new Set((existing ?? []).map((r) => r.url));
      const fresh = candidateUrls.filter((u) => !seen.has(u)).slice(0, PER_SOURCE_LIMIT);

      for (const url of fresh) {
        if (totalScanned >= TOTAL_LIMIT) break;
        totalScanned += 1;
        articlesScanned += 1;

        const { data: art, error: artErr } = await supabaseAdmin
          .from("news_articles")
          .insert({
            source_id: source.id,
            url,
            scan_status: "fetching",
          })
          .select("id")
          .single();
        if (artErr || !art) {
          errors.push(`insert article ${url}: ${artErr?.message}`);
          continue;
        }

        const scraped = await scrapeArticle(url);
        if (!scraped) {
          await supabaseAdmin
            .from("news_articles")
            .update({ scan_status: "scrape_failed" })
            .eq("id", art.id);
          continue;
        }

        const finding = await classifyArticle(url, scraped.title, scraped.markdown);
        if (!finding) {
          await supabaseAdmin
            .from("news_articles")
            .update({
              scan_status: "classify_failed",
              title: scraped.title ?? null,
              published_at: scraped.published ?? null,
            })
            .eq("id", art.id);
          continue;
        }

        await supabaseAdmin
          .from("news_articles")
          .update({
            scan_status: "classified",
            title: scraped.title ?? finding.title ?? null,
            published_at: scraped.published ?? null,
          })
          .eq("id", art.id);

        if (finding.kind !== "not_relevant" && finding.confidence >= 0.45) {
          const { data: inserted } = await supabaseAdmin
            .from("news_findings")
            .insert({
              article_id: art.id,
              source_id: source.id,
              kind: finding.kind,
              confidence: Math.max(0, Math.min(1, finding.confidence)),
              title: finding.title ?? scraped.title ?? null,
              summary_en: finding.summary_en ?? null,
              summary_mt: finding.summary_mt ?? null,
              extracted: {
                candidate_name: finding.candidate_name ?? "",
                party_hint: finding.party_hint ?? "",
                district_hint: finding.district_hint ?? "",
                proposal_category: finding.proposal_category ?? "",
                source_url: url,
              } as never,
            })
            .select("id")
            .single();
          findingsCreated += 1;
          if (inserted) {
            await writeAudit(supabaseAdmin, {
              entityType: "news_finding",
              entityId: inserted.id,
              action: "detected",
              actorId: opts.triggeredBy ?? null,
              actorEmail: opts.triggeredByEmail ?? null,
              metadata: { source: source.slug, kind: finding.kind, confidence: finding.confidence, url },
            });
          }
        }
      }

      await supabaseAdmin
        .from("news_sources")
        .update({ last_scanned_at: new Date().toISOString() })
        .eq("id", source.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${source.slug}: ${msg}`);
    }
  }

  await supabaseAdmin
    .from("news_scan_runs")
    .update({
      finished_at: new Date().toISOString(),
      articles_discovered: articlesDiscovered,
      articles_scanned: articlesScanned,
      findings_created: findingsCreated,
      error: errors.length ? errors.join(" | ").slice(0, 2000) : null,
    })
    .eq("id", runId);

  await writeAudit(supabaseAdmin, {
    entityType: "news_scan_run",
    entityId: runId,
    action: opts.trigger === "cron" ? "cron_run" : "manual_run",
    actorId: opts.triggeredBy ?? null,
    actorEmail: opts.triggeredByEmail ?? null,
    metadata: { articlesScanned, findingsCreated, errorCount: errors.length },
  });

  return { runId, articlesDiscovered, articlesScanned, findingsCreated, errors };
}
