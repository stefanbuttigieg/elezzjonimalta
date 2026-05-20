# Changelog

All notable changes to Elezzjoni Malta are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-05-20

### Performance
- **Proposals page overhaul.** The public `/proposals` page now uses
  true server-side pagination via Supabase `range()` with an exact
  count, replacing the previous "fetch up to 1000 then slice" pattern
  that caused the loading indicator to stall and capped results at
  1000. Per-page selector (25 / 50 / 100 / 200 / 500 / 1000 / All)
  mirrors the admin page, and `page` / `perPage` are encoded in the
  URL so pagination state survives refresh and back/forward.
- **Similarity matching scoped to the visible page.** The duplicate /
  related-proposal index now compares only the proposals on screen
  against the lightweight index pool instead of cross-comparing the
  entire dataset, cutting work from ~1.7M comparisons per load to
  ~65K.
- **Three-layer caching for proposals.** A 5-minute in-memory cache
  for filter-independent lookups (parties, candidates, categories,
  index pool), TanStack Router SWR caching (`staleTime: 60s`,
  `gcTime: 10m`) so repeat visits and back/forward render instantly,
  and an edge cache header
  (`public, max-age=0, s-maxage=60, stale-while-revalidate=300`) for
  SSR HTML.
- **Database indexes for proposal queries.** Added a composite index
  on `(status, created_at DESC)`, a partial index for published +
  non-merged proposals, btree indexes on `party_id`, `candidate_id`,
  `merged_into_id` and `category`, and `pg_trgm` GIN indexes on
  `title_en`, `title_mt`, `description_en`, `description_mt` to make
  `ILIKE` text search fast at scale.

### Added

- **SEO foundations.** New `/robots.txt` (allows public, disallows
  `/admin`, `/auth`, `/api`) and a dynamic `/sitemap.xml` server route
  that enumerates every public page in both locales plus all published
  candidates, parties and the 13 districts (with `lastmod` from each
  row's `updated_at`). The site root now ships JSON-LD for
  `Organization` and `WebSite` (with a `SearchAction` pointing at
  `/en/search`), `og:site_name`, and default `og:image` /
  `twitter:image`. Hreflang alternates on the `$lang` layout are now
  absolute URLs (Google requirement). Key leaf routes — `/`,
  `/candidates`, `/candidates/:slug`, `/parties`, `/parties/:slug`,
  `/proposals` — emit `<link rel="canonical">`, `og:url` and
  `twitter:url`; candidate and party detail pages also set
  `og:type: profile`. Admin routes carry
  `<meta name="robots" content="noindex, nofollow">` so the staff UI
  stays out of search results. A small `src/lib/seo.ts` helper
  centralises `SITE_URL`, canonical and hreflang construction for
  future routes.
- **Candidate categorisation: profession + position kind.** Candidates
  can now be tagged with a standardised **ISCO-08 profession code**
  (~120 curated occupations from the ILO classification) and a
  **profession bucket** (~40 plain-language groupings such as
  *lawyer*, *doctor*, *entrepreneur*, *teacher*, *trade unionist*) for
  fast filtering. Two new tables — `profession_codes` and
  `profession_buckets` — back the picker, and the `candidates` table
  gained `profession_code` / `profession_bucket` foreign keys. The
  candidate editor exposes an ISCO combobox with title search and an
  **Apply ISCO suggestion** button that calls Lovable AI to propose a
  code from the candidate's bio. Cabinet/parliamentary roles on
  `candidate_positions` are now structured via a new `position_kind`
  enum (`minister`, `parliamentary_secretary`, `prime_minister`,
  `deputy_pm`, `opposition_leader`, `speaker`, `whip`,
  `committee_chair`, `shadow_minister`, `cabinet_member`, `mep`,
  `other`) with a separate `portfolio` text field, plus a
  `backfillPositionKinds` server function that uses Gemini to classify
  legacy free-text titles in batches.
- **Local council experience schema.** New
  `candidate_local_council_terms` table (with a role enum covering
  mayor, deputy mayor, councillor, …) plus `local_council_imports` and
  `local_council_import_rows` staging tables to support the upcoming
  `electoral.gov.mt` scraper (all council elections since 1993). RLS
  is enabled across the new tables.
- **Candidate experience summary view.** New
  `candidate_experience_summary` view aggregates parliament, cabinet
  and local-council history per candidate (e.g.
  `has_ever_been_minister`, `local_council_terms_count`) so public
  filters and detail pages can query a single source of truth.
- **Proposal list: column picker + horizontal scroll on mobile.**
  `/admin/proposals` is now wrapped in a horizontally scrollable shell
  on narrow screens and exposes a column-visibility popover so staff
  can pick which columns (including the new geotag column) to show.

### Added (previous batch — 2026-05-12)

- **Community proposals (NGOs, unions, individuals).** A new public page
  at `/community-proposals` lists election wishlists authored by
  non-party voices — NGOs, unions, businesses, academics, faith groups
  and individuals — each linked back, where applicable, to the matching
  party proposal so voters can see who is echoing whose ideas. Two new
  admin workspaces back it: `/admin/community-authors` (slug, kind, bio,
  logo, website, source URL, status) and `/admin/community-proposals`
  (bilingual title/description, category, source URL, links to party
  proposals, status). Schema covers a `community_authors` table, a
  `community_proposals` table and a `community_proposal_links` join.
- **Community proposals import drawer.** Admins can ingest a community
  author's wishlist from a URL or uploaded PDF/HTML file (EN, MT, or
  both). The drawer streams extraction progress, then opens a review
  table with per-row create/update/skip decisions, fuzzy-match
  suggestions against the same author's existing entries (trigram
  similarity via a `find_similar_community_proposals` SQL helper) and
  a single batch apply step. Runs are persisted in `community_imports`
  with archived source files for traceability.
