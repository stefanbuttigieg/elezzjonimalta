# Manifesto ingestion for Proposals admin

Build a dedicated **Manifesto Import** workflow in `/admin/proposals` designed for the moment each party publishes its full manifesto (PDF or web page) containing every proposal — including ones already in our database. The flow must extract dozens to hundreds of proposals at once, deduplicate against existing records, and let staff confirm/merge in bulk rather than create blind duplicates.

## User-facing flow

New **"Import manifesto"** button in `/admin/proposals` toolbar opens a full-screen drawer with four steps:

### 1. Source
- **Party selector** (required) — every proposal in this batch will be tagged to this party.
- **Source input** — either:
  - paste a URL (PDF link or HTML manifesto page), OR
  - upload a PDF file from disk (handles the very common case of a PDF that isn't publicly hosted yet, or is behind a download gate).
- Optional **language** toggle (English / Maltese / both) — manifestos often ship bilingually; this drives which title/description fields the AI fills.
- "Extract proposals" button.

### 2. Extraction progress
- Streamed status: "Downloading… Parsing 47 pages… Detecting proposals… Matching against existing…"
- For 50+ page documents this typically takes 60–120s, so we show per-stage progress and let the user cancel.

### 3. Review table
A scrollable table with one row per detected proposal. Columns:

| ✓ | Action | Title | Description (excerpt) | Category | Page | Matches existing |
|---|--------|-------|-----------------------|----------|------|------------------|

- **Action column** is a dropdown auto-set per row:
  - `Create new` — no similar existing proposal found
  - `Update existing` — high-confidence match; choosing this updates the matched proposal's description, marks it `confirmed_in_manifesto = true`, and appends the manifesto as a new `proposal_sources` row instead of inserting a duplicate
  - `Skip` — ignore
- **Matches existing** shows up to 3 candidate matches (title + similarity score) with a "View" link. Clicking a match swaps the action to `Update existing` and links to that ID.
- Title/description/category cells are inline-editable.
- **Page** links back to that page in a side-by-side PDF preview pane (only when source is a PDF), so staff can verify the AI didn't hallucinate.
- Bulk controls: "Select all new", "Select all updates", "Mark all as Skip", "Re-run AI on selected".

### 4. Save
- "Apply N changes" button summarising: "Will create X new proposals, update Y existing, skip Z."
- Single transactional save: inserts/updates `proposals`, inserts `proposal_sources` for every affected proposal pointing to the manifesto URL with `kind = "manifesto"` and the page number, and writes one audit log entry summarising the batch.
- Toast confirms counts; drawer closes; list reloads with a filter pre-applied to `source = "manifesto:<party>"` so staff can sanity-check the batch.

## Deduplication strategy (the new core piece)

Manifestos will overlap heavily with proposals already entered from news scans. We must avoid blowing up the table with near-duplicates.

For each AI-extracted proposal we run a similarity check against all existing proposals **for the same party** before showing the review table:

1. **Exact normalised title match** → high confidence (auto-set to `Update existing`, pre-checked).
2. **Trigram similarity** on titles using Postgres `pg_trgm` (`similarity(a, b) > 0.55`) → suggested match shown in the "Matches existing" cell.
3. **Embedding-style fallback**: short token overlap on description keywords for the borderline cases where titles diverge but content matches.

We require the `pg_trgm` extension and a GIN index on `proposals.title_en` and `proposals.title_mt`. Migration adds both. The dedupe runs server-side in the extract function so the review table arrives with matches pre-attached.

## Technical implementation

### Database changes (one migration)

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- GIN trigram indexes on `proposals.title_en`, `proposals.title_mt`.
- Add columns to `proposals`: `confirmed_in_manifesto boolean default false`, `manifesto_source_id uuid null` (FK to a new `manifesto_imports` table).
- New table `manifesto_imports` (`id`, `party_id`, `source_url`, `source_kind` ('pdf'|'html'|'upload'), `file_path` nullable, `page_count`, `imported_by`, `created_at`, `summary jsonb` storing `{created, updated, skipped}`). Lets us audit which manifesto a proposal came from and re-open a past import.
- RLS: staff-only read/write on `manifesto_imports`.

### File handling for direct PDF uploads

- New Supabase Storage bucket `manifestos` (private, staff-only). Uploaded PDFs are stored here so we can re-process or display the page preview later.
- For URL-based sources, the file is downloaded server-side and also archived to the same bucket (parties sometimes replace or remove the PDF within days).

### Extraction pipeline (`src/server/manifestoImport.server.ts`)

For PDFs (the dominant case):
- **Do not rely on Firecrawl alone** for a 50–100 page PDF. Firecrawl works for short PDFs but loses structure on long ones and the credit cost scales badly.
- Primary path: download the PDF server-side, then use `pdfjs-dist` (works in the Worker runtime — pure JS, no native deps) to extract text per page. We get `{ pageNumber, text }[]`, which lets us preserve page numbers for the review UI.
- Fallback: if `pdfjs-dist` extraction yields almost no text (scanned/image PDF), call Firecrawl `/v2/scrape` with `parsers: ["pdf"]` and `formats: ["markdown"]` — Firecrawl's pipeline includes OCR. Page numbers are lost in this fallback; we mark those proposals with `page = null`.

For HTML manifesto pages:
- Firecrawl scrape with `formats: ["markdown"]`, `onlyMainContent: true`. Section headings become our chunk boundaries.

### AI extraction

- Chunk the document into ~15k-token segments along section/heading boundaries (manifestos are heavily structured).
- For each chunk, call Lovable AI Gateway with `google/gemini-2.5-pro` (long context + better structure recall than Flash for this) using JSON-mode and a strict schema:
  ```
  { proposals: [{ title_en, title_mt?, description_en, description_mt?, category, page_number?, verbatim_quote }] }
  ```
- `verbatim_quote` is required — a short snippet copied directly from the manifesto. We display it on hover in the review table so staff can spot AI hallucinations instantly.
- Concatenate, then run dedupe against the DB.
- Hard cap: 500 proposals per import to prevent runaway batches.

### Server functions (`src/server/manifestoImport.functions.ts`)

- `startManifestoImport` — accepts `{ partyId, sourceUrl?, uploadedFilePath?, language }`, inserts a `manifesto_imports` row in status `processing`, returns its id immediately.
- `getManifestoImportStatus` — polled by the UI to drive the progress indicator and return extracted proposals + match suggestions when ready.
- `applyManifestoImport` — accepts `{ importId, decisions: [{ extractedIndex, action: 'create'|'update'|'skip', targetId?, fields }] }`. Runs all inserts/updates in a single transaction, writes `proposal_sources` rows (kind `manifesto`, with page number in metadata), updates `manifesto_imports.summary`.

Heavy extraction runs inside `startManifestoImport` and writes intermediate state to the `manifesto_imports` row so the UI can poll without holding a long HTTP connection.

### Admin UI (`src/routes/admin.proposals.tsx` + new `ManifestoImportDrawer.tsx`)

- New drawer component (extracted to its own file because it's substantial).
- Polling hook `useManifestoImport(importId)` hits `getManifestoImportStatus` every 2s until done.
- Inline PDF preview pane uses `pdfjs-dist`'s viewer for the page-number jump.
- Reuses existing `findDuplicates` helper concepts but the heavy lifting moves server-side because the dataset is now too big to dedupe in the browser.

### Edge cases handled

- **Same proposal in EN and MT sections of the manifesto** → dedupe within the batch before showing the table; merge into a single row with both languages populated.
- **Manifesto re-uploaded after a typo fix** → `manifesto_imports.source_url` + content hash detects re-imports; UI warns "This manifesto was already imported on <date> — continue?" and offers to reopen the previous import instead.
- **Party not yet in DB** → blocked with a clear message; staff must create the party first (rare since parties are seeded).
- **PDF behind a paywall or 403** → URL fetch fails fast with a clear message; user can fall back to file upload.
- **AI returns a `targetId` that doesn't exist** → server-side validation strips it; row falls back to `Create new` with a warning badge.
- **Cost guard** — hard cap on tokens per import; warn at 80% of cap; halt at 100% with a "Continue with next chunk?" prompt.

### What's NOT in this change (explicit deferrals)

- **Real-time collaborative review** — the review table is single-user per import session.
- **Translation generation** — if only EN is present, we don't auto-translate to MT in this pass; staff fills it or runs a future translate action.
- **Diff view** for `Update existing` — we just overwrite the description and append the source. A proper diff modal can come later if staff request it.
- **Auto-publish** — every imported proposal lands as `pending_review`. Nothing goes live without a human flipping status.

## Files

**New**
- `src/server/manifestoImport.server.ts` — PDF download/extract, Firecrawl fallback, AI chunked extraction, dedupe.
- `src/server/manifestoImport.functions.ts` — `startManifestoImport`, `getManifestoImportStatus`, `applyManifestoImport`.
- `src/components/admin/ManifestoImportDrawer.tsx` — the multi-step drawer UI.
- `src/hooks/useManifestoImport.ts` — polling hook.
- `supabase/migrations/<timestamp>_manifesto_imports.sql` — extension, indexes, table, columns, RLS, storage bucket.

**Edited**
- `src/routes/admin.proposals.tsx` — add "Import manifesto" button + mount the drawer.

**Dependencies to add**
- `pdfjs-dist` (pure JS, Worker-compatible).

Reuses existing `FIRECRAWL_API_KEY` and `LOVABLE_API_KEY` secrets — no new secrets needed.
