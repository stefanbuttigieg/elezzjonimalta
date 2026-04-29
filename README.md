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

### Admin: API Request Logging
The admin section includes an **API logs viewer** that records every call to
the public API endpoints (`/api/public/v1/candidates`, `/parties`,
`/districts`). Each entry captures method, endpoint, status code, response
time, query string, user-agent, and a SHA-256 hashed IP (for privacy).

- Logging is fire-and-forget and never delays the API response.
- Includes 429 rate-limit and 500 error responses.
- Visible to staff (read), deletable by admins.

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

### Keyboard Shortcuts
Power users can navigate the site without a mouse. Press `?` anywhere to open
the in-app shortcut reference. Available shortcuts:

| Key | Action |
| --- | --- |
| `?` | Show / hide keyboard shortcuts dialog |
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
| `Esc` | Close the shortcuts dialog |

Shortcuts are disabled while typing in inputs, textareas, or contenteditable
fields, and ignore key combinations with `Ctrl`, `Cmd`, or `Alt`.

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
