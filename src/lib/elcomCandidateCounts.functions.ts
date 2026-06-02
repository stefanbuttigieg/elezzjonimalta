import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Mappings discovered from the ELCOM page form options.
export const ELCOM_YEARS = [
  { year: 2026, electionId: 271 },
  { year: 2022, electionId: 248 },
  { year: 2017, electionId: 244 },
  { year: 2013, electionId: 162 },
  { year: 2008, electionId: 91 },
  { year: 2003, electionId: 45 },
] as const;

// districtNumber 1..13 -> ELCOM zoneId only valid for 2026.
// Older years use different zoneIds, so we look them up dynamically by parsing
// the page's <select> options after switching the year.
export const ELCOM_2026_ZONES: Record<number, number> = {
  1: 961, 2: 962, 3: 963, 4: 964, 5: 965, 6: 966, 7: 967,
  8: 968, 9: 969, 10: 970, 11: 971, 12: 972, 13: 973,
};

// "Show Counts" select indices: 0=1-5, 1=6-10, 2=11-15, 3=16-20, 4=21-25
export const ELCOM_COUNT_RANGES = [
  { value: 0, label: "1 – 5" },
  { value: 1, label: "6 – 10" },
  { value: 2, label: "11 – 15" },
  { value: 3, label: "16 – 20" },
  { value: 4, label: "21 – 25" },
] as const;

export type ElcomCandidateRow = {
  name: string;
  party: string;
  /** Vote totals in this range. Slot is null when "..." (no change shown). */
  counts: Array<number | null>;
  /** Diff between successive counts (1 fewer entry than counts). */
  diffs: Array<number | null>;
};

export type ElcomCandidateCounts = {
  ok: boolean;
  generatedAt: string;
  year: number;
  districtNumber: number;
  countRange: number; // 0..4
  countLabels: string[]; // e.g. ["Count 1", ..., "Count 5"]
  summary: {
    title: string | null;
    quota: number | null;
    seats: number | null;
    validVotes: number | null;
  };
  rows: ElcomCandidateRow[];
  nonTransferrable: Array<number | null>;
  totals: Array<number | null>;
  sourceUrl: string;
  error?: string;
};

const SOURCE_URL = "https://electoral.gov.mt/ElectionResults/General";
const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheKey = string;
type CacheEntry = { at: number; data: ElcomCandidateCounts };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = globalThis as any;
function getCache(): Map<CacheKey, CacheEntry> {
  if (!globalAny.__elcomCountsCache) globalAny.__elcomCountsCache = new Map<CacheKey, CacheEntry>();
  return globalAny.__elcomCountsCache as Map<CacheKey, CacheEntry>;
}

