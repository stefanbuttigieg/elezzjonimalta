# Expanded Candidate Profiles

Build comprehensive, sourced candidate profiles. Adds contact info, biography facts, media (videos/podcasts), parliamentary positions/contributions, endorsements, and a parlament.mt sync helper. All staff-managed in admin, public on profile pages.

## 1. Database migration

Single migration file `supabase/migrations/<ts>_candidate_profile_expansion.sql`:

**Extend `candidates`** (all nullable):
- Contact: `email text`, `phone text`, `office_address text`
- Bio facts: `date_of_birth date`, `birthplace text`, `profession text`, `education text`, `languages text[]`
- Socials: `instagram text`, `tiktok text`, `linkedin text`, `youtube text`
- Parliament link: `parliament_member_id text` (parlament.mt MP id), `parliament_synced_at timestamptz`

**New enum** `candidate_media_kind`: `video`, `podcast`, `interview`, `speech`, `article`.

**New table `candidate_media`** — videos, podcast episodes, interviews, speeches:
- `id`, `candidate_id` (fk → candidates), `kind candidate_media_kind`
- `title text`, `description text`, `url text not null`, `provider text` (auto: youtube/spotify/apple/rss/other), `embed_id text`, `thumbnail_url text`, `published_at date`
- `language text` (en/mt), `status review_status default 'pending_review'`, `source_url text`
- `created_at`, `updated_at`

**New table `candidate_positions`** — parliamentary roles, committee memberships, cabinet posts:
- `id`, `candidate_id`, `legislature_number int`, `title text not null`, `body text` (e.g. "Public Accounts Committee"), `start_date date`, `end_date date`, `is_current bool default false`, `source_url text`
- Trigger: `end_date >= start_date` when both present.

**New table `candidate_contributions`** — aggregate parliamentary stats per legislature:
- `id`, `candidate_id`, `legislature_number int not null`
- `attendance_pct numeric`, `speeches_count int`, `pmqs_count int`, `bills_sponsored int`, `bills_cosponsored int`
- `summary_en text`, `summary_mt text`, `source_url text`, `synced_at timestamptz`
- Unique `(candidate_id, legislature_number)`.

**New table `candidate_endorsements`** — quotes/endorsements:
- `id`, `candidate_id`, `quote_en text`, `quote_mt text`, `attributed_to text not null`, `attributed_role text`, `source_url text`, `published_at date`, `status review_status default 'pending_review'`

**RLS** for every new table — same template as existing candidate sub-tables:
- Public read: only when parent candidate is `published` or `is_incumbent` (for positions/contributions).
- Staff read all / insert / update via `app_private.is_staff(auth.uid())`.
- Admin delete via `app_private.has_role(auth.uid(),'admin')`.
- `updated_at` trigger using existing `update_updated_at_column()`.

## 2. Admin UI

Refactor `src/routes/admin.candidates.tsx` editor into a tabbed Drawer (reuse existing `Drawer`, `Field`, `Input`, `Textarea`, `StatusSelect`):

- **Overview** (existing fields)
- **Contact & bio facts** (new candidate columns)
- **Socials** (existing + new instagram/tiktok/linkedin/youtube)
- **Media** — list + add/edit/delete rows in `candidate_media`. Provider auto-detected from URL (youtube.com/youtu.be → youtube + extract video id; open.spotify.com/episode → spotify; podcasts.apple.com → apple; otherwise `other`).
- **Parliament** — `parliament_member_id` field + "Sync from parlament.mt" button (calls server fn, see §4); manage `candidate_positions` and `candidate_contributions` rows.
- **Endorsements** — manage `candidate_endorsements`.
- **Sources & status** (existing source_url, notes, status, flags).

All writes go through `writeAudit` pattern (see existing admin pages).

## 3. Public profile

Extend `src/routes/$lang.candidates.$slug.tsx` with new sections, each rendered only when data exists:

- **Quick facts** card: profession, languages, birthplace, DOB (age), education.
- **Contact** card: email (mailto), phone (tel), office address, social links (icons row).
- **Parliamentary record**: positions timeline + contributions stats per legislature.
- **Media**: tabs/grouped by kind (video, podcast, interview, speech). Click-to-load YouTube/Spotify embeds (privacy-first, deferred iframe — aligns with existing cookie banner). Fallback link card for `other`.
- **Endorsements**: quote cards.
- **Sources**: existing `candidate_sources` list, unchanged.

i18n: add new keys to `src/i18n/dictionaries.ts` (en + mt) for section titles and labels.

## 4. parlament.mt sync (server function)

`src/server/parliamentSync.functions.ts` exporting `syncCandidateFromParliament`:

- Input: `{ candidateId: string }`.
- Reads `candidates.parliament_member_id`; if missing, returns error.
- Uses Firecrawl (`FIRECRAWL_API_KEY` already configured) to scrape the MP's parlament.mt page.
- Extracts: current legislature, committee memberships, role/cabinet position, attendance/speech counts where available.
- Upserts into `candidate_positions` (by `candidate_id + title + start_date`) and `candidate_contributions` (by unique key).
- Sets `candidates.parliament_synced_at = now()`.
- Writes admin audit log entry (`writeAudit`).

Triggered manually from admin Parliament tab. No automatic cron in v1.

## 5. Public API & types

- Auto: `src/integrations/supabase/types.ts` regenerates after migration.
- Extend `src/routes/api/public/v1/candidates.ts` to include new scalar fields and embed `media`, `positions`, `contributions`, `endorsements` arrays for published candidates only.

## 6. Docs

- `CHANGELOG.md`: new "Expanded candidate profiles" entry.
- `README.md`: brief section listing the new profile data model and parlament.mt sync.

## Technical notes

- All new tables follow existing `app_private.is_staff` / admin-delete RLS pattern.
- Embeds are click-to-load `<iframe>` (no third-party cookies until user opts in).
- No CHECK constraints on time-based fields — use BEFORE INSERT/UPDATE triggers.
- Media provider detection is a small pure helper in `src/lib/media.ts` used by both admin (on URL change) and public (to render embeds).
- No new external secrets required.

## Out of scope (v1)

- AI transcripts/highlights for podcasts.
- Automated photo extraction.
- Automated cron sync from parlament.mt.

These can ship as follow-ups once the data model is in place.
