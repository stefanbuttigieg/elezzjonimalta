## Locality-first entry point

Let voters land on the homepage, type or pick their **locality** (or district number) and immediately jump to a personalised "your district" view that surfaces everything they need: the district, its candidates, the party split, related proposals and useful resources.

### What the user sees

1. **Homepage hero gets a locality search box** as the first interactive element — replacing the current generic "Browse candidates / Ask the assistant" CTAs as the primary action.
   - A single combobox: type a locality (e.g. *Mellieħa*, *Sliema*, *Żejtun*) **or** a district number (1–13).
   - Live, fuzzy suggestions as you type, drawn from the existing `districts.localities_en/mt` lists.
   - Bilingual: searches both EN and MT names so "Birkirkara" and "Ħal Qormi" both work.
   - Two affordances under the input:
     - "Use my district 6" quick chips for the 13 districts (collapsed behind a "Browse all districts" toggle on mobile).
     - "Skip — explore everything" small link to the existing entry grid below.

2. **On selection** the user is taken to a new **"My district" page** at `/{lang}/my-district/{number}` that shows, in one scroll:
   - District header (number, name, list of localities, source link).
   - Party breakdown bar (reuses the chart from the districts page).
   - **All confirmed 2026 candidates contesting that district** (including dual-district candidates via `candidate_districts`), grouped by party, each linking to their profile.
   - **Proposals that mention that district's parties or candidates** (filter `proposals` by party_id of candidates in this district) — a short "What candidates here are promising" section, capped at ~6 with a "See all proposals" link.
   - "Compare candidates here" CTA → preloads the compare tool with this district's top candidates.
   - "Useful resources" footer (vot.mt, electoral.gov.mt, maltaelections.io) reusing the resources copy.

3. **Persistence**: the chosen locality / district is saved to `localStorage` (`vot.preferredDistrict`). On future visits the homepage shows a "Welcome back — jump back to District 6 (Qormi)" banner above the hero, with a "Change" button. Respects existing cookie consent (only stored after consent, otherwise session-only).

4. **Header shortcut**: once a district is set, the site header gets a small "My district" link next to the locale switcher so it's reachable from any page.

### Where it fits

```text
/                       Landing → redirects to /en
/{lang}                 Homepage with new locality picker as hero
/{lang}/my-district/$n  NEW personalised district hub (server-loaded, SEO-friendly)
/{lang}/districts       Existing list page, unchanged
/{lang}/candidates      Existing candidate list, unchanged
```

The new page is a real route (not a hash), so it's shareable, indexable, and gets its own SEO metadata per district (e.g. *"District 6 — Qormi, Siġġiewi, Luqa — Vot Malta 2026"*).

### Accessibility & UX

- Combobox follows ARIA combobox pattern (listbox, `aria-activedescendant`, keyboard navigation with ↑/↓/Enter/Esc).
- Locality matching is accent-insensitive (`Ħal Qormi` matches `hal qormi`).
- If a locality maps to multiple districts (rare but possible after boundary changes) the picker shows a small disambiguation dropdown.
- No JS fallback: the picker is a normal `<form>` posting to the districts page with the query, so server-rendered visitors and assistive tech can still navigate.

### Technical implementation

- **Data**:
  - Reuse the existing `loadDistricts()` query (already returns localities + party breakdown). Build a flat `[{ locality, districtNumber, districtId }]` index in memory on the client for fuzzy matching (≤200 entries — trivial).
  - The new `/$lang/my-district/$number` route adds a server loader that fetches the district by number, all candidates with `primary_district_id = district.id` **plus** candidates joined via `candidate_districts` for `election_year = 2026`, and proposals filtered by those candidates' party IDs.
- **New files**:
  - `src/components/site/LocalityPicker.tsx` — accessible combobox component used in the hero.
  - `src/lib/localityIndex.ts` — pure helpers to normalise/search locality strings.
  - `src/routes/$lang.my-district.$number.tsx` — the personalised hub route with `head()` per district.
  - `src/lib/preferredDistrict.ts` — tiny `localStorage` helper gated on cookie consent.
- **Edits**:
  - `src/routes/$lang.index.tsx` — replace hero CTA block with the LocalityPicker; add the "Welcome back" banner above the hero when a preference exists.
  - `src/components/site/SiteHeader.tsx` — add a conditional "My district" link.
  - `src/i18n/dictionaries.ts` — add the new strings (EN + MT) for picker placeholder, button labels, "Welcome back…", new page headings, empty/error states.
- **No DB changes** required — all needed columns and joins already exist (`districts.localities_en/mt`, `candidate_districts`, `candidates.primary_district_id`).

### Out of scope (can come later)

- Geolocation auto-detect (requires permission prompt, browser only, and a polygon dataset Malta doesn't ship cleanly).
- Personalised proposal scoring (we'd need a tagging model on proposals).
- An "alerts when a candidate in your district publishes something" feature.