function toIntOrNull(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t || t === "..." || t === "—" || t === "-") return null;
  const n = parseInt(t.replace(/[,\\s+]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toSignedIntOrNull(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t || t === "..." || t === "—") return null;
  const n = parseInt(t.replace(/[,\\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\\s+/g, " ").trim();
}

function parseHtml(html: string): Omit<ElcomCandidateCounts, "ok" | "generatedAt" | "year" | "districtNumber" | "countRange" | "sourceUrl"> {
  // Title (e.g. "2026 General Election - District 3")
  const titleMatch =
    html.match(/(\d{4})\s+General Election\s*-\s*District\s+(\d+)/i) ||
    html.match(/General Election\s*-\s*(\d{4})[\s\S]{0,200}?District\s+(\d+)/i);
  const title = titleMatch ? `${titleMatch[1]} General Election - District ${titleMatch[2]}` : null;

  const quota = toIntOrNull(html.match(/Quota[\s\S]{0,200}?<[^>]+>\s*([\d,]+)/i)?.[1]);
  const seats = toIntOrNull(html.match(/Seats[\s\S]{0,200}?<[^>]+>\s*([\d,]+)/i)?.[1]);
  const validVotes = toIntOrNull(html.match(/Valid Votes[\s\S]{0,400}?<[^>]+>\s*([\d,]+)/i)?.[1]);

  // Count labels from the visible <th> headers ("Count 1" ... "Count 5")
  const countLabels: string[] = [];
  const labelRe = /<th[^>]*>\s*Count\s+(\d+)\s*<\/th>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(html))) countLabels.push(`Count ${lm[1]}`);

  // Parse rows. Each candidate <tr role="row"> has the name in a <div id="..." class="candidateHoverImage">...</div>,
  // then 5 vote cells alternating with 4 diff cells.
  const rows: ElcomCandidateRow[] = [];
  // Track current party from the preceding <tr class="group partyName"><td colspan="...">PARTY</td></tr>
  let currentParty = "";
  const rowRe = /<tr(?:\s+role="row"|\s+class="group partyName")[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html))) {
    const block = rm[1];
    // Skip header row (no candidate div, contains <th>)
    const partyHeader = block.match(/class="group partyName"/) || rm[0].match(/class="group partyName"/);
    if (partyHeader || /<td\s+colspan="\d+">([^<]+)<\/td>/.test(block) && !/candidateHoverImage/.test(block)) {
      const pm = block.match(/<td[^>]*colspan="\d+"[^>]*>([^<]+)<\/td>/);
      if (pm) currentParty = stripTags(pm[1]);
      continue;
    }
    const nameMatch = block.match(/class="candidateHoverImage"[^>]*>\s*([^<]+?)\s*</);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);

    // Pull vote cells (<td class="text-right">123</td>) and diff cells
    // We need to keep order. Parse all <td>s in order.
    const counts: Array<number | null> = [];
    const diffs: Array<number | null> = [];
    const cellRe = /<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(block))) {
      const cls = cm[1];
      const inner = stripTags(cm[2]);
      if (cls.includes("countDifference")) {
        diffs.push(toSignedIntOrNull(inner));
      } else if (cls.includes("text-right")) {
        counts.push(toIntOrNull(inner));
      }
    }
    if (counts.length === 0) continue;
    rows.push({ name, party: currentParty, counts, diffs });
  }

  // Footer: Non-Transferrable Votes and Totals
  const tfootMatch = html.match(/<tfoot[\s\S]*?<\/tfoot>/i);
  let nonTransferrable: Array<number | null> = [];
  let totals: Array<number | null> = [];
  if (tfootMatch) {
    const footer = tfootMatch[0];
    const trMatches = Array.from(footer.matchAll(/<tr>([\s\S]*?)<\/tr>/gi));
    for (const tr of trMatches) {
      const inner = tr[1];
      const isNonT = /Non-Transferrable/i.test(inner);
      const isTotals = /Totals/i.test(inner);
      if (!isNonT && !isTotals) continue;
      const cellRe2 = /<th[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/th>/gi;
      const series: Array<number | null> = [];
      let cm2: RegExpExecArray | null;
      while ((cm2 = cellRe2.exec(inner))) {
        const cls = cm2[1];
        if (cls.includes("countFooterDifference")) continue;
        if (cls.includes("text-right")) {
          const txt = stripTags(cm2[2]);
          if (/Non-Transferrable|Totals/i.test(txt)) continue;
          series.push(toIntOrNull(txt));
        }
      }
      if (isNonT) nonTransferrable = series;
      else if (isTotals) totals = series;
    }
  }

  return {
    countLabels,
    summary: { title, quota, seats, validVotes },
    rows,
    nonTransferrable,
    totals,
  };
}

