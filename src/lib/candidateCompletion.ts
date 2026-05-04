// Profile completion calculator for candidates.
// Counts every column on the candidates table plus custom-field definitions.
// Returns a 0-100 percentage and the list of missing field labels.

export interface CandidateForCompletion {
  full_name?: string | null;
  slug?: string | null;
  party_id?: string | null;
  primary_district_id?: string | null;
  bio_en?: string | null;
  bio_mt?: string | null;
  photo_url?: string | null;
  website?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  email?: string | null;
  phone?: string | null;
  office_address?: string | null;
  parlament_mt_url?: string | null;
  source_url?: string | null;
  profession?: string | null;
  education?: string | null;
  date_of_birth?: string | null;
  birthplace?: string | null;
  languages?: string[] | null;
  leadership_role?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface CustomFieldDef {
  key: string;
  label: string;
  required: boolean;
  field_type?: string;
  entity_type?: string;
}

// Weights — higher = more important for "complete" profile.
const FIELD_WEIGHTS: Array<{ key: keyof CandidateForCompletion; label: string; weight: number }> = [
  { key: "full_name", label: "Full name", weight: 3 },
  { key: "party_id", label: "Party", weight: 3 },
  { key: "primary_district_id", label: "Primary district", weight: 3 },
  { key: "photo_url", label: "Photo", weight: 3 },
  { key: "bio_en", label: "Bio (EN)", weight: 3 },
  { key: "bio_mt", label: "Bio (MT)", weight: 2 },
  { key: "profession", label: "Profession", weight: 2 },
  { key: "date_of_birth", label: "Date of birth", weight: 1 },
  { key: "birthplace", label: "Birthplace", weight: 1 },
  { key: "education", label: "Education", weight: 1 },
  { key: "languages", label: "Languages", weight: 1 },
  { key: "email", label: "Email", weight: 2 },
  { key: "phone", label: "Phone", weight: 1 },
  { key: "office_address", label: "Office address", weight: 1 },
  { key: "website", label: "Website", weight: 2 },
  { key: "facebook", label: "Facebook", weight: 1 },
  { key: "twitter", label: "X / Twitter", weight: 1 },
  { key: "instagram", label: "Instagram", weight: 1 },
  { key: "tiktok", label: "TikTok", weight: 1 },
  { key: "linkedin", label: "LinkedIn", weight: 1 },
  { key: "youtube", label: "YouTube", weight: 1 },
  { key: "parlament_mt_url", label: "parlament.mt URL", weight: 1 },
  { key: "source_url", label: "Source URL", weight: 1 },
  { key: "slug", label: "Slug", weight: 1 },
];

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export interface CompletionResult {
  percent: number;
  filled: number;
  total: number;
  missing: string[];
}

export function computeCandidateCompletion(
  candidate: CandidateForCompletion,
  customFieldDefs: CustomFieldDef[] = [],
): CompletionResult {
  let earned = 0;
  let possible = 0;
  const missing: string[] = [];

  for (const f of FIELD_WEIGHTS) {
    possible += f.weight;
    if (isFilled(candidate[f.key])) earned += f.weight;
    else missing.push(f.label);
  }

  const cf = (candidate.custom_fields ?? {}) as Record<string, unknown>;
  for (const def of customFieldDefs.filter((d) => d.entity_type === "candidate" || !d.entity_type)) {
    const weight = def.required ? 2 : 1;
    possible += weight;
    if (isFilled(cf[def.key])) earned += weight;
    else missing.push(def.label);
  }

  const percent = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return { percent, filled: earned, total: possible, missing };
}

export function completionTone(percent: number): "low" | "medium" | "high" {
  if (percent < 40) return "low";
  if (percent < 75) return "medium";
  return "high";
}
