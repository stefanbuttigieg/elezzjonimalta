# News Ingestion & Detection Pipeline

A scheduled + on-demand process that scans 5 Maltese news sites, uses AI to detect election-relevant content (proposals, new candidates, electoral developments), and queues findings for staff review in the admin portal.

## Sources monitored
- timesofmalta.com
- independent.com.mt
- maltatoday.com.mt
- lovinmalta.com
- newsbook.com.mt

## How it works (user view)

1. **Automatic runs**: 4×/day (06:00, 11:00, 16:00, 21:00 Malta time) via `pg_cron`.
2. **Manual run**: a new admin page **"News monitor"** with a **"Run scan now"** button (admin-only, with optional per-source toggle).
3. Each run:
   - Discovers recent article URLs per source (sitemap / listing pages).
   - Skips URLs already seen (dedup table).
   - Fetches the article, extracts clean text (Firecrawl `scrape` → markdown).
   - Asks Lovable AI (`google/gemini-2.5-flash`) to classify and extract:
     - `kind`: `proposal` | `new_candidate` | `election_development` | `not_relevant`
     - structured fields (title, summary EN/MT, candidate name, party hint, district hint, proposal category, etc.)
     - `confidence` 0–1
   - Saves the finding to a `news_findings` table with status `pending`.
4. Admin reviews findings in **News monitor**:
   - Filter by source / kind / status / confidence.
   - For each finding: **Create proposal**, **Create candidate**, **Link to existing**, **Dismiss**, or **Mark reviewed**.
   - "Create…" pre-fills the existing proposal/candidate dialog with the AI-extracted fields and source URL.

## Database changes

New tables (RLS: staff read/write; no public access):

- `news_sources` — seeded with the 5 outlets (`id, slug, name, base_url, sitemap_url, enabled, last_scanned_at`).
- `news_articles` — dedup of fetched URLs (`id, source_id, url UNIQUE, title, published_at, fetched_at, content_hash, scan_status`).
- `news_findings` — AI output (`id, article_id, kind, confidence, title, summary_en, summary_mt, extracted jsonb, candidate_id nullable, proposal_id nullable, status: pending|accepted|dismissed|reviewed, created_at, reviewed_by, reviewed_at`).
- `news_scan_runs` — audit log (`id, started_at, finished_at, trigger: cron|manual, source_id nullable, articles_scanned, findings_created, error`).

## Server endpoints

- `src/routes/api/public/hooks/scan-news.ts` (POST) — triggered by `pg_cron`. Validates an internal `X-Cron-Secret` header (new `NEWS_CRON_SECRET`). Iterates enabled sources, calls Firecrawl, calls Lovable AI, writes rows. Caps per-run cost (e.g., 15 new articles per source per run).
- `src/server/newsScan.functions.ts` — `runNewsScan({ sourceIds? })` server function for the manual button (admin-only via `requireSupabaseAuth` + role check).
- Shared logic in `src/server/newsScan.server.ts` (Firecrawl client, AI prompt, Supabase admin writes).

## Admin UI

- New route `src/routes/admin.news.tsx` ("News monitor") + sidebar item in `src/routes/admin.tsx`.
  - Header: last run time, next scheduled run, **Run scan now** button (with per-source checkboxes).
  - Tabs: **Pending** / **Reviewed** / **Dismissed** / **All runs**.
  - Findings table: source · kind · confidence · title · published date · actions.
  - Row actions open existing Proposal/Candidate drawers prefilled from `extracted` jsonb.
- Dashboard card on `admin.index.tsx`: "Pending findings: N".

## AI & scraping

- **Firecrawl** (already connected — `FIRECRAWL_API_KEY` present): `scrape` with `formats: ['markdown']`, `onlyMainContent: true`. Sitemap discovery via `map` filtered to recent paths.
- **Lovable AI** via `LOVABLE_API_KEY`: `google/gemini-2.5-flash` (cheap, sufficient). Structured JSON output with a strict schema; reject non-JSON.
- Neutrality preserved: AI extracts facts only, never opinions; everything is staff-reviewed before publishing.

## Cron setup

`pg_cron` + `pg_net` job calling `https://elezzjonimalta.lovable.app/api/public/hooks/scan-news` 4×/day with the `X-Cron-Secret` header.

## Cost & safety controls

- Per-run hard caps: max 15 new articles/source, max 75 total.
- Skip URLs already in `news_articles`.
- Truncate scraped content to ~6k chars before sending to AI.
- All Firecrawl/AI errors logged to `news_scan_runs.error`, never throw mid-run.
- Manual run rate-limited to once per 60s per admin.

## Files to add / edit

Add:
- `supabase` migration: 4 new tables + RLS + seed `news_sources`.
- `src/server/newsScan.server.ts`
- `src/server/newsScan.functions.ts`
- `src/routes/api/public/hooks/scan-news.ts`
- `src/routes/admin.news.tsx`

Edit:
- `src/routes/admin.tsx` — add "News monitor" sidebar entry.
- `src/routes/admin.index.tsx` — add pending findings card.
- `CHANGELOG.md`, `README.md`.

Secret to add: `NEWS_CRON_SECRET` (random string, used by pg_cron call).

## Out of scope (can follow later)

- Auto-publishing without review.
- Sentiment analysis or partisan tone scoring (intentionally avoided — neutrality).
- Social media monitoring (Facebook/Twitter) — requires separate APIs.
