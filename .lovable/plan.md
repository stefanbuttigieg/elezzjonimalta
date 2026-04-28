## Malta Elections 2026 — Candidate Research Tool

A bilingual (English / Maltese), public, unbiased directory of candidates for Malta's 30 May 2026 general election. Visitors browse by district and party, view candidate profiles with incumbents' parliamentary history, and ask a neutral AI assistant in either language. Editors curate content with on-demand AI assistance. Includes a public read-only API and full legal/policy pages.

---

### Bilingual experience (EN / MT)

- URLs are language-prefixed: `/en/...` and `/mt/...`. `/` redirects based on browser language and remembers the choice.
- Persistent **EN | MT** toggle in the header and footer; switching preserves the current page. `<html lang>` and hreflang alternates set per route.
- All UI strings translated via static dictionaries.
- Candidate-supplied content stored in its original language. Cross-language views show an inline **AI translation** with a "view original" toggle. Editors can save a verified human translation that overrides the AI version.
- AI assistant detects question language and replies in the same language.

---

### Public site

**Home (`/{lang}`)** — Hero, countdown to 30 May 2026, search, entry points (Districts, Parties, Sitting MPs, Compare, Ask AI).

**Districts (`/{lang}/districts`, `/{lang}/districts/$id`)** — Grid of Malta's 13 districts (sourced from electoral.gov.mt). District page: localities, candidates filterable by party.

**Parties (`/{lang}/parties`, `/{lang}/parties/$slug`)** — PL, PN, ADPD, Momentum, Independents (extensible). Logo, color, manifesto, candidates grouped by district.

**Candidate profile (`/{lang}/candidates/$slug`)**
- Header: photo, name, party badge, district(s), "Sitting MP" badge, electoral.gov.mt verification badge.
- Sections: bio + key positions; contact & socials (FB, X, website); **parliamentary history** for incumbents (legislatures, ministerial/shadow roles, committees, PQ + speech counts, timeline, parlament.mt links); **recent parliamentary activity** (latest PQs and speeches with links); notable quotes; podcast appearances (link + on-demand AI summary); news mentions; sources list.
- Per-block language toggle when a translation exists. "Ask the AI assistant" button.

**AI Assistant (`/{lang}/ask`, embedded on candidate pages)** — Streaming chat with strict neutrality (cites sources, refuses vote recommendations, surfaces multiple viewpoints). RAG over candidates, parties, manifestos, quotes, news mentions, podcast summaries, and parliamentary activity. Auto-detects question language. Compare mode for 2–4 candidates side-by-side.

**Compare (`/{lang}/compare`)** — Side-by-side comparison.

**Legal & policy pages (bilingual, linked from footer)**
- **Terms of Use** (`/{lang}/terms`)
- **Privacy Policy** (`/{lang}/privacy`) — what data we collect (analytics, AI assistant queries, API usage), legal basis under Maltese/EU GDPR, retention, rights, contact.
- **Cookie Policy** (`/{lang}/cookies`) — cookie list (essential, preference, analytics), purposes, durations, opt-out. Paired with a first-visit cookie consent banner controlling non-essential cookies.
- **Accessibility Statement** (`/{lang}/accessibility`) — WCAG 2.1 AA conformance target, known limitations, feedback contact, in line with Web Accessibility Directive expectations.
- **About / Methodology** (`/{lang}/about`) — who runs this, sources, neutrality commitments, public changelog.
- **Contact** (`/{lang}/contact`) — corrections, takedown requests, accessibility feedback.

---

### Public API + developer portal

**Read-only REST API** at `/api/v1/...`:
- `GET /api/v1/parties`, `/api/v1/parties/{slug}`
- `GET /api/v1/districts`, `/api/v1/districts/{id}`
- `GET /api/v1/candidates` (filter by district, party, incumbent, language), `/api/v1/candidates/{slug}`
- `GET /api/v1/candidates/{slug}/quotes`, `/podcasts`, `/news-mentions`
- `GET /api/v1/candidates/{slug}/parliamentary-questions`, `/speeches`, `/roles`
- All responses include `language` of stored content and a `translations` map where an AI/human translation exists.
- Versioned, paginated (cursor-based), JSON only.

**API keys**
- Free, email-based registration at `/{lang}/developers`. Confirm email → key issued. Self-serve dashboard to view key, regenerate, see usage stats and rate-limit headroom.
- Per-key rate limit (e.g. 60 req/min, 10k req/day); per-IP limit for unauthenticated/abusive traffic. `X-RateLimit-*` headers on every response.
- Auth via `Authorization: Bearer <key>` or `?api_key=` query.

**Documentation**
- OpenAPI 3 spec auto-generated from the route definitions, served at `/api/openapi.json`.
- Interactive docs at `/{lang}/developers/docs` rendered with **Scalar** (modern, fast, accessible). Try-it-now requests use the developer's own key.
- Bilingual developer landing page at `/{lang}/developers` explaining purpose, terms, attribution requirement, and quick-start examples (curl, JS, Python).
- API-specific Terms of Use referenced from the developer page (no commercial reselling without permission, attribution required, abuse/rate-limit clauses).

