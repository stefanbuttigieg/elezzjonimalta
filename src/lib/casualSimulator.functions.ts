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
  partyShort: string | null,
  districtNumber: number,
  data: Awaited<ReturnType<typeof fetchAllCounts>>,
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
    // Fallback: use the count with the highest value as the "elected" pivot.
    let maxIdx = 0;
    let maxV = -1;
    for (let i = 0; i < counts.length; i++) {
      const v = counts[i] ?? -1;
      if (v > maxV) { maxV = v; maxIdx = i; }
    }
    electedIdx = maxIdx;
  }

  // The transfer of the candidate's surplus typically appears at the *next*
  // count: their cell becomes "..." (null) and other rows show positive diffs.
  // If the next count isn't an obvious transfer, scan forward up to 3 counts.
  let transferIdx = -1;
  for (let i = electedIdx + 1; i < counts.length && i <= electedIdx + 3; i++) {
    const isElim = counts[i] == null;
    if (isElim) { transferIdx = i; break; }
  }
  if (transferIdx < 0) transferIdx = Math.min(electedIdx + 1, counts.length - 1);

  // Compute diffs at transferIdx for every OTHER candidate row.
  type ContenderTmp = {
    name: string; party: string; transferred: number; finalVotes: number | null;
  };
  const tmp: ContenderTmp[] = [];
  let transferredTotal = 0;
  for (const [name, row] of data.rows.entries()) {
    if (name === key) continue;
    const prev = transferIdx > 0 ? row.counts[transferIdx - 1] : null;
    const now = row.counts[transferIdx];
    let diff = 0;
    if (prev != null && now != null) diff = Math.max(0, now - prev);
    transferredTotal += diff;
    // final vote total = last non-null value in counts
    let finalVotes: number | null = null;
    for (let i = row.counts.length - 1; i >= 0; i--) {
      if (row.counts[i] != null) { finalVotes = row.counts[i]; break; }
    }
    tmp.push({ name, party: row.party, transferred: diff, finalVotes });
  }

  // Filter out candidates that themselves reached quota (already elected, not
  // eligible for the casual seat).
  const eligible = tmp.filter((c) => (c.finalVotes ?? 0) < quota);
  if (eligible.length === 0) {
    return { ...base, electedAtCount: electedIdx + 1, transferCount: transferIdx + 1, transferredTotal, error: "No eligible contenders" };
  }

  // Scoring: heavy weight on transfer share, mild weight on proximity to
  // quota, party-match multiplier.
  const total = transferredTotal > 0 ? transferredTotal : 1;
  const partyKey = (partyShort ?? "").toUpperCase();
  const contenders: CasualContender[] = eligible.map((c) => {
    const transferShare = c.transferred / total;
    const shortOfQuota = c.finalVotes != null && Number.isFinite(quota) ? Math.max(0, quota - c.finalVotes) : null;
    const proximity = shortOfQuota != null && Number.isFinite(quota) && quota > 0
      ? Math.max(0, 1 - shortOfQuota / quota)
      : 0;
    const sameParty = c.party.toUpperCase().includes(partyKey) && partyKey.length > 0;
    // Composite: 70% transfers, 20% proximity, 10% party bias (added on top).
    let score = transferShare * 0.7 + proximity * 0.2;
    if (sameParty) score = score * 1.25 + 0.05;
    return {
      name: c.name,
      party: c.party,
      transferShare,
      finalVotes: c.finalVotes,
      shortOfQuota,
      score,
      probability: 0,
      sameParty,
    };
  });

  // Normalise scores → probabilities via softmax-lite (clip then divide).
  const sum = contenders.reduce((s, c) => s + Math.max(c.score, 0.0001), 0);
  for (const c of contenders) c.probability = Math.max(c.score, 0.0001) / sum;
  contenders.sort((a, b) => b.score - a.score);

  const predicted = contenders.find((c) => c.sameParty) ?? contenders[0] ?? null;

  return {
    ...base,
    ok: true,
    electedAtCount: electedIdx + 1,
    transferCount: transferIdx + 1,
    transferredTotal,
    contenders: contenders.slice(0, 8),
    predicted,
  };
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
    const counts = await fetchAllCounts(data.year, data.districtNumber);
    return simulateOne(data.year, data.fullName, data.partyShort, data.districtNumber, counts);
  });
