// Lightweight similarity for proposal duplicate detection.
// Token-based Jaccard with normalization. No external deps.

const STOPWORDS = new Set([
  // English
  "the","a","an","of","for","to","and","or","in","on","with","by","from","at","as","is","are","be","this","that","our","we","will","shall","new","more","all","any","into","over","than","then","up","do","not","no","so","but","if","it","its","also","per","each","one","two","three",
  // Maltese (common)
  "il","l","tal","ta","ma","ġa","ġo","għal","ghal","li","u","jew","fi","f","fl","biex","mill","mil","sa","sat","ser","kull","huwa","hija","huma","din","dan","dawn","dak","dik","kif","mhux","aktar","iktar","wkoll","wara","qabel",
]);

function normalizeTokens(text: string): Set<string> {
  if (!text) return new Set();
  const cleaned = text
    .toLowerCase()
    // Strip diacritics
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = normalizeTokens(a ?? "");
  const B = normalizeTokens(b ?? "");
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface ProposalForMatch {
  id: string;
  title_en: string | null;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  party_id: string | null;
  candidate_id: string | null;
  status: string;
  merged_into_id?: string | null;
}

/**
 * Combined similarity score: heavier weight on titles.
 * Boost when same party or candidate is shared.
 */
export function proposalSimilarity(a: ProposalForMatch, b: ProposalForMatch): number {
  if (a.id === b.id) return 0;
  const titleA = `${a.title_en ?? ""} ${a.title_mt ?? ""}`;
  const titleB = `${b.title_en ?? ""} ${b.title_mt ?? ""}`;
  const descA = `${a.description_en ?? ""} ${a.description_mt ?? ""}`;
  const descB = `${b.description_en ?? ""} ${b.description_mt ?? ""}`;
  const titleScore = similarity(titleA, titleB);
  const descScore = similarity(descA, descB);
  let score = titleScore * 0.7 + descScore * 0.3;
  // Same linked party or candidate strongly suggests dupe
  if (a.party_id && a.party_id === b.party_id) score += 0.05;
  if (a.candidate_id && a.candidate_id === b.candidate_id) score += 0.05;
  return Math.min(score, 1);
}

export function findDuplicates<T extends ProposalForMatch>(
  target: T,
  pool: T[],
  threshold = 0.4
): { proposal: T; score: number }[] {
  return pool
    .filter((p) => p.id !== target.id && !p.merged_into_id)
    .map((p) => ({ proposal: p, score: proposalSimilarity(target, p) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/**
 * Group all proposals into clusters of likely duplicates (union-find).
 */
export function groupDuplicates<T extends ProposalForMatch>(
  pool: T[],
  threshold = 0.55
): T[][] {
  const candidates = pool.filter((p) => !p.merged_into_id);
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    if (parent[x] === x) return x;
    parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a: string, b: string) => {
    parent[find(a)] = find(b);
  };
  for (const p of candidates) parent[p.id] = p.id;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const score = proposalSimilarity(candidates[i], candidates[j]);
      if (score >= threshold) union(candidates[i].id, candidates[j].id);
    }
  }

  const groups: Record<string, T[]> = {};
  for (const p of candidates) {
    const root = find(p.id);
    if (!groups[root]) groups[root] = [];
    groups[root].push(p);
  }
  return Object.values(groups).filter((g) => g.length > 1);
}