- **Manifesto imports admin (`/admin/manifesto-imports`).** New
  job-list page for the manifesto importer, with live status, stage,
  page count, progress bar and per-row links back to the source PDF,
  auto-refreshing every few seconds while any job is running. Each
  row exposes **Retry** (re-runs a failed/cancelled job) and **Cancel**
  (frees a stuck "Queued…" job) actions wired to the new
  `retryManifestoImport` / `cancelManifestoImport` server functions.
  The same retry/cancel controls are surfaced inside the import drawer.
- **Import progress bar UI + error-detail panel.** Both the manifesto
  and community importers now expose a true 0–100 % progress bar driven
  by a new `progress` column, plus a structured error panel
  (`ImportErrorDetails`) that shows the failure message, the stage at
  failure, source URL / file path, a collapsible stack trace, a
  copy-to-clipboard "full dump", and a chronological log of stages and
  percentages — all without leaving the drawer.
- **Background processing for imports (Cloudflare `waitUntil`).** A
  new `runInBackground` helper hands long-running import promises to
  the platform's `waitUntil` so jobs no longer get stuck at "Queued…"
  when the originating request returns. Falls back to unawaited
  execution in Node dev environments.
- **EC nomination confirmation tool (`/admin/candidates/confirm-ec`).**
  Staff can paste an Electoral Commission nominations list for a
  district and have the tool fuzzy-match each name against existing
  candidates (token Jaccard score), confirm matches in bulk, and:
  - **Link candidates already on file in another district** to the
    current district in one click (writes a `candidate_districts` row
    for 2026 and sets `commission_confirmed`).
  - **Create brand-new candidates inline** from unmatched names —
    enter a party, save, and the row is inserted with a unique slug,
    `commission_confirmed = true`, `imported_from = 'electoral-commission'`,
    and a 2026 district link, all without leaving the page.
  Each candidate now also carries a `commission_confirmed_at`
  timestamp.
- **Multi-URL paste-and-scan in News monitor.** The "Scan a URL now"
  panel now accepts one or more URLs (newline / comma / space
  separated) and runs them through the same Firecrawl + AI classify
  pipeline sequentially, reporting a per-URL ✓ / ✗ summary with
  classification kind and confidence in a scrollable result pane.
- **Multi-candidate creation from a single news article.** The News
  monitor's Convert dialog now lets admins add and remove multiple
  candidate rows (alongside the existing multi-proposal flow) when a
  single article announces several nominations at once. All conversions
  share the source URL and are saved in one batch.
