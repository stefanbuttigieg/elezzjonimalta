# SEO Optimisation + Admin Interface

## Semrush findings (snapshot)

- `elezzjoni.app` — Authority/Trust **0/100**, only 10 backlinks (all nofollow, spam). Effectively invisible to Google.
- Target keywords (`elezzjoni 2026`, `malta election 2026`, `kandidati elezzjoni`) have no Semrush data — niche/Maltese terms with low global volume but high local intent. Difficulty is effectively zero, so winning them is realistic with on-page SEO done right.
- Practical implication: focus on **on-page SEO + structured data + crawlability**. Backlink building is out of scope for this change.

## Part 1 — On-page SEO improvements (code)

1. **Per-route metadata audit.** Several leaf routes (`/parties-compare`, `/proposals`, `/themes`, `/community-proposals`, `/sitting-mps`, `/districts`) currently rely on root metadata. Add localised `head()` with unique `title`, `description`, `og:title`, `og:url`, canonical, and hreflang via `canonicalFor` + `hreflangAlternates`.
2. **JSON-LD per page type.** Add `BreadcrumbList` to `/candidates/$slug` and `/parties/$slug`; add `Person` schema for candidates and `PoliticalParty`/`Organization` for parties; `FAQPage` for `/faq`.
3. **Sitemap.** Add `/parties-compare`, `/community-proposals` (already in), and any new routes; ensure `lastmod` for proposals.
4. **Robots/headers.** Confirm noindex on `/admin`, `/auth`. Already covered.
5. **OG fallback.** Generate a clean default OG image (1200×630) with branding.

## Part 2 — Admin SEO interface

A new admin page at `/admin/seo` lets editors override metadata per route without code changes.

### Schema (migration)

```sql
create table public.page_seo (
  id uuid primary key default gen_random_uuid(),
  path text not null,           -- e.g. "/parties", language-agnostic
  lang text not null check (lang in ('en','mt')),
  title text,
  description text,
  og_image text,
  keywords text[],              -- target keywords (informational)
  noindex boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (path, lang)
);
alter table public.page_seo enable row level security;
-- public read so route head() can fetch overrides
create policy "page_seo readable" on public.page_seo for select using (true);
-- staff write
create policy "page_seo write admin" on public.page_seo for all
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'editor'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'editor'));
```

### Admin UI (`src/routes/admin.seo.tsx`)

- Table of all known public routes (derived from a static list mirroring `sitemap.xml.ts`'s `STATIC_PATHS`) × 2 languages.
- For each row: current title/description (with override badge if set), edit dialog to set title/description/og_image/keywords/noindex/notes.
- Search + filter by "has override / missing description / noindex".
- Read-only Semrush hint column (target keywords field) — purely a planning aid; no live API call (Semrush API key not configured in the app runtime).

### Wiring overrides into routes

- Add `src/lib/seoOverrides.ts` with `usePageSeo(path, lang)` (TanStack Query) that fetches `page_seo` row and a small `<SeoOverride>` component used in components when needed. For SSR-correct meta we also expose a `getPageSeo` server function used in the route's `loader`, then `head({ loaderData })` merges overrides over defaults.
- Pattern shown on 2–3 high-value routes (`/$lang/parties`, `/$lang/proposals`, `/$lang/candidates`); rest can be migrated incrementally.

## Part 3 — Out of scope (clarify)

- Live Semrush API in-app: requires `SEMRUSH_API_KEY` secret. Not added unless you confirm — current Semrush data shown above came from agent-side tools.
- Backlink building / outreach.
- Per-candidate/per-party metadata overrides (DB-driven from existing tables — already correct).

## Files

**Migration**
- `supabase/migrations/<ts>_page_seo.sql`

**Code**
- `src/lib/seoOverrides.ts` (+ `seoOverrides.functions.ts` server fn)
- `src/routes/admin.seo.tsx`
- `src/routes/$lang.parties-compare.tsx`, `$lang.themes.tsx`, `$lang.community-proposals.tsx`, `$lang.sitting-mps.tsx`, `$lang.districts.tsx` — add proper `head()`
- `src/routes/$lang.parties.index.tsx`, `$lang.proposals.tsx`, `$lang.candidates.index.tsx` — wire override loader
- `src/routes/$lang.candidates.$slug.tsx`, `$lang.parties.$slug.tsx` — add BreadcrumbList + Person/Org JSON-LD
- `src/routes/$lang.faq.tsx` — add FAQPage JSON-LD
- `src/routes/sitemap[.]xml.ts` — add `/parties-compare`
- `src/components/site/SiteHeader.tsx` — add "SEO" link in admin menu

## Confirm before I build

1. OK to skip live Semrush in the app (no `SEMRUSH_API_KEY` request), keeping the admin as an override + planning tool?
2. OK with the page list being derived from the static sitemap routes (not dynamic candidate/party slugs)?
