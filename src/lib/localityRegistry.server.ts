// Server-side registry of canonical localities derived from the districts
// table. The locality strings stored on a proposal must match a `canonical`
// value here — anything else is rejected. This keeps tag data clean and
// guarantees we can always map a locality back to its district.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface LocalityRegistryEntry {
  /** Canonical English label, used as the persisted value. */
  canonical: string;
  /** All known display variants (en + mt) for fuzzy AI matching. */
  aliases: string[];
  districtId: string;
  districtNumber: number;
  districtNameEn: string;
}

let cache: { at: number; entries: LocalityRegistryEntry[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

function splitList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normaliseKey(s: string): string {
  return s
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

export async function getLocalityRegistry(): Promise<LocalityRegistryEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;

  const { data, error } = await supabaseAdmin
    .from("districts")
    .select("id, number, name_en, localities_en, localities_mt");
  if (error) throw error;

  const entries: LocalityRegistryEntry[] = [];
  for (const row of (data ?? []) as Array<{
    id: string;
    number: number;
    name_en: string;
    localities_en: string | null;
    localities_mt: string | null;
  }>) {
    const en = splitList(row.localities_en);
    const mt = splitList(row.localities_mt);
    const max = Math.max(en.length, mt.length);
    for (let i = 0; i < max; i++) {
      const enName = en[i] ?? mt[i];
      const mtName = mt[i] ?? en[i];
      if (!enName) continue;
      entries.push({
        canonical: enName,
        aliases: Array.from(new Set([enName, mtName].filter(Boolean) as string[])),
        districtId: row.id,
        districtNumber: row.number,
        districtNameEn: row.name_en,
      });
    }
  }

  cache = { at: Date.now(), entries };
  return entries;
}

/** Match arbitrary strings (AI output, manual input) to canonical entries. */
export function matchLocalities(
  registry: LocalityRegistryEntry[],
  inputs: string[],
): LocalityRegistryEntry[] {
  const byKey = new Map<string, LocalityRegistryEntry>();
  for (const e of registry) {
    for (const alias of e.aliases) byKey.set(normaliseKey(alias), e);
  }
  const out = new Map<string, LocalityRegistryEntry>();
  for (const raw of inputs) {
    const hit = byKey.get(normaliseKey(raw));
    if (hit) out.set(hit.canonical, hit);
  }
  return Array.from(out.values());
}

export function deriveDistrictIds(matches: LocalityRegistryEntry[]): string[] {
  return Array.from(new Set(matches.map((m) => m.districtId)));
}
