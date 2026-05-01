// Server-only: Sync voting FAQs from external sources via Firecrawl + Lovable AI.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type FaqSourceKey = "intmalta" | "pn_mt" | "pn_en";

interface FaqSourceConfig {
  key: FaqSourceKey;
  label: string;
  url: string;
  language: "mt" | "en";
  // If this source pairs with a sibling source (e.g. PN MT + EN), use it for translations
  pairWith?: FaqSourceKey;
}

export const FAQ_SOURCES: FaqSourceConfig[] = [
  {
    key: "intmalta",
    label: "intmalta.com",
    url: "https://intmalta.com/faq/",
    language: "mt",
  },
  {
    key: "pn_mt",
    label: "PN — Maltese",
    url: "https://pn.org.mt/faqs-elezzjoni-generali-fmalta/",
    language: "mt",
    pairWith: "pn_en",
  },
  {
    key: "pn_en",
    label: "PN — English",
    url: "https://pn.org.mt/en/faqs-general-election-in-malta/",
    language: "en",
    pairWith: "pn_mt",
  },
];

interface ExtractedFaq {
  question: string;
  answer: string;
}

interface BilingualFaq {
  question_en: string | null;
  answer_en: string | null;
  question_mt: string | null;
  answer_mt: string | null;
}

async function firecrawlScrape(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
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
  if (!res.ok) {
    throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data?: { markdown?: string };
    markdown?: string;
  };
  return json.data?.markdown ?? json.markdown ?? null;
}

async function callAi(systemPrompt: string, userContent: string): Promise<unknown> {
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Lovable AI ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("AI returned no content");
  return JSON.parse(raw);
}

const EXTRACT_PROMPT = `You extract FAQ entries from a webpage's markdown content.
Return ONLY valid JSON with this exact shape:
{ "faqs": [ { "question": "string", "answer": "string" } ] }

Rules:
- Each entry must be a real Q&A from the content (not navigation, headers, footers).
- Preserve the original language exactly. Do NOT translate.
- Keep answers concise but complete (strip markdown links, keep plain text).
- Skip generic site sections that aren't questions.
- If no FAQs found, return { "faqs": [] }.`;

async function extractFaqs(markdown: string): Promise<ExtractedFaq[]> {
  // Truncate to keep token usage reasonable
  const trimmed = markdown.slice(0, 18000);
  const result = (await callAi(EXTRACT_PROMPT, trimmed)) as { faqs?: ExtractedFaq[] };
  return Array.isArray(result.faqs) ? result.faqs.filter((f) => f.question && f.answer) : [];
}

// NOTE: Auto-translation during sync was removed. Maltese-only sources are stored
// with `question_en`/`answer_en` left null; staff translate them on demand from the
// admin UI via the `translateFaqToEnglish` server function below.

function hashItem(question: string): string {
  // Deterministic short hash based on normalized question text
  const norm = question.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = (h * 31 + norm.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36) + "-" + norm.length.toString(36);
}

export interface SyncResult {
  sourceKey: FaqSourceKey;
  found: number;
  added: number;
  updated: number;
  error?: string;
}

export async function syncFaqSource(
  sourceKey: FaqSourceKey,
  triggeredBy: string | null,
): Promise<SyncResult> {
  const config = FAQ_SOURCES.find((s) => s.key === sourceKey);
  if (!config) throw new Error(`unknown source: ${sourceKey}`);

  const { data: run } = await supabaseAdmin
    .from("voting_faq_sync_runs")
    .insert({ source_key: sourceKey, triggered_by: triggeredBy })
    .select("id")
    .single();
  const runId = run?.id;

  let found = 0;
  let added = 0;
  let updated = 0;
  let errorMsg: string | undefined;

  try {
    const markdown = await firecrawlScrape(config.url);
    if (!markdown) throw new Error("no markdown returned from scraper");

    const rawFaqs = await extractFaqs(markdown);
    found = rawFaqs.length;
    if (found === 0) throw new Error("no FAQ entries detected on page");

    // Build bilingual rows depending on source language
    let bilingual: BilingualFaq[];
    if (config.language === "en") {
      bilingual = rawFaqs.map((f) => ({
        question_en: f.question,
        answer_en: f.answer,
        question_mt: null,
        answer_mt: null,
      }));
    } else {
      // MT source — store MT only, leave EN null. Staff translate on demand.
      bilingual = rawFaqs.map((f) => ({
        question_en: null,
        answer_en: null,
        question_mt: f.question,
        answer_mt: f.answer,
      }));
    }

    // Upsert each row using (source_key, external_hash) as unique key.
    // Hash is keyed off whichever language is available so re-syncs match prior rows.
    for (let i = 0; i < bilingual.length; i++) {
      const row = bilingual[i];
      const hashSource = row.question_en ?? row.question_mt ?? "";
      const hash = hashItem(hashSource);

      const { data: existing } = await supabaseAdmin
        .from("voting_faqs")
        .select("id")
        .eq("source_key", sourceKey)
        .eq("external_hash", hash)
        .maybeSingle();

      if (existing) {
        const { error } = await supabaseAdmin
          .from("voting_faqs")
          .update({
            source_label: config.label,
            source_url: config.url,
            question_en: row.question_en,
            answer_en: row.answer_en,
            question_mt: row.question_mt,
            answer_mt: row.answer_mt,
            sort_order: i,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (!error) updated++;
      } else {
        const { error } = await supabaseAdmin.from("voting_faqs").insert({
          source_key: sourceKey,
          source_label: config.label,
          source_url: config.url,
          question_en: row.question_en,
          answer_en: row.answer_en,
          question_mt: row.question_mt,
          answer_mt: row.answer_mt,
          sort_order: i,
          external_hash: hash,
          last_synced_at: new Date().toISOString(),
          status: "published",
        });
        if (!error) added++;
      }
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[faq-sync] ${sourceKey} failed:`, errorMsg);
  }

  if (runId) {
    await supabaseAdmin
      .from("voting_faq_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        items_found: found,
        items_added: added,
        items_updated: updated,
        error: errorMsg ?? null,
      })
      .eq("id", runId);
  }

  return { sourceKey, found, added, updated, error: errorMsg };
}

export async function syncAllFaqSources(triggeredBy: string | null): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const src of FAQ_SOURCES) {
    results.push(await syncFaqSource(src.key, triggeredBy));
  }
  return results;
}