- **Multi-select filters on the admin candidates table.** The status,
  party, district, leadership and flag filters now each accept multiple
  values via a `MultiSelectFilter` popover, with an "All …" reset per
  facet, a "Clear filters" button and a live "n of m" result count.
- **Aggregate "Last updated" timestamps across the site.** The homepage
  stats strip surfaces the most recent `updated_at` across candidates,
  proposals, parties, districts and FAQs, and "Last updated" badges
  now appear on the candidates index, proposals index, districts list,
  district detail pages and each party's promises pane on the district
  page so voters can see data freshness at a glance.
- **Candidate tags on district cards.** Each candidate tile inside a
  district page now displays inline badges for **Leader**, **Deputy
  Leader** and **EC-confirmed**, alongside the existing
  incumbent / confirmed / prospective status text.
- **Initials fallback for broken candidate photos.** A new
  `CandidateAvatar` component renders a coloured initials chip (or an
  icon, configurable) when a candidate's `photo_url` is missing or
  fails to load, replacing the previous broken-image placeholder
  across candidate listings, district pages and detail views.

### Changed
- **News monitor "Scan a URL" → "Scan URLs".** The single-URL input was
  replaced with a multi-line textarea and a result pre-pane; the legacy
  Enter-to-submit shortcut was removed in favour of the explicit
  "Scan URLs" button.

### Fixed
- **`/admin/candidates/confirm-ec` routing.** Resolved a routing
  collision so the EC confirmation page is reachable as a sibling of
  `/admin/candidates` (uses the `admin.candidates_.confirm-ec` flat
  route convention).

## [2026-05-08]

### Added
- **Resources admin (CRUD).** New `/admin/resources` workspace lets
  staff create, edit, reorder and publish/unpublish voter resources
  (icon, bilingual title/description, link, category). The public
  `/resources` page now reads from the database, with a seeded entry
  for <https://elections.lovinmalta.com/>.
- **Candidate photo manager with square cropping.** The candidate
  editor now ships a dedicated photo field that uploads to a public
  `candidate-photos` storage bucket and opens a crop dialog
  (`react-easy-crop`) for zoom, 90° rotation, and a fixed 1:1 square
  output (800×800 JPEG). Existing photos can be re-cropped or replaced
  via URL.
- **Proposal sources: inline previews.** Source attachments now render
  image thumbnails inline, social URLs (YouTube, TikTok, X, Instagram,
  Facebook) get a live embed, and every link/social entry shows an
  Open Graph preview card with favicon, site name, title, description
  and thumbnail (fetched server-side and cached per session).
- **News monitor: source URL captured on convert.** Converting a
  finding into a new proposal from the manual-scan / Convert dialog
  now automatically attaches the article URL as one of the proposal's
  sources.

### Added (previous)
- **District page: fair, searchable party promises.** The "What parties
  here are promising" sidebar on each district page now loads the latest
  proposals per party in parallel and interleaves them round-robin so
  every party with candidates in the district is represented when
  proposals exist. A new search box, per-party filter chips with counts
  (including dashed chips for parties with no proposals yet),
  result-count, fairness caption, and "Compare party platforms" shortcut
  help voters explore promises. The "See all proposals" link now carries
  the active search and party filter into the proposals page.
- **Admin proposals: extended filtering.** New filter controls in the
  proposals admin (party, category, status, linked-to, translation
  state, AI-categorised state, plus merged toggle) with a result count
  and a one-click reset.
- **Public Themes navigation.** Added a top-level "Themes" / "Temi"
  link with a network icon to the public site header.
- **Proposal attachments & social posts.** Each proposal can now hold
  file attachments (uploaded to a public bucket, max 20 MB) and labelled
  social-media post links (Facebook, Instagram, X, TikTok, LinkedIn,
  YouTube, Threads) alongside plain source links.
- **Candidate auto-fill from web + custom URLs.** Candidates can be
  auto-filled from web search, parliament.mt (for incumbents), and
  optional admin-supplied URLs (party site, electoral commission,
  trusted news). Both per-candidate (in the editor drawer) and bulk
  (from the table action bar) flows are available; only empty fields
  are written, every run is captured in the audit log.
