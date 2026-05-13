# Candidate Categorisation

Four pieces, shipped in one round but in safe order so each step is usable on its own.

---

## 1. Profession — ISCO code + curated bucket

**New tables**

- `profession_codes` — seed data
  - `code` (text, PK) — ISCO‑08 4‑digit code (e.g. `2611`)
  - `title_en`, `title_mt`
  - `bucket` (text) — short-list slug (`lawyer`, `doctor`, `educator`, `entrepreneur`, …)
  - `major_group` (text) — ISCO 1‑digit group
  - `active` (bool)
- `profession_buckets` — curated short list (~40 rows)
  - `slug` (PK), `label_en`, `label_mt`, `icon`, `sort_order`, `description_en`

**Schema change on `candidates`**

- `profession_code` text → FK `profession_codes.code` (nullable)
- `profession_bucket` text → FK `profession_buckets.slug` (nullable, derivable but stored for filter speed)
- Keep existing free-text `profession` as fallback / display override.

**Seed data**: ship a curated subset of ISCO‑08 (~120 codes that actually appear in Maltese politics) + ~40 buckets, pre-mapped. Source: ILO ISCO‑08 official list.

**Admin UX** (`admin.candidates.tsx` editor):
- Combobox: type to search ISCO title, picks code; bucket auto-fills from mapping (editable).
- "Apply ISCO suggestion" button calls AI server fn that reads `profession` free text + `bio_en` and proposes a code.

---

## 2. Position kind — structured cabinet/parliamentary roles

**Schema change on `candidate_positions`**

- New enum `position_kind`: `minister`, `parliamentary_secretary`, `prime_minister`, `deputy_pm`, `opposition_leader`, `speaker`, `deputy_speaker`, `whip`, `committee_chair`, `committee_member`, `shadow_minister`, `cabinet_member`, `other`
- Column `position_kind position_kind not null default 'other'`
- Optional `portfolio` text (e.g. "Health", "Foreign Affairs") split out from free-text `title`

**Server fn** `backfillPositionKinds`:
- Reads all `candidate_positions` rows
- Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with the title + body, asks for `{kind, portfolio}` JSON
- Updates rows in batches of 50, persists progress in `summary.pipeline` like manifesto importer (tick pattern, Worker-safe)

**Admin UI** (`admin.candidates.tsx`): position editor gets a `<select>` for `position_kind`; "AI classify all" button on the candidate page.

---

## 3. Local council experience

**New table `candidate_local_council_terms`**
- `candidate_id` FK
- `council_name` text — free for now
- `locality` text — references `districts.localities_*` for cross-link
- `role` enum (`mayor`, `deputy_mayor`, `councillor`, `co_opted`)
- `party_id` FK nullable
- `election_year` int
- `start_date`, `end_date` date
- `votes_first_count` int nullable
- `source_url` text
- RLS: same shape as `candidate_positions` (public read on published candidates, staff write).

**electoral.gov.mt scraper**

The site publishes per-council results (PDFs and HTML tables) at `https://electoral.gov.mt/ElectionResults/Local`. Approach:
- Server fn `scrapeLocalCouncilResults({ year })` using **Firecrawl** (already wired into the project as a connector) to pull the results page + linked PDFs.
- AI extraction (`google/gemini-2.5-pro`, JSON mode) → list of `{council, candidate_name, party, votes, elected, role}` rows.
- Match candidate names against `candidates.full_name` with fuzzy match (existing helper in `proposal-dedupe`); unresolved rows go into a staging table for manual confirm.
- New admin page `/admin/local-council-imports` lists runs, their staging rows, and a confirm/merge UI — same drawer pattern as manifesto imports.

**Note**: scraping electoral.gov.mt PDFs is the riskiest piece. Fallback is fully manual entry while the scraper is iterated.

---

## 4. Experience summary + public filters

**Computed view `candidate_experience_summary`** (Postgres view, refreshed on demand):
- `parliamentary_terms_count`, `first_elected_year`, `currently_sitting`
- `cabinet_terms_count`, `current_minister_portfolio`
- `local_council_terms_count`, `is_current_mayor`

**Public UI**:
- `$lang.candidates.$slug.tsx` — new "Experience" section showing terms, portfolios, council roles with timeline.
- `$lang.candidates.index.tsx` — add filter chips:
  - Profession bucket (multi)
  - Has parliamentary experience (yes/no/MEP)
  - Has cabinet experience
  - Has local council experience
  - First-time candidate

---

## Migrations / order of execution

```text
1. Migration A: profession_codes + profession_buckets tables, seed data,
   candidates.profession_code/bucket columns
2. Migration B: position_kind enum, column on candidate_positions
3. Migration C: candidate_local_council_terms + staging table + RLS
4. Migration D: candidate_experience_summary view
5. Server fns + admin UI for #1, #2, #3
6. AI backfill + scraper runs (manual trigger from admin)
7. Public filters on /candidates
```

Each migration is independent; if any later step is rejected we still have the data model.

---

## What I need from you before starting

1. **Confirm the ~40 profession buckets** — I'll draft a list and ask you to edit it before seeding.
2. **Firecrawl connector** is already linked in the project — re-confirm or I'll request reconnect.
3. **Scope of legislatures** for backfill: all historical, or only post‑2008?

Reply with any answer or "go" to start with Migration A + the bucket draft.