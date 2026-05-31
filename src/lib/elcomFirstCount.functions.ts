import { createServerFn } from "@tanstack/react-start";

export type ElcomPartyRow = {
  name: string;
  votes: number | null;
  percent: number | null;
};

export type ElcomFirstCount = {
  generatedAt: string;
  votesCast: number | null;
  validVotes: number | null;
  invalidVotes: number | null;
  parties: ElcomPartyRow[];
  publishedAt: string | null; // e.g. "31st May, 2026"
  sourceUrl: string;
  ok: boolean;
  error?: string;
};

const SOURCE_URL = "https://electoral.gov.mt/Contents/Item/Display/81368";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { at: number; data: ElcomFirstCount };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = globalThis as any;
function getCache(): { entry: CacheEntry | null } {
  if (!globalAny.__elcomFirstCountCache) globalAny.__elcomFirstCountCache = { entry: null };
  return globalAny.__elcomFirstCountCache as { entry: CacheEntry | null };
}

function toInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toFloat(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[,\s%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const PARTY_NAMES = [
  "AD+PD",
  "Aħwa Maltin",
  "Imperium Europa",
  "Momentum",
  "Partit Laburista",
  "Partit Nazzjonalista",
  "Independent Candidates",
];

function parseMarkdown(md: string): ElcomFirstCount {
  const text = md.replace(/\r/g, "");

  const findNum = (label: RegExp): number | null => {
    const m = text.match(label);
    return m ? toInt(m[1]) : null;
  };

  const votesCast = findNum(/Votes Cast[^\d]{0,40}([\d,]+)/i);
  const validVotes = findNum(/Valid Votes[^\d]{0,40}([\d,]+)/i);
  const invalidVotes = findNum(/Invalid Votes[^\d]{0,40}([\d,]+)/i);

  const parties: ElcomPartyRow[] = [];
  for (const name of PARTY_NAMES) {
    // Match name then numbers (in table cells or pipe layout)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}[\\s|]*([\\d,]+)[\\s|]*([\\d.]+)\\s*%`, "i");
    const m = text.match(re);
    parties.push({
      name,
      votes: m ? toInt(m[1]) : null,
      percent: m ? toFloat(m[2]) : null,
    });
  }

  const dateMatch = text.match(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/);
  const publishedAt = dateMatch ? dateMatch[1] : null;

  const ok = parties.some((p) => p.votes != null) && votesCast != null;

  return {
    generatedAt: new Date().toISOString(),
    votesCast,
    validVotes,
    invalidVotes,
    parties,
    publishedAt,
    sourceUrl: SOURCE_URL,
    ok,
  };
}

async function fetchAndParse(): Promise<ElcomFirstCount> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      generatedAt: new Date().toISOString(),
      votesCast: null, validVotes: null, invalidVotes: null,
      parties: [], publishedAt: null,
      sourceUrl: SOURCE_URL, ok: false, error: "Firecrawl not configured",
    };
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: SOURCE_URL, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        generatedAt: new Date().toISOString(),
        votesCast: null, validVotes: null, invalidVotes: null,
        parties: [], publishedAt: null,
        sourceUrl: SOURCE_URL, ok: false,
        error: `Firecrawl ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    const md = json.data?.markdown ?? json.markdown ?? "";
    return parseMarkdown(md);
  } catch (e) {
    return {
      generatedAt: new Date().toISOString(),
      votesCast: null, validVotes: null, invalidVotes: null,
      parties: [], publishedAt: null,
      sourceUrl: SOURCE_URL, ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const getElcomFirstCount = createServerFn({ method: "GET" }).handler(async (): Promise<ElcomFirstCount> => {
  const cache = getCache();
  const now = Date.now();
  if (cache.entry && now - cache.entry.at < CACHE_TTL_MS) return cache.entry.data;
  const data = await fetchAndParse();
  if (data.ok) {
    cache.entry = { at: now, data };
  } else {
    cache.entry = { at: now - (CACHE_TTL_MS - 60_000), data };
  }
  return data;
});
