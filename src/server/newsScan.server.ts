// Server-only news scan implementation.
// Discovers recent articles from configured news sources, extracts content with
// Firecrawl, classifies with Lovable AI, and writes findings for staff review.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./auditLog.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Per-source / total caps for a single scan run.
const PER_SOURCE_LIMIT = 5;
const TOTAL_LIMIT = 20;
const ARTICLE_CONTENT_LIMIT = 6000;
// Skip articles older than this when we can detect the published date.
const MAX_ARTICLE_AGE_DAYS = 21;
// Election-focused search query used to bias discovery toward relevant, recent
// coverage instead of pulling whatever the sitemap returns first.
const SEARCH_QUERY =
  'Malta 2026 election OR candidate OR proposal OR PN OR PL OR ADPD OR "general election"';

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

// Discover recent, election-relevant URLs for a source.
// Uses Firecrawl `search` (Google-backed) restricted to the source's domain
// and to the past week. This biases results toward fresh coverage instead of
// pulling whatever the sitemap returns first (which often surfaces old
// articles that have already been reviewed or dismissed).
async function discoverUrls(source: SourceRow): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const domain = (() => {
    try {
      return new URL(source.base_url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const query = domain ? `site:${domain} ${SEARCH_QUERY}` : SEARCH_QUERY;

  const res = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 25,
      tbs: "qdr:w", // past week
      lang: "en",
      country: "mt",
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl search ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    data?: { web?: Array<{ url?: string }> } | Array<{ url?: string }>;
    web?: Array<{ url?: string }>;
  };
  const list: Array<{ url?: string }> = Array.isArray(data.data)
    ? data.data
    : (data.data?.web ?? data.web ?? []);
  const urls = list
    .map((r) => r.url)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    // Belt-and-braces domain filter in case search leaks results from other sites.
    .filter((u) => (domain ? u.includes(domain) : true));
  return urls;
}

function isWithinFreshness(published: string | undefined): boolean {
  if (!published) return true; // unknown date — let the AI decide
  const t = Date.parse(published);
  if (Number.isNaN(t)) return true;
  const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
  return ageDays <= MAX_ARTICLE_AGE_DAYS;
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

export async function scrapeArticle(url: string): Promise<{ markdown: string; title?: string; published?: string } | null> {
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

interface SingleUrlOptions {
  url: string;
  sourceId?: string | null;
  triggeredBy?: string | null;
  triggeredByEmail?: string | null;
  force?: boolean; // re-scan even if URL was seen before
}

interface SingleUrlResult {
  ok: true;
  findingId: string | null;
  articleId: string;
  status: "classified" | "skipped_old" | "scrape_failed" | "classify_failed" | "duplicate";
  kind?: AIFinding["kind"];
  confidence?: number;
  belowThreshold?: boolean;
  reused?: boolean;
}

// Resolve which configured news source this URL belongs to (by hostname match
// against base_url). Falls back to an explicit sourceId, then to any enabled
// source, since news_findings.source_id is NOT NULL.
async function resolveSourceForUrl(url: string, explicitId?: string | null): Promise<SourceRow | null> {
  if (explicitId) {
    const { data } = await supabaseAdmin.from("news_sources").select("*").eq("id", explicitId).maybeSingle();
    if (data) return data as SourceRow;
  }
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  const { data: all } = await supabaseAdmin.from("news_sources").select("*");
  const list = (all ?? []) as SourceRow[];
  const byHost = list.find((s) => {
    try { return new URL(s.base_url).hostname.replace(/^www\./, "") === host; } catch { return false; }
  });
  if (byHost) return byHost;
  return list.find((s) => (s as unknown as { enabled: boolean }).enabled) ?? list[0] ?? null;
}

export async function scanSingleUrl(opts: SingleUrlOptions): Promise<SingleUrlResult> {
  const url = opts.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http(s)://");

  const source = await resolveSourceForUrl(url, opts.sourceId ?? null);
  if (!source) throw new Error("No news source configured — add one first");

  // Look up existing article row for this URL
  const { data: existing } = await supabaseAdmin
    .from("news_articles")
    .select("id, scan_status")
    .eq("url", url)
    .maybeSingle();

  let articleId: string;
  if (existing && !opts.force) {
    // Reuse: if a finding already exists, return it; otherwise re-classify.
    articleId = existing.id;
    const { data: existingFinding } = await supabaseAdmin
      .from("news_findings")
      .select("id, kind, confidence")
      .eq("article_id", articleId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingFinding) {
      return {
        ok: true,
        findingId: existingFinding.id,
        articleId,
        status: "duplicate",
        kind: existingFinding.kind as AIFinding["kind"],
        confidence: Number(existingFinding.confidence),
        reused: true,
      };
    }
  } else if (existing && opts.force) {
    articleId = existing.id;
    await supabaseAdmin.from("news_articles").update({ scan_status: "fetching" }).eq("id", articleId);
  } else {
    const { data: art, error: artErr } = await supabaseAdmin
      .from("news_articles")
      .insert({ source_id: source.id, url, scan_status: "fetching" })
      .select("id")
      .single();
    if (artErr || !art) throw new Error(`failed to record article: ${artErr?.message}`);
    articleId = art.id;
  }

  const scraped = await scrapeArticle(url);
  if (!scraped) {
    await supabaseAdmin.from("news_articles").update({ scan_status: "scrape_failed" }).eq("id", articleId);
    return { ok: true, findingId: null, articleId, status: "scrape_failed" };
  }

  // Manual paste bypasses the freshness gate — staff explicitly chose this URL.
  const finding = await classifyArticle(url, scraped.title, scraped.markdown);
  if (!finding) {
    await supabaseAdmin
      .from("news_articles")
      .update({
        scan_status: "classify_failed",
        title: scraped.title ?? null,
        published_at: scraped.published ?? null,
      })
      .eq("id", articleId);
    return { ok: true, findingId: null, articleId, status: "classify_failed" };
  }

  await supabaseAdmin
    .from("news_articles")
    .update({
      scan_status: "classified",
      title: scraped.title ?? finding.title ?? null,
      published_at: scraped.published ?? null,
    })
    .eq("id", articleId);

  // For manual pastes we always create a finding (even low-confidence /
  // not_relevant) so the staff member sees what the AI thought of their URL.
  const { data: inserted, error: findErr } = await supabaseAdmin
    .from("news_findings")
    .insert({
      article_id: articleId,
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
        manual_paste: "true",
      } as never,
    })
    .select("id")
    .single();
  if (findErr || !inserted) throw new Error(`failed to create finding: ${findErr?.message}`);

  await writeAudit(supabaseAdmin, {
    entityType: "news_finding",
    entityId: inserted.id,
    action: "manual_url_scanned",
    actorId: opts.triggeredBy ?? null,
    actorEmail: opts.triggeredByEmail ?? null,
    metadata: { url, kind: finding.kind, confidence: finding.confidence, source: source.slug },
  });

  return {
    ok: true,
    findingId: inserted.id,
    articleId,
    status: "classified",
    kind: finding.kind,
    confidence: finding.confidence,
    belowThreshold: finding.kind === "not_relevant" || finding.confidence < 0.45,
  };
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

        // Skip articles that are clearly too old to be relevant. We still
        // keep the row so we never re-scrape this URL on a future run.
        if (!isWithinFreshness(scraped.published)) {
          await supabaseAdmin
            .from("news_articles")
            .update({
              scan_status: "skipped_old",
              title: scraped.title ?? null,
              published_at: scraped.published ?? null,
            })
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