async function fetchElcom(year: number, districtNumber: number, countRange: number): Promise<ElcomCandidateCounts> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const baseEmpty: ElcomCandidateCounts = {
    ok: false,
    generatedAt: new Date().toISOString(),
    year,
    districtNumber,
    countRange,
    countLabels: [],
    summary: { title: null, quota: null, seats: null, validVotes: null },
    rows: [],
    nonTransferrable: [],
    totals: [],
    sourceUrl: SOURCE_URL,
  };
  if (!apiKey) return { ...baseEmpty, error: "Firecrawl not configured" };

  const electionId = ELCOM_YEARS.find((y) => y.year === year)?.electionId;
  if (!electionId) return { ...baseEmpty, error: `Unknown year ${year}` };

  // Strategy: Use Firecrawl actions to (1) switch year via #ddlYears,
  // (2) switch district via .ddlZones, (3) switch count range via the
  // Show Counts <select>. Each change triggers a partial-page AJAX
  // replace. We wait between actions, then grab HTML.
  const zoneIdHint = year === 2026 ? ELCOM_2026_ZONES[districtNumber] : null;

  // We dispatch JS that finds the correct <option> by *display text* for
  // the district (1..13). This works across years even though zoneIds
  // change.
  const switchScript = `
    (function(){
      function setSelectByValue(sel, val){
        if(!sel) return;
        sel.value = String(val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function setSelectByText(sel, text){
        if(!sel) return;
        for (var i=0;i<sel.options.length;i++){
          if (sel.options[i].text.trim() === String(text)) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      }
      setSelectByValue(document.getElementById('ddlYears'), ${electionId});
    })();
  `;
  const switchDistrictScript = `
    (function(){
      var sel = document.getElementById('ElectionResultModel_ZoneDetails_SelectedZoneId');
      if(!sel) return;
      ${zoneIdHint
        ? `sel.value = '${zoneIdHint}'; sel.dispatchEvent(new Event('change', { bubbles: true }));`
        : `for (var i=0;i<sel.options.length;i++){ if (sel.options[i].text.trim() === '${districtNumber}') { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); return; } }`
      }
    })();
  `;
  const switchRangeScript = `
    (function(){
      var sels = document.querySelectorAll('select');
      for (var s=0; s<sels.length; s++){
        var sel = sels[s];
        var hasRange = false;
        for (var i=0;i<sel.options.length;i++){
          if (/^\\s*1\\s*-\\s*5\\s*$/.test(sel.options[i].text)) { hasRange = true; break; }
        }
        if (hasRange) { sel.value = '${countRange}'; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
      }
    })();
  `;

  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url: SOURCE_URL,
        formats: ["html"],
        onlyMainContent: false,
        actions: [
          { type: "wait", milliseconds: 1500 },
          { type: "executeJavascript", script: switchScript },
          { type: "wait", milliseconds: 2500 },
          { type: "executeJavascript", script: switchDistrictScript },
          { type: "wait", milliseconds: 2500 },
          { type: "executeJavascript", script: switchRangeScript },
          { type: "wait", milliseconds: 2000 },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ...baseEmpty, error: `Firecrawl ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await res.json()) as { data?: { html?: string }; html?: string };
    const html = json.data?.html ?? json.html ?? "";
    const parsed = parseHtml(html);
    const ok = parsed.rows.length > 0 && parsed.countLabels.length > 0;
    return {
      ...baseEmpty,
      ...parsed,
      ok,
      error: ok ? undefined : "Could not parse results table",
    };
  } catch (e) {
    return { ...baseEmpty, error: e instanceof Error ? e.message : String(e) };
  }
}

async function readDbCache(
  year: number,
  districtNumber: number,
  countRange: number,
): Promise<{ data: ElcomCandidateCounts; fetchedAt: string } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("elcom_results_cache")
      .select("data, fetched_at")
      .eq("year", year)
      .eq("district_number", districtNumber)
      .eq("count_range", countRange)
      .maybeSingle();
    if (error || !data) return null;
    return { data: data.data as ElcomCandidateCounts, fetchedAt: data.fetched_at as string };
  } catch {
    return null;
  }
}

async function writeDbCache(
  year: number,
  districtNumber: number,
  countRange: number,
  result: ElcomCandidateCounts,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("elcom_results_cache").upsert(
      [
        {
          year,
          district_number: districtNumber,
          count_range: countRange,
          data: result as unknown as Record<string, unknown>,
          fetched_at: new Date().toISOString(),
        },
      ],
      { onConflict: "year,district_number,count_range" },
    );
  } catch (err) {
    console.error("[elcomCandidateCounts] cache write failed", err);
  }
}

async function assertAdmin(): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const authHeader = req?.headers?.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: u } = await supabaseAdmin.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) throw new Response("Unauthorized", { status: 401 });
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Response("Forbidden", { status: 403 });
}

export const getElcomCandidateCounts = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      year: z.number().int().min(2003).max(2026),
      districtNumber: z.number().int().min(1).max(13),
      countRange: z.number().int().min(0).max(4),
      force: z.boolean().optional(),
    }).parse
  )
  .handler(async ({ data }): Promise<ElcomCandidateCounts> => {
    const cache = getCache();
    const key = `${data.year}:${data.districtNumber}:${data.countRange}`;
    const now = Date.now();

    if (!data.force) {
      const hit = cache.get(key);
      if (hit && now - hit.at < CACHE_TTL_MS) return hit.data;

      const db = await readDbCache(data.year, data.districtNumber, data.countRange);
      if (db && db.data.ok) {
        cache.set(key, { at: now, data: db.data });
        return db.data;
      }
    }

    const fresh = await fetchElcom(data.year, data.districtNumber, data.countRange);
    cache.set(key, { at: fresh.ok ? now : now - (CACHE_TTL_MS - 60_000), data: fresh });
    if (fresh.ok) {
      await writeDbCache(data.year, data.districtNumber, data.countRange, fresh);
    }
    return fresh;
  });

export const refreshElcomCandidateCounts = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      year: z.number().int().min(2003).max(2026),
      districtNumber: z.number().int().min(1).max(13),
      countRange: z.number().int().min(0).max(4),
    }).parse
  )
  .handler(async ({ data }): Promise<ElcomCandidateCounts> => {
    await assertAdmin();
    const fresh = await fetchElcom(data.year, data.districtNumber, data.countRange);
    if (fresh.ok) {
      await writeDbCache(data.year, data.districtNumber, data.countRange, fresh);
      const cache = getCache();
      const key = `${data.year}:${data.districtNumber}:${data.countRange}`;
      cache.set(key, { at: Date.now(), data: fresh });
    }
    return fresh;
  });

/**
 * Refresh every (year, district, range) combo currently in the DB cache.
 * Called by the daily cron hook. Sequential with a small delay to be polite to Firecrawl.
 */
export async function refreshAllCachedElcomEntries(): Promise<{
  refreshed: number;
  failed: number;
  total: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("elcom_results_cache")
    .select("year, district_number, count_range");
  if (error || !rows) return { refreshed: 0, failed: 0, total: 0 };

  let refreshed = 0;
  let failed = 0;
  for (const r of rows) {
    const fresh = await fetchElcom(
      r.year as number,
      r.district_number as number,
      r.count_range as number,
    );
    if (fresh.ok) {
      await writeDbCache(
        r.year as number,
        r.district_number as number,
        r.count_range as number,
        fresh,
      );
      refreshed++;
    } else {
      failed++;
    }
    await new Promise((res) => setTimeout(res, 750));
  }
  return { refreshed, failed, total: rows.length };
}

