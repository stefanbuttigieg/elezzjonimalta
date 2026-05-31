import { createServerFn } from "@tanstack/react-start";

export type PnDistrictResult = {
  number: number;
  leader: "PL" | "PN" | null;
  pnPercent: number | null;
  pnVotes: number | null;
  plPercent: number | null;
  plVotes: number | null;
  adpdVotes: number | null;
  momentumVotes: number | null;
  percentCounted: number | null;
  totalVotes: number | null;
  localities: string;
};

export type PnProjection = {
  pnPercent: number | null;
  plPercent: number | null;
  pnSeatPercent: number | null;
  plSeatPercent: number | null;
  leadParty: "PL" | "PN" | null;
  leadPercent: number | null;
  leadVotes: number | null;
};

export type PnLiveResults = {
  generatedAt: string; // ISO timestamp of fetch
  updatedAt: string | null; // "HH:MM:SS" from the page
  national: {
    pnPercent: number | null;
    pnVotes: number | null;
    plPercent: number | null;
    plVotes: number | null;
    adpdVotes: number | null;
    momentumVotes: number | null;
    percentCounted: number | null;
    totalVotes: number | null;
  };
  projection: PnProjection | null;
  districts: PnDistrictResult[];
  sourceUrl: string;
  ok: boolean;
  error?: string;
};

const SOURCE_URL = "https://pn.org.mt/results/";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; data: PnLiveResults };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = globalThis as any;
function getCache(): { entry: CacheEntry | null } {
  if (!globalAny.__pnLiveCache) globalAny.__pnLiveCache = { entry: null };
  return globalAny.__pnLiveCache as { entry: CacheEntry | null };
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

function parsePnMarkdown(md: string): PnLiveResults {
  // Normalize: split by lines, trim, drop empties
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);

  // Updated time: line after "Aġġornat"
  let updatedAt: string | null = null;
  const idxUpd = lines.findIndex((l) => /^Aġġornat$/i.test(l));
  if (idxUpd >= 0 && lines[idxUpd + 1] && /^\d{1,2}:\d{2}(:\d{2})?$/.test(lines[idxUpd + 1])) {
    updatedAt = lines[idxUpd + 1];
  }

  // National block — look for PARTIT NAZZJONALISTA
  let national: PnLiveResults["national"] = {
    pnPercent: null, pnVotes: null, plPercent: null, plVotes: null,
    adpdVotes: null, momentumVotes: null, percentCounted: null, totalVotes: null,
  };
  let projection: PnProjection | null = null;
  const pnIdx = lines.findIndex((l) => /^PARTIT NAZZJONALISTA$/i.test(l));
  if (pnIdx >= 0) {
    // Pattern: PN, %, votes, "X% minn N vot", ADPD, votesA, Momentum, votesM, PL label, %, votes, TBASSIR, projPnPct, projPlPct, projPnSeat%, projPlSeat%, leadStr
    const w = (i: number) => lines[pnIdx + i] ?? "";
    national.pnPercent = toFloat(w(1));
    national.pnVotes = toInt(w(2));
    const counted = w(3); // e.g. "100% minn 306,046 vot"
    const mCount = counted.match(/(\d+(?:\.\d+)?)%\s*minn\s*([\d,]+)/i);
    if (mCount) {
      national.percentCounted = toFloat(mCount[1]);
      national.totalVotes = toInt(mCount[2]);
    }
    // Find ADPD/Momentum near
    for (let i = pnIdx; i < Math.min(pnIdx + 20, lines.length); i++) {
      if (/^ADPD$/i.test(lines[i])) national.adpdVotes = toInt(lines[i + 1]);
      if (/^Momentum$/i.test(lines[i])) national.momentumVotes = toInt(lines[i + 1]);
    }
    const plLabelIdx = lines.findIndex((l, i) => i > pnIdx && /^PARTIT LABURISTA$/i.test(l));
    if (plLabelIdx > 0) {
      national.plPercent = toFloat(lines[plLabelIdx + 1]);
      national.plVotes = toInt(lines[plLabelIdx + 2]);
    }
    // Projection (TBASSIR): two adjacent percentages, then two seat percentages, then "PL +X%(+N voti)"
    const tIdx = lines.findIndex((l, i) => i > pnIdx && /^TBASSIR$/i.test(l));
    if (tIdx > 0) {
      // Next line may be combined like "44.7%51.8%" — split it
      const projLine = lines[tIdx + 1] ?? "";
      const projMatches = projLine.match(/(\d+(?:\.\d+)?)%/g) ?? [];
      const projPnPct = projMatches[0] ? toFloat(projMatches[0]) : null;
      const projPlPct = projMatches[1] ? toFloat(projMatches[1]) : null;
      // Seat percents on next two lines (or also combined)
      const seatLineA = lines[tIdx + 2] ?? "";
      const seatLineB = lines[tIdx + 3] ?? "";
      const seatA = toFloat(seatLineA);
      const seatB = toFloat(seatLineB);
      // Lead line: "PL +7.1%(+21,963 voti)" — could be split too
      let leadParty: "PL" | "PN" | null = null;
      let leadPercent: number | null = null;
      let leadVotes: number | null = null;
      for (let i = tIdx + 1; i < Math.min(tIdx + 8, lines.length); i++) {
        const m = lines[i].match(/^(PL|PN)\s*\+(\d+(?:\.\d+)?)%\s*\(\+?([\d,]+)\s*voti?\)/i);
        if (m) {
          leadParty = m[1].toUpperCase() as "PL" | "PN";
          leadPercent = toFloat(m[2]);
          leadVotes = toInt(m[3]);
          break;
        }
      }
      projection = {
        pnPercent: projPnPct,
        plPercent: projPlPct,
        pnSeatPercent: seatA,
        plSeatPercent: seatB,
        leadParty,
        leadPercent,
        leadVotes,
      };
    }
  }

  // Districts
  const districts: PnDistrictResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^DISTRETT\s+(\d+)$/i);
    if (!m) continue;
    const number = parseInt(m[1], 10);
    // Expected:
    //   [+0] "DISTRETT N"
    //   [+1] "PL ▲" or "PN ▲"
    //   [+2] "PN" or "PL" (first column label, usually losing party label is first per page? actually layout: PN | PL)
    // Layout from markdown sample:
    //   DISTRETT 1
    //   PL ▲             <- leader arrow
    //   PN
    //   42%
    //   9,674
    //   100%
    //   minn 23,058
    //   vot
    //   PL
    //   55%
    //   12,734
    //   ADPD 203Momentum 194
    //   <localities>
    const leaderLine = lines[i + 1] ?? "";
    const leaderMatch = leaderLine.match(/^(PL|PN)\s*[▲▼]?$/);
    const leader = leaderMatch ? (leaderMatch[1].toUpperCase() as "PL" | "PN") : null;

    // Walk forward and pull tokens
    const slice = lines.slice(i + 1, i + 25);
    // Find PN block
    const pnLabelI = slice.findIndex((l) => /^PN$/i.test(l));
    const plLabelI = slice.findIndex((l, idx) => idx > pnLabelI && /^PL$/i.test(l));
    let pnPercent: number | null = null, pnVotes: number | null = null;
    let plPercent: number | null = null, plVotes: number | null = null;
    let percentCounted: number | null = null, totalVotes: number | null = null;
    if (pnLabelI >= 0) {
      pnPercent = toFloat(slice[pnLabelI + 1]);
      pnVotes = toInt(slice[pnLabelI + 2]);
      // "100%" then "minn 23,058" then "vot"
      percentCounted = toFloat(slice[pnLabelI + 3]);
      const minnLine = slice[pnLabelI + 4] ?? "";
      const mm = minnLine.match(/minn\s+([\d,]+)/i);
      if (mm) totalVotes = toInt(mm[1]);
    }
    if (plLabelI >= 0) {
      plPercent = toFloat(slice[plLabelI + 1]);
      plVotes = toInt(slice[plLabelI + 2]);
    }
    // ADPD/Momentum line
    let adpdVotes: number | null = null;
    let momentumVotes: number | null = null;
    let localities = "";
    for (let j = 0; j < slice.length; j++) {
      const l = slice[j];
      const adpdM = l.match(/ADPD\s+([\d,]+)\s*Momentum\s+([\d,]+)/i);
      if (adpdM) {
        adpdVotes = toInt(adpdM[1]);
        momentumVotes = toInt(adpdM[2]);
        // localities is the next line
        localities = slice[j + 1] ?? "";
        break;
      }
    }
    districts.push({
      number,
      leader,
      pnPercent, pnVotes,
      plPercent, plVotes,
      adpdVotes, momentumVotes,
      percentCounted, totalVotes,
      localities,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    updatedAt,
    national,
    projection,
    districts,
    sourceUrl: SOURCE_URL,
    ok: districts.length > 0,
  };
}