- **Candidate profile completion meter.** Each candidate row and the
  editor drawer header show a colour-coded percentage of profile
  completeness (covering core fields, bio, contacts, socials, photo,
  and required custom fields), with the missing fields surfaced on
  hover and inside the editor.
- **Duplicates admin: dismiss / restore clusters.** Suggested duplicate
  clusters can be dismissed (and restored) from the admin Duplicates
  page; dismissals persist locally, are excluded from merges, and now
  also write a `duplicate_cluster_dismiss` / `duplicate_cluster_restore`
  entry to the admin audit log. Each clustered proposal also displays
  its party (with brand colour) and linked candidate.
- **Admin proposals: multi-select & batch actions.** The proposals admin
  table now has per-row checkboxes plus a "select all" header checkbox.
  When one or more rows are selected, a bulk action bar appears with
  one-click status changes (Draft / Pending review / Published /
  Archived) and a bulk Delete action. Updates and deletes go through a
  single Supabase batch call.
- **Telegram bot: shareable site links.** `/candidate` and `/district`
  responses now include direct links back to the matching candidate or
  district page on the site, and the site footer links to the bot at
  <https://t.me/elezzjonibot>.
- **AI Assistant: authoritative facts injection.** The chat Edge Function
  now builds a live "facts sheet" from the database on every request
  (party leaders, deputy leaders, election date) and injects it as a
  high-priority system message so leadership questions can no longer
  fall back to outdated training data. The same override applies to the
  Telegram `/ask` command.
- **AI Assistant: district intent boost.** Queries that mention a
  district (e.g. "district 12") trigger a direct lookup against
  `candidate_districts` for the 2026 cycle and inject the structured
  candidate list into the chat context.

### Fixed
- **Telegram bot: district candidate mismatch.** Resolved a mismatch
  where `/district 12` returned a different candidate set than the
  public `/my-district/12` page. The bot now applies the same filtering
  used on the site (sitting MPs included, unconfirmed incumbents
  hidden, `published` status required for new candidates).

## [2026-05-01]

### Added
- **Proposals: AI-generated bilingual translation.** When a proposal is
  missing its English or Maltese title/description, admins can trigger a
  one-click AI translation (via the Lovable AI Gateway) from the proposal
  editor to fill in the missing language.
- **Proposals: multiple categories per proposal with AI suggestions.**
  Each proposal can now be tagged with multiple categories, and the editor
  surfaces AI-generated category suggestions based on its title and
  description.
- **Manifesto Import: PDF preview pane.** The Review step of the
  Manifesto Import drawer now shows a split layout — the extracted
  proposals table on the left and a live PDF viewer on the right that
  jumps to the source page for the selected row, with the AI's verbatim
  quote displayed above the PDF for side-by-side verification.
- **Candidate photo finder.** Admins can retrieve missing candidate
  portraits automatically. A bulk "Find missing photos" action and a
  per-row "Find photo" button use Firecrawl + Gemini to search trusted
  sources (parlament.mt, gov.mt, Times of Malta, etc.), verify the URL
  returns a valid image, and write the result to the candidate record
  with an audit log entry. Social-media CDN URLs are blocked to avoid
  expiring links.

### Changed
- **Voting FAQs: English translation is now on-demand.** The FAQ sync no
  longer auto-translates Maltese sources to English on import. Maltese-only
  rows are saved as-is and staff can trigger an AI "Translate" action per
  row (or from the edit drawer) when needed. The public `/faq` page falls
  back to the available language when one side is missing.

### Fixed
- **Disclaimers admin: missing QueryClient.** Resolved a "No QueryClient
  set" runtime error when opening the disclaimers workspace by ensuring
  the React Query provider wraps the admin routes.

### Previously added in this release
- **News Monitor → Convert to Action: AI auto-fill.** The Convert dialog in
  `/admin/news` has a new "Auto-fill with AI" button that re-scrapes the
  source article and uses Gemini (via the Lovable AI Gateway) to populate the
  target form — Candidate, Party, or Proposal. Existing parties, districts,
  and candidates are passed as lookup tables so the AI returns valid UUIDs
  instead of hallucinating new entities, and the assistant can suggest
  switching the target type when the article is a better fit elsewhere.
  Fields the user has already typed are preserved.
