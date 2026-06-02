import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getElcomCandidateCounts,
  ELCOM_COUNT_RANGES,
  type ElcomCandidateCounts,
} from "./elcomCandidateCounts.functions";

// ------- Types -------

export type DoublyElectedCandidate = {
  candidateId: string;
  slug: string;
  fullName: string;
  partyShort: string | null;
  partyName: string | null;
  partyColor: string | null;
  photoUrl: string | null;
  districts: number[]; // [d1, d2]
};

export type CasualContender = {
  name: string;
  party: string;
  /** Estimated share (0–1) of the relinquished candidate's ballots that would
   *  flow to this contender, based on observed surplus transfer at the count
   *  the candidate was elected. */
  transferShare: number;
  /** Their last known vote total (final count we have data for). */
  finalVotes: number | null;
  /** How many votes short of quota at the final count (null if already over). */
  shortOfQuota: number | null;
  /** Composite score driving the ranking. */
  score: number;
  /** Probability (0–1) after normalising scores across contenders. */
  probability: number;
  /** True if same party as relinquishing candidate. */
  sameParty: boolean;
};

export type CasualScenario = {
  ok: boolean;
  year: number;
  candidateName: string;
  districtNumber: number;
  quota: number | null;
  /** Count at which the candidate was elected (1-indexed) or null. */
  electedAtCount: number | null;
  /** Count at which surplus was transferred (electedAtCount+1) or null. */
  transferCount: number | null;
  /** Total surplus / transferred votes observed at that count. */
  transferredTotal: number | null;
  contenders: CasualContender[];
  /** Top non-elected same-party candidate (the predicted casual winner). */
  predicted: CasualContender | null;
  error?: string;
};

export type DoubleScenario = {
  candidate: DoublyElectedCandidate;
  perDistrict: CasualScenario[];
};

// ------- Helpers -------

