// Helpers for fuzzy, accent-insensitive matching of Maltese localities and
// district numbers, used by the homepage locality picker.

export type DistrictLite = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
  localities_en: string | null;
  localities_mt: string | null;
};

export type LocalityEntry = {
  // The locality name to display (in the active locale when available).
  label: string;
  districtId: string;
  districtNumber: number;
  districtName: string;
  // Normalised forms for matching.
  needles: string[];
};

// Strip diacritics, normalise Maltese letters (ħ, ġ, ż, ċ, għ → h, g, z, c, gh)
// and collapse whitespace/hyphens.
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ħ/g, "h")
    .replace(/ġ/g, "g")
    .replace(/ż/g, "z")
    .replace(/ċ/g, "c")
    .replace(/għ/g, "gh")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitLocalities(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildLocalityIndex(
  districts: DistrictLite[],
  locale: "en" | "mt"
): LocalityEntry[] {
  const out: LocalityEntry[] = [];
  for (const d of districts) {
    const districtName =
      locale === "mt" ? d.name_mt || d.name_en : d.name_en || d.name_mt || `District ${d.number}`;
    const en = splitLocalities(d.localities_en);
    const mt = splitLocalities(d.localities_mt);
    // Pair them positionally where possible; otherwise concatenate.
    const max = Math.max(en.length, mt.length);
    for (let i = 0; i < max; i++) {
      const enName = en[i];
      const mtName = mt[i];
      const label = (locale === "mt" ? mtName || enName : enName || mtName) ?? "";
      if (!label) continue;
      const needles = [enName, mtName, label]
        .filter((s): s is string => Boolean(s))
        .map(normalise);
      out.push({
        label,
        districtId: d.id,
        districtNumber: d.number,
        districtName,
        needles: Array.from(new Set(needles)),
      });
    }
  }
  return out;
}

export type LocalityMatch =
  | { kind: "locality"; entry: LocalityEntry; score: number }
  | { kind: "district"; districtNumber: number; districtName: string; score: number };

export function searchLocalities(
  index: LocalityEntry[],
  query: string,
  limit = 8
): LocalityMatch[] {
  const q = normalise(query);
  if (!q) return [];

  // District number direct hit (e.g. "6", "13", "district 8")
  const numberHit = q.match(/\b(1[0-3]|[1-9])\b/);
  const matches: LocalityMatch[] = [];

  if (numberHit) {
    const n = Number(numberHit[1]);
    const sample = index.find((e) => e.districtNumber === n);
    if (sample) {
      matches.push({
        kind: "district",
        districtNumber: n,
        districtName: sample.districtName,
        score: 1000,
      });
    }
  }

  for (const entry of index) {
    let best = 0;
    for (const needle of entry.needles) {
      if (needle === q) {
        best = Math.max(best, 900);
      } else if (needle.startsWith(q)) {
        best = Math.max(best, 700 - (needle.length - q.length));
      } else if (needle.includes(q)) {
        best = Math.max(best, 500 - (needle.length - q.length));
      }
    }
    if (best > 0) matches.push({ kind: "locality", entry, score: best });
  }

  // De-duplicate locality entries by label+district (an entry can appear
  // because both EN and MT needles match).
  const seen = new Set<string>();
  return matches
    .sort((a, b) => b.score - a.score)
    .filter((m) => {
      const key =
        m.kind === "district"
          ? `d:${m.districtNumber}`
          : `l:${m.entry.districtNumber}:${m.entry.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