- **News Monitor → Convert to Action: multiple proposals per article.** The
  "New proposal" target now accepts a batch — admins can add and remove
  proposal rows in the same dialog, and the auto-fill flow returns a
  `proposals` array when an article contains multiple distinct pledges.
  Server-side insert is a single batch write with the shared source URL.
- **AI Assistant admin (`/admin/assistant`).** New workspace to configure data
  sources (candidates, parties, proposals, voting FAQs, districts, news
  findings), reindex the knowledge base on demand (all enabled or per source),
  edit the assistant's system prompt and model, and review recent reindex runs
  with chunk counts and errors.
- **Paste-a-URL news scan.** Admins can paste any article URL into
  `/admin/news` and run it through the same Firecrawl scrape + Lovable AI
  classify pipeline used by the scheduled scans, with the result queued for
  review immediately.
- **Voting eligibility CTA on the landing page.** A bilingual call-to-action
  links voters to the official Electoral Commission register at
  electoral.gov.mt/electoral-registers.
- **Dynamic stats strip on the landing page.** Live counts of confirmed
  candidates, parties, proposals, districts, sitting MPs, published FAQs and
  a days-to-election countdown — each card linking to the relevant detail
  page.
- **District candidate counts on the landing-page map.** The interactive
  Malta districts map now shows the number of confirmed 2026 candidates per
  district.

### Changed
- **AI Assistant retrieval switched from vector embeddings to Postgres
  full-text search.** The Lovable AI Gateway no longer exposes an embeddings
  endpoint, so the indexer now stores plain text chunks and the chat function
  ranks them with `ts_rank` over a generated `tsvector` column (GIN-indexed).
  Reindexing no longer fails with "invalid model" errors.

### Previously in this release
- **Bilingual voting FAQs (`/faq`).** New public page with searchable,
  accordion-style questions grouped by source, available in English and
  Maltese, with FAQPage JSON-LD for SEO. Content is sourced from
  intmalta.com (Electoral Commission, auto-translated from Maltese) and
  pn.org.mt (EN + MT). Added to the main site navigation.
- **Admin: voting FAQ sync.** New `/admin/voting-faqs` workspace with a
  per-source and bulk re-sync button. Firecrawl scrapes the source pages,
  Lovable AI extracts Q&A pairs and translates Maltese-only entries into
  English, and a deterministic question hash deduplicates items across
  re-syncs. Each sync run is recorded with item counts, errors, and
  status (Draft / Published / Archived) is editable per entry.
- **Multiple source URLs per proposal** with labels and notes, managed
  from the proposal editor drawer in the admin proposals workspace. The
  original `source_url` is preserved as the "Primary source URL" and
  back-filled into the new `proposal_sources` table.
- **Proposal update history.** The proposal editor now shows a
  chronological diff of tracked fields (title, description, category,
  status, etc.) sourced from the admin audit log.
- **Proposal duplicate detection & guided merge.** New
  `/admin/duplicates` view flags potential duplicates by normalised
  title and content similarity; the merge flow keeps a chosen primary
  record, archives the others, and records the action in the audit log
  with before/after state and contributing source URLs.
- **Configurable columns in admin candidates table.** Per-user column
  visibility (status, flags, leadership, district, etc.) is persisted
  across sessions.

### Changed
- **Admin candidates status column** now shows "Sitting MP · not
  contesting 2026" for sitting MPs flagged as not contesting the 2026
  election, instead of the default "not yet 2026" label.

## [Earlier Unreleased] — 2026-04-29

### Added
- **Admin News monitor** — automated scanner that ingests articles from Times
  of Malta, Malta Independent, MaltaToday, Lovin Malta, and Newsbook (4× daily
  via cron, plus on-demand "Run scan now"). Detects proposals, newly listed
  candidates, and key election developments using Lovable AI, then queues them
  for staff review with confidence scores, source links, and per-source filters.