async function fetchAllCounts(
  year: number,
  districtNumber: number,
): Promise<{
  labels: string[];
  rows: Map<string, { party: string; counts: Array<number | null> }>;
  quota: number | null;
  nonTransferrable: Array<number | null>;
  ok: boolean;
  error?: string;
}> {
  const ranges = await Promise.all(
    ELCOM_COUNT_RANGES.map((r) =>
      getElcomCandidateCounts({
        data: { year, districtNumber, countRange: r.value },
      }),
    ),
  );
  const labels: string[] = [];
  const rows = new Map<string, { party: string; counts: Array<number | null> }>();
  let quota: number | null = null;
  const nonT: Array<number | null> = [];
  let okAny = false;
  const errors: string[] = [];

  for (const part of ranges as ElcomCandidateCounts[]) {
    if (part.error) errors.push(part.error);
    if (!part.ok) continue;
    okAny = true;
    if (quota == null && part.summary.quota != null) quota = part.summary.quota;
    for (const lbl of part.countLabels) labels.push(lbl);
    for (const r of part.rows) {
      const key = r.name;
      const existing = rows.get(key) ?? { party: r.party, counts: [] };
      existing.party = existing.party || r.party;
      existing.counts.push(...r.counts);
      rows.set(key, existing);
    }
    for (const v of part.nonTransferrable) nonT.push(v);
  }

  return {
    labels,
    rows,
    quota,
    nonTransferrable: nonT,
    ok: okAny,
    error: okAny ? undefined : errors.join("; "),
  };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRowKey(
  rows: Map<string, { party: string; counts: Array<number | null> }>,
  fullName: string,
): string | null {
  const target = normalizeName(fullName);
  const targetParts = new Set(target.split(" "));
  // exact match first
  for (const k of rows.keys()) if (normalizeName(k) === target) return k;
  // best overlap of name parts
  let best: { k: string; score: number } | null = null;
  for (const k of rows.keys()) {
    const parts = normalizeName(k).split(" ");
    let score = 0;
    for (const p of parts) if (targetParts.has(p)) score += 1;
    if (!best || score > best.score) best = { k, score };
  }
  return best && best.score >= 2 ? best.k : null;
}

function simulateOne(
  year: number,
  fullName: string,
  partyMatchTokens: string[],
  districtNumber: number,
  data: Awaited<ReturnType<typeof fetchAllCounts>>,
  electedSets: Set<string>[],

): CasualScenario {
  const base: CasualScenario = {
    ok: false,
    year,
    candidateName: fullName,
    districtNumber,
    quota: data.quota,
    electedAtCount: null,
    transferCount: null,
    transferredTotal: null,
    contenders: [],
    predicted: null,
  };
  if (!data.ok) return { ...base, error: data.error || "No data" };

  const key = findRowKey(data.rows, fullName);
  if (!key) return { ...base, error: `Candidate "${fullName}" not found in count data` };
  const target = data.rows.get(key)!;
  const counts = target.counts;
  const quota = data.quota ?? Infinity;

  // Find the count where the candidate first met/exceeded quota.
  let electedIdx = -1;
  for (let i = 0; i < counts.length; i++) {
    const v = counts[i];
    if (v != null && v >= quota) {
      electedIdx = i;
      break;
    }
  }
  if (electedIdx < 0) {
    let maxIdx = 0;
    let maxV = -1;
    for (let i = 0; i < counts.length; i++) {
      const v = counts[i] ?? -1;
      if (v > maxV) { maxV = v; maxIdx = i; }
    }
    electedIdx = maxIdx;
  }

  let transferIdx = -1;
  for (let i = electedIdx + 1; i < counts.length && i <= electedIdx + 3; i++) {
    const isElim = counts[i] == null;
    if (isElim) { transferIdx = i; break; }
  }
  if (transferIdx < 0) transferIdx = Math.min(electedIdx + 1, counts.length - 1);

  const tokens = (Array.isArray(partyMatchTokens) ? partyMatchTokens : [])
    .map((t) => String(t ?? "").toUpperCase().trim())
    .filter((t) => t.length >= 2);


  // Only consider OTHER candidates from the SAME PARTY who have NOT already
  // been elected (in any district this election).
  type ContenderTmp = {
    name: string; party: string; transferred: number; finalVotes: number | null;
  };
  const tmp: ContenderTmp[] = [];
  let transferredTotal = 0;
  for (const [name, row] of data.rows.entries()) {
    if (name === key) continue;
    const rowParty = (row.party ?? "").toUpperCase();
    const partyMatches = tokens.length > 0 && tokens.some((t) => rowParty.includes(t));
    if (!partyMatches) continue;
    if (isAlreadyElected(name, electedSets)) continue;


    const prev = transferIdx > 0 ? row.counts[transferIdx - 1] : null;
    const now = row.counts[transferIdx];
    let diff = 0;
    if (prev != null && now != null) diff = Math.max(0, now - prev);
    transferredTotal += diff;
    let finalVotes: number | null = null;
    for (let i = row.counts.length - 1; i >= 0; i--) {
      if (row.counts[i] != null) { finalVotes = row.counts[i]; break; }
    }
    tmp.push({ name, party: row.party, transferred: diff, finalVotes });
  }

  if (tmp.length === 0) {
    return {
      ...base,
      electedAtCount: electedIdx + 1,
      transferCount: transferIdx + 1,
      transferredTotal,
      error: "No eligible same-party, not-yet-elected contenders",
    };
  }

  // Scoring (party already filtered): 78% transfer share + 22% proximity to quota.
  const total = transferredTotal > 0 ? transferredTotal : 1;
  const contenders: CasualContender[] = tmp.map((c) => {
    const transferShare = c.transferred / total;
    const shortOfQuota = c.finalVotes != null && Number.isFinite(quota) ? Math.max(0, quota - c.finalVotes) : null;
    const proximity = shortOfQuota != null && Number.isFinite(quota) && quota > 0
      ? Math.max(0, 1 - shortOfQuota / quota)
      : 0;
    const score = transferShare * 0.78 + proximity * 0.22;
    return {
      name: c.name,
      party: c.party,
      transferShare,
      finalVotes: c.finalVotes,
      shortOfQuota,
      score,
      probability: 0,
      sameParty: true,
    };
  });

  const sum = contenders.reduce((s, c) => s + Math.max(c.score, 0.0001), 0);
  for (const c of contenders) c.probability = Math.max(c.score, 0.0001) / sum;
  contenders.sort((a, b) => b.score - a.score);

  return {
    ...base,
    ok: true,
    electedAtCount: electedIdx + 1,
    transferCount: transferIdx + 1,
    transferredTotal,
    contenders: contenders.slice(0, 8),
    predicted: contenders[0] ?? null,
  };
}

async function fetchElectedTokenSetsForYear(year: number): Promise<Set<string>[]> {
  const { data, error } = await supabaseAdmin
    .from("candidate_districts")
    .select("candidate:candidates(full_name)")
    .eq("election_year", year)
    .eq("elected", true);
  if (error) throw new Error(error.message);
  const sets: Set<string>[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (r as any).candidate?.full_name as string | undefined;
    if (!fn) continue;
    const norm = normalizeName(fn);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const toks = new Set(norm.split(" ").filter((t) => t.length >= 3));
    if (toks.size > 0) sets.push(toks);
  }
  return sets;
}

/** Returns true if `name` shares ≥2 long tokens with any elected candidate
 *  (handles ELCOM name ordering differences, titles, hyphenation, etc.). */
function isAlreadyElected(name: string, electedSets: Set<string>[]): boolean {
  const tokens = normalizeName(name).split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  for (const set of electedSets) {
    let overlap = 0;
    for (const t of tokens) if (set.has(t)) overlap++;
    // 2+ shared meaningful tokens = same person (also catches 2-token names)
    if (overlap >= 2 || (overlap >= 1 && tokens.length === 1 && set.size === 1)) return true;
  }
  return false;
}



// ------- Server functions -------

export const getDoublyElectedCandidates = createServerFn({ method: "POST" })
  .inputValidator(z.object({ year: z.number().int().min(2003).max(2100) }).parse)
  .handler(async ({ data }): Promise<DoublyElectedCandidate[]> => {
    // Pull all elected rows for the year with candidate + district + party
    const { data: rows, error } = await supabaseAdmin
      .from("candidate_districts")
      .select(
        "candidate_id, district:districts(number), candidate:candidates(id, slug, full_name, photo_url, party:parties(short_name, name_en, color))",
      )
      .eq("election_year", data.year)
      .eq("elected", true);
    if (error) throw new Error(error.message);

    const byCandidate = new Map<string, DoublyElectedCandidate>();
    for (const r of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cand = (r as any).candidate;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dist = (r as any).district;
      if (!cand || !dist) continue;
      const existing = byCandidate.get(cand.id);
      if (existing) {
        existing.districts.push(dist.number);
      } else {
        byCandidate.set(cand.id, {
          candidateId: cand.id,
          slug: cand.slug,
          fullName: cand.full_name,
          partyShort: cand.party?.short_name ?? null,
          partyName: cand.party?.name_en ?? null,
          partyColor: cand.party?.color ?? null,
          photoUrl: cand.photo_url ?? null,
          districts: [dist.number],
        });
      }
    }
    return Array.from(byCandidate.values())
      .filter((c) => c.districts.length >= 2)
      .map((c) => ({ ...c, districts: c.districts.sort((a, b) => a - b) }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

export const simulateCasualForDistrict = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      year: z.number().int().min(2003).max(2100),
      fullName: z.string().min(1),
      partyShort: z.string().nullable(),
      districtNumber: z.number().int().min(1).max(13),
    }).parse,
  )
  .handler(async ({ data }): Promise<CasualScenario> => {
    // Read-through cache.
    const { data: cached } = await supabaseAdmin
      .from("casual_predictions")
      .select("scenario")
      .eq("election_year", data.year)
      .eq("full_name", data.fullName)
      .eq("district_number", data.districtNumber)
      .maybeSingle();
    if (cached?.scenario) {
      return cached.scenario as unknown as CasualScenario;
    }

    // Resolve party name variants (en + mt) for matching against ELCOM strings
    const tokens: string[] = [];
    if (data.partyShort) tokens.push(data.partyShort);
    const { data: party } = await supabaseAdmin
      .from("parties")
      .select("short_name, name_en, name_mt")
      .eq("short_name", data.partyShort ?? "")
      .maybeSingle();
    if (party) {
      const extractKeyword = (s: string | null) => {
        if (!s) return null;
        const words = s
          .split(/[\s\-–—]+/)
          .filter((w) => w.length >= 4 && !/^partit$/i.test(w) && !/^party$/i.test(w) && !/^the$/i.test(w));
        return words[0] ?? s;
      };
      const kwMt = extractKeyword(party.name_mt);
      const kwEn = extractKeyword(party.name_en);
      if (kwMt) tokens.push(kwMt);
      if (kwEn) tokens.push(kwEn);
      if (party.name_mt) tokens.push(party.name_mt);
    }
    const [counts, electedSets] = await Promise.all([
      fetchAllCounts(data.year, data.districtNumber),
      fetchElectedTokenSetsForYear(data.year),
    ]);
    const scenario = simulateOne(
      data.year,
      data.fullName,
      tokens,
      data.districtNumber,
      counts,
      electedSets,
    );

    // Write-through: persist successful results.
    if (scenario.ok) {
      try {
        await supabaseAdmin.from("casual_predictions").upsert(
          [
            {
              election_year: data.year,
              full_name: data.fullName,
              district_number: data.districtNumber,
              scenario: scenario as unknown as Record<string, unknown>,
              computed_at: new Date().toISOString(),
            },
          ],
          { onConflict: "election_year,full_name,district_number" },
        );
      } catch (err) {
        console.error("[casualSimulator] cache write failed", err);
      }
    }
    return scenario;
  });

