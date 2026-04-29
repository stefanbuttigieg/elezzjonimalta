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
- [Bun](https://bun.sh) (recommended) or Node 20+
- A connected Lovable Cloud / Supabase project (the `.env` is generated for
  you when you open the project in Lovable)

### Install
```bash
bun install
```

### Environment
The following variables are required and are managed automatically by Lovable
Cloud:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Do **not** edit `.env`, `src/integrations/supabase/client.ts`, or
`src/integrations/supabase/types.ts` by hand — they are regenerated.

### Run locally
```bash
bun run dev          # start Vite dev server
bun run build        # production build
bun run preview      # preview the production build
bun run lint         # eslint
bun run format       # prettier
```

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
  integrations/supabase/   # auto-generated client & types
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