---

### Admin panel (`/admin`, role-gated)

- Dashboard: counts, recently edited, pending review, scrape status, API usage summary.
- **Parties / Districts / Candidates**: CRUD with EN and MT inputs per text field; either may be left blank (AI translation fills the gap on the public site). `is_incumbent` flag, `parlament_mt_profile_url`.
- **Parliamentary records** (per incumbent): legislatures, roles, committees, PQs, speeches. "Regenerate from parlament.mt" action.
- **Quotes / Podcasts / News mentions**: bilingual fields.
- **Translations queue**: list of AI-translated fields shown live; one-click approve or edit-and-save as human translation.
- **API key management**: list keys, see consumers, revoke abusive keys, view per-key usage.
- **Sources & AI generations log**: full audit (source, prompt, model, output).
- **Editor invites**: roles `admin` and `editor`.

---

### AI-assisted curation (on-demand)

Editor triggers; server function uses Firecrawl + Lovable AI; editor reviews before publish.
- Fetch candidates from electoral.gov.mt (per district) — verification.
- Fetch candidates + bios from PL / PN / ADPD / Momentum sites.
- Fetch news mentions from the four named news sites.
- Summarize a podcast URL → neutral summary + 3–5 quotes.
- Generate neutral bio draft from aggregated sources.
- Fetch parliamentary profile from parlament.mt for an incumbent; bulk-import activity.
- Refresh parliamentary activity since last sync.
- Translate any field EN ↔ MT for editor approval.

All AI/scraped content is marked "pending review" until approved.

---

### Automated scraping pipeline

Nightly cron at `/api/public/cron/scrape` (shared-secret protected):
- Re-scrape party candidate lists; queue review items for new/changed candidates.
- Re-scrape electoral.gov.mt; auto-flip candidates to `electoral-confirmed` when listed.
- Re-scrape news sites for each candidate; queue new mentions.
- Re-scrape parlament.mt for each incumbent; queue new PQs/speeches/role changes.
- Failures and diffs surface on the admin dashboard.

---

### Neutrality & trust

- Every fact links to a source.
- AI system prompt: no endorsements, cite sources, present multiple viewpoints, refuse vote recommendations, treat EN and MT sources equivalently.
- Footer (both languages): "Independent tool. Not affiliated with any party or the Electoral Commission. Data sourced from electoral.gov.mt, parlament.mt, party websites, and named news outlets. Last updated [date]."
- Public changelog page for transparency.

---

### Visual design

Clean, neutral, news-publication feel. Light theme, serious typography (font supporting Maltese diacritics — Ġġ, Ħħ, Żż). Party colors only as small badges, never page backgrounds. Mobile-first, **WCAG 2.1 AA**, keyboard-navigable, prefers-reduced-motion respected, focus-visible styling, semantic landmarks. Language toggle prominent in header and footer.

---

### Technical details

- **Stack**: TanStack Start + Lovable Cloud (Postgres + Auth) + Lovable AI Gateway + Firecrawl connector.
- **Auth**: Email/password + Google. Roles in `user_roles` table (`admin`, `editor`) with `has_role()` security-definer function.
- **Routing**: language as a URL segment via a `/$lang` parent layout route validating `en|mt`; root `/` redirects to detected language. Legal pages live under each language prefix.
- **i18n**: lightweight static dictionaries per locale; `useT()` hook; `<html lang>` per route; hreflang alternates in `head()`.
- **Schema** (key tables): `parties`, `districts`, `candidates`, `candidate_districts`, `candidate_parties`, `quotes`, `podcast_appearances`, `news_mentions`, `parliamentary_terms`, `candidate_terms`, `parliamentary_questions`, `parliamentary_speeches`, `committee_memberships`, `translations` (polymorphic), `sources`, `ai_generations`, `scrape_runs`, `user_roles`, `api_keys`, `api_usage`, `cookie_consents`.
- **RLS**: public read on published rows; writes restricted to admin/editor; API keys readable only by their owner and admins.
- **AI**: `google/gemini-3-flash-preview` default. Tool-calling RAG; query-language detection; translations cached in `translations` table.
- **API**: TanStack server routes under `src/routes/api/v1/`. OpenAPI spec generated from a shared Zod-schema layer (single source of truth for validation + docs). Scalar renders the spec.
- **Scraping**: Firecrawl via server functions; cron with shared-secret header.
- **Rate limiting**: per-IP and per-key limits on AI assistant, translation, and API endpoints.
- **Cookie consent**: lightweight banner storing consent in a first-party cookie; analytics scripts only loaded after opt-in.

---

### Out of scope for v1

- Public user suggestions queue.
- Full audio podcast transcription (link + on-demand summary instead).
- Vote-by-vote roll-call analysis (parlament.mt rarely publishes structured division data).
- Languages beyond EN and MT.
- Write endpoints in the public API.