async function fetchAndParse(): Promise<PnLiveResults> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      generatedAt: new Date().toISOString(),
      updatedAt: null,
      national: { pnPercent: null, pnVotes: null, plPercent: null, plVotes: null, adpdVotes: null, momentumVotes: null, percentCounted: null, totalVotes: null },
      projection: null,
      districts: [],
      sourceUrl: SOURCE_URL,
      ok: false,
      error: "Firecrawl not configured",
    };
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url: SOURCE_URL,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 4000,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        generatedAt: new Date().toISOString(),
        updatedAt: null,
        national: { pnPercent: null, pnVotes: null, plPercent: null, plVotes: null, adpdVotes: null, momentumVotes: null, percentCounted: null, totalVotes: null },
        projection: null,
        districts: [],
        sourceUrl: SOURCE_URL,
        ok: false,
        error: `Firecrawl ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    const md = json.data?.markdown ?? json.markdown ?? "";
    return parsePnMarkdown(md);
  } catch (e) {
    return {
      generatedAt: new Date().toISOString(),
      updatedAt: null,
      national: { pnPercent: null, pnVotes: null, plPercent: null, plVotes: null, adpdVotes: null, momentumVotes: null, percentCounted: null, totalVotes: null },
      projection: null,
      districts: [],
      sourceUrl: SOURCE_URL,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const getPnLiveResults = createServerFn({ method: "GET" }).handler(async (): Promise<PnLiveResults> => {
  const cache = getCache();
  const now = Date.now();
  if (cache.entry && now - cache.entry.at < CACHE_TTL_MS) {
    return cache.entry.data;
  }
  const data = await fetchAndParse();
  // Only cache successful fetches; cache errors for 30s to avoid hammering
  if (data.ok) {
    cache.entry = { at: now, data };
  } else {
    cache.entry = { at: now - (CACHE_TTL_MS - 30_000), data };
  }
  return data;
});