- **Convert findings into actions.** Each news finding now has a "Convert to
  action" button that opens a dialog to:
  - **Create a new candidate** (with party + district + bio, pre-filled from
    extracted entities and source URL)
  - **Update an existing candidate** (party, district, bio, notes)
  - **Create a new proposal** (title, description, category, party/candidate
    attribution)
  - **Create a new party** (name, short name, color, website, description)
  All conversions auto-link the source article, mark the finding as reviewed,
  and write to the admin audit log.
- **Admin audit log** — every staff action on candidates, proposals, parties,
  and news findings is recorded with actor, before/after state, and metadata,
  viewable at `/admin/audit`.
- **Authenticated server-function fetch interceptor** — global fetch wrapper
  that injects the current Supabase access token into all `/_serverFn/` calls
  so admin server functions run with the correct user identity.
- **Manually queued proposals** sourced from recent campaign coverage:
  - **PN**: minimum-wage stipend for healthcare students; 25% increase in
    post-secondary student stipends.
  - **PL**: expand Gozo Channel fleet to five ships by 2029; new Malta–Gozo
    electricity interconnector; modernise all schools in Gozo.

### Earlier in this release

### Added
- **Global command palette (⌘K / Ctrl+K)** — a global search overlay
  available from every page. Live-queries candidates, parties, proposals,
  and **districts**, with arrow-key navigation, Enter to jump, and a
  "See all results" fallback that opens the full search page.
- **Global search now reachable from every viewport.** The site header
  shows a search button at all breakpoints below `xl` (the existing inline
  search input remains at `xl`+), and the mobile menu drawer includes a
  "Search" entry. All entry points open the same command palette.
- **District results in global search.** Both the command palette and the
  `/search` page now return matching electoral districts (by name or
  localities) and link directly to the district detail page
  (`/my-district/:number`). A new "Districts" filter tab was added to the
  search results page.
- **Candidate results link to candidate detail pages.** The global search
  results page previously routed candidate hits to the candidates index;
  they now link straight to `/candidates/:slug`.
- **Keyboard shortcuts** for power users: `?` opens a help dialog listing all
  shortcuts; `⌘K` / `Ctrl+K` opens the command palette; `/` focuses search;
  `h/c/d/p/r/m/x/a` jump to home, candidates, districts, parties, proposals,
  sitting MPs, compare, and Ask AI; `l` toggles language; `Esc` closes the
  dialog. Shortcuts are disabled while typing in inputs and respect
  modifier keys.
- **PN proposals (4 new, maritime set):** maritime-related courses in
  secondary schools; proper stipend for Maritime MT students with MCAST
  resource-sharing; splitting Transport Malta into three authorities (land,
  sea, air); strengthening the maritime sector through AI, LNG, green fuels
  and digital shipping. Sourced from MaltaToday coverage of the second batch
  of PN campaign proposals.
- **Party: Imperium Europa** added to the parties directory, with candidate
  **Eman Cross**, sourced from MaltaToday coverage of the far-right party's
  decision to contest the 2026 general election.
- **Party: Aħwa Maltin** added to the parties directory, led by Iris Vella,
  with the slogan _"Malta For The Maltese" / "Malta Għall-Maltin"_. The party
  has announced it will contest all 13 districts in the 2026 election.
- **PN proposal: National Healthcare Park** — a Nationalist Party proposal for
  a dedicated healthcare park focused on rehabilitation, early intervention,
  and post-hospital recovery.
- **PL proposals (6 new):** Transfer of social-security contributions between
  couples; +€50/week pension increase; free therapy for children; +28 days
  additional leave for new parents returning to work; 6 months of paid
  parental leave; "Our Next Home" first-time-buyer benefits for second-time
  families. All entered bilingually with notes on how each was framed in the
  PL 2026 campaign.
- **"Not contesting for 2026" tag** displayed on candidate cards and
  sitting-MP listings, with a source link to the announcement.

### Changed
- **Rebrand:** "Vot Malta" renamed to **"Elezzjoni"** across the site
  (legal pages, navigation, dictionaries, admin, auth, candidate and district
  pages).

### Notes
- All new candidate and proposal records carry public source URLs so claims
  can be traced back to the originating article or party site.
