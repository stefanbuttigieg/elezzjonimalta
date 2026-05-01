# Elezzjoni Malta

A bilingual (English / Maltese) civic-tech web app to help Maltese voters make
informed decisions ahead of the general election. It brings candidates,
sitting MPs, parties, electoral districts, and policy proposals into one
searchable, comparable, and accessible place.

Live: <https://elezzjoni.app> · Repo: <https://github.com/stefanbuttigieg/> · Changelog: [CHANGELOG.md](./CHANGELOG.md)

> **Heads up:** the site was previously branded "Vot Malta" and is now
> **Elezzjoni**. All UI copy, legal pages, and translations have been updated.

---

## Purpose

Maltese election information is scattered across party sites, the Parliament
register, and news articles. Elezzjoni Malta consolidates it into a single,
neutral, source-cited reference so voters can:

- Discover who is running in their district.
- Compare candidates side by side on bio, party, district, and proposals.
- Read each party's positions and history.
- Browse the policy proposals being put forward this election cycle.
- Ask questions through an AI assistant grounded in the underlying data.

Everything is published in both English and Maltese.

---

## Main Pages

All routes are localised under `/en/...` or `/mt/...`.

| Route | Purpose |
| --- | --- |
| `/` → `/en` | Homepage: hero, countdown to election day, **13-district quick picker** |
| `/candidates` | Browse all published candidates with filters |
| `/sitting-mps` | Current sitting Members of Parliament |
| `/districts` | All 13 electoral districts |
| `/my-district/:number` | Candidates and incumbents in a chosen district, grouped by party |
| `/parties` | Party directory |
| `/parties/:slug` | Party detail: leadership, history, candidates, proposals |
| `/proposals` | Policy proposals across candidates and parties, with category filters |
| `/compare` | Side-by-side **candidate comparison** (up to 4 at a time) |
| `/ask` | AI assistant grounded in the database |
| `/resources` | Voter guides and external references |
| `/faq` | Bilingual voting FAQs synced from official sources |
| `/contact` | Contact details (via the maintainer's GitHub) |
| `/changelog` | Public release notes |
| `/admin` | Staff-only dashboard (requires login + role) |

---

## Key Features

### 13-District Quick Picker (Homepage)
The homepage shows quick-access buttons for **all 13 Maltese electoral
districts** (not just the first 8), so voters can jump straight to their
district from the landing page.

### Candidate Comparison
`/compare` lets you select up to 4 candidates and compare them on party,
district, incumbent status, electoral confirmation, bio, proposals, and
official links. Selections are encoded in the URL (`?ids=...`) so a
comparison can be shared.

**Comparison filter:** the picker only includes **published candidates** —
sitting MPs are excluded so the focus stays on the people standing in the
upcoming election.

### Bilingual Content (EN / MT)
Every page, label, district name, and most editorial content is available in
English and Maltese. Locale lives in the URL (`/en/...`, `/mt/...`).

### Admin: AI Assistant
The `/admin/assistant` workspace lets staff configure which data sources feed
the public AI assistant (`/ask`), reindex the knowledge base on demand
(all enabled sources or per source), edit the system prompt and model, and
review recent reindex runs with chunk counts and any errors. Retrieval uses
Postgres full-text search over a generated `tsvector` index on
`knowledge_chunks`, with an ILIKE fallback when the index is empty.

### Admin: News Monitor
The admin section includes a **News monitor** that scans Times of Malta, The
Malta Independent, MaltaToday, Lovin Malta, and Newsbook (4× daily via cron,
plus on-demand) and uses Lovable AI to detect proposals, newly listed
candidates, and key election developments. Findings are queued for staff
review with confidence scores and source links, and each can be **converted in
one click** into a new candidate, an update to an existing candidate, a new
proposal, or a new party — auto-linking the source URL and writing to the
admin audit log. Staff can also paste any article URL to scan it on demand.
The Convert dialog supports **AI auto-fill** — re-scraping the article and
pre-populating the target form (with valid party/district/candidate IDs from
existing records) — and lets staff create **multiple proposals from a single
article** in one batch save when the source contains several pledges.

### Admin: API Request Logging
The admin section includes an **API logs viewer** that records every call to
the public API endpoints (`/api/public/v1/candidates`, `/parties`,
`/districts`). Each entry captures method, endpoint, status code, response
time, query string, user-agent, and a SHA-256 hashed IP (for privacy).

- Logging is fire-and-forget and never delays the API response.
- Includes 429 rate-limit and 500 error responses.
- Visible to staff (read), deletable by admins.

### Admin: Audit Log
Every staff action on candidates, proposals, parties, and news findings is
recorded with actor, before/after state, and metadata, viewable at
`/admin/audit`.

### Public API (`/api/public/v1/*`)
Stable, read-only JSON endpoints for candidates, parties, and districts —
useful for journalists, researchers, and other civic-tech tools.

### Source-Cited Data
Candidate records carry source URLs and labels so claims can be traced back
to official documents, party sites, or the Maltese Parliament register.

### Role-Based Admin
Staff and admin roles are stored in a dedicated `user_roles` table and
enforced via Postgres RLS, so authorisation cannot be bypassed from the client.

### "Not Contesting 2026" Tag
Candidates who have publicly announced they will not contest the 2026
election are flagged with a **"Not contesting for 2026"** badge on candidate
cards and sitting-MP listings, alongside a link to the source announcement.
In the admin candidates table, the status column surfaces this directly
(e.g. "Sitting MP · not contesting 2026") instead of the default
"not yet 2026" label.

### Bilingual Voting FAQs
A public `/faq` page presents voter-facing questions and answers in both
English and Maltese, sourced from official references (Electoral
Commission via intmalta.com and PN's election FAQ). An admin-triggered
re-sync uses Firecrawl to scrape the source pages and Lovable AI to
extract Q&A pairs and translate Maltese-only sources into English.
Deduplication is handled via a deterministic question hash, and each
sync run is recorded with item counts and any errors. Staff can edit
content and switch entries between Draft / Published / Archived.

### Proposal Duplicate Detection & Merging
The admin proposals workspace flags potential duplicates (by normalised
title and by content similarity) and offers a guided merge flow that
keeps a chosen primary record and archives the others. Merges are
captured in the audit log with before/after state and the contributing
source URLs.

### Multiple Source URLs & Update History per Proposal
Each proposal can carry multiple labelled source URLs (in addition to
the primary one) and exposes an inline update history derived from the
admin audit log, so reviewers can see exactly when titles, descriptions,
categories or status changed and by whom.

### Configurable Columns in Admin Tables
The admin candidates table supports per-user column selection so staff
can hide or show fields (status, flags, leadership, district, etc.)
based on what they're working on; the choice persists across sessions.

### Global Search & Command Palette
A single search experience covers **candidates, parties, proposals, and
electoral districts** across every page of the site.

- **Command palette:** press `⌘K` (macOS) or `Ctrl+K` (Windows / Linux)
  anywhere to open an instant search overlay. Live-queries the database with
  arrow-key navigation, Enter to jump to a result, and a "See all results"
  fallback that opens the full search page.
- **Reachable from every viewport:** the site header shows a search button
  on small and medium screens, an inline search input at `xl`+, and the
  mobile menu drawer includes a "Search" entry — all open the same palette.
- **Full results page** at `/search` with filter tabs (All, Candidates,
  Districts, Parties, Manifestos, Proposals) and grouped, ranked results.
- **Direct linking:** candidate hits open the candidate detail page, party
  hits open the party page, and district hits open the
  `/my-district/:number` detail view.

### Keyboard Shortcuts
Power users can navigate the site without a mouse. Press `?` anywhere to open
the in-app shortcut reference. Available shortcuts:

| Key | Action |
| --- | --- |
| `?` | Show / hide keyboard shortcuts dialog |
| `⌘K` / `Ctrl+K` | Open the global command palette |
| `/` | Focus the search field |
| `h` | Go to home |
| `c` | Go to candidates |
| `d` | Go to districts |
| `p` | Go to parties |
| `r` | Go to proposals |
| `m` | Go to sitting MPs |
| `x` | Go to compare |
| `a` | Go to Ask AI |
| `l` | Toggle language (EN ↔ MT) |
| `Esc` | Close the open dialog |

Single-key shortcuts are disabled while typing in inputs, textareas, or
contenteditable fields, and ignore key combinations with `Ctrl`, `Cmd`, or
`Alt` (so they don't conflict with `⌘K`).

---

## Tech Stack

- **Framework:** TanStack Start v1 (React 19, Vite 7, file-based routing, SSR)
- **Styling:** Tailwind CSS v4 with semantic design tokens in `src/styles.css`
- **UI primitives:** Radix UI + shadcn-style components
- **Backend:** Lovable Cloud (managed Postgres, Auth, Storage, Edge Functions)
- **Deployment target:** Cloudflare Workers (edge SSR)

---

## Setup

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.1 (recommended) or Node.js ≥ 20
- A connected Lovable Cloud project (Lovable generates `.env` automatically
  when you open the project in the editor)

### 1. Install dependencies
```bash
bun install
# or: npm install / pnpm install
```

### 2. Environment variables
The app reads its backend config from Vite-style environment variables. When
working inside Lovable these are managed for you in `.env` and must not be
edited by hand. For local development outside Lovable, create a `.env` file
at the project root with:

```bash
# Public (browser-visible) — required
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"

# Server-only (used by createServerFn handlers / SSR) — required for
# server-side reads, auth middleware, and admin operations
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key — server only, never expose>"
```

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Keep it server-only — never
  prefix it with `VITE_` and never import it from client code.
- The Lovable AI gateway and the FireCrawl connector are configured through
  Lovable Cloud secrets (`LOVABLE_API_KEY`, `FIRECRAWL_API_KEY`) and do not
  need to be set locally unless you are exercising those code paths.
- Do **not** edit `.env`, `src/integrations/supabase/client.ts`, or
  `src/integrations/supabase/types.ts` by hand — they are regenerated.

### 3. Run locally
```bash
bun run dev          # Vite dev server (TanStack Start, SSR-enabled)
bun run build        # production build (Cloudflare Workers target)
bun run build:dev    # development-mode build (source maps, no minify)
bun run preview      # preview the production build
bun run lint         # ESLint
bun run format       # Prettier
```

The dev server prints a local URL (typically <http://localhost:5173>). Routes
are file-based under `src/routes/` and the route tree
(`src/routeTree.gen.ts`) is regenerated automatically — do not edit it.

### 4. Deployment

The app targets **Cloudflare Workers** (edge SSR) via
`@cloudflare/vite-plugin` and is published through Lovable.

- **Frontend changes** (UI, client code, styles): deploy by clicking
  **Publish → Update** in the Lovable editor.
- **Backend changes** (database migrations, edge functions, server
  functions): deploy automatically on save — no manual publish step needed.

Stable URLs:
- Production: <https://elezzjoni.app> · <https://www.elezzjoni.app>
- Lovable preview: `https://project--<project-id>-dev.lovable.app`
- Lovable production: `https://project--<project-id>.lovable.app`

### Project structure
```
src/
  routes/                  # file-based routes (TanStack Start)
    $lang.index.tsx        # homepage
    $lang.compare.tsx      # candidate comparison
    $lang.my-district.$number.tsx
    api/public/v1/         # public JSON API
    admin.*.tsx            # staff dashboard
  components/
    site/                  # site-specific components (LocalityPicker, header, footer, …)
    ui/                    # shadcn-style primitives
  i18n/                    # EN / MT translations
  integrations/supabase/   # auto-generated client & types (do not edit)
  styles.css               # Tailwind v4 + design tokens
supabase/
  migrations/              # database migrations
```

---

## Contributing

Issues, corrections, and data contributions are welcome via GitHub:
<https://github.com/stefanbuttigieg/>

When submitting candidate or party data, please include a public source URL
so it can be cited.

---

## License

See repository for license details.
