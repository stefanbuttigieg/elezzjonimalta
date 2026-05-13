## What we're building

Tag every proposal with:
- a **scope**: `national` | `regional` | `local`
- a list of **localities** (only names that exist in `districts.localities_*`)
- the derived **districts** those localities belong to

Then surface those tags on `/my-district/<n>` as filter tabs (**Local · District · National · All**) so a voter sees the most relevant promises first.

## Database

New columns on `proposals`:
- `geo_scope` enum (`national | regional | local`), default `national`
- `localities text[]` — canonical locality strings (validated against the registry)
- `district_ids uuid[]` — derived from localities, plus any explicit district picks
- `geo_tagged_at timestamptz`, `geo_tagged_by text` (`ai` | `human` | `null`)
- GIN indexes on `localities` and `district_ids` for fast filtering

A SQL helper `app_private.proposal_district_ids(localities text[])` resolves locality strings → district ids using `districts.localities_en/mt`.

## Locality registry

A small server helper `getLocalityRegistry()` parses `districts.localities_en` + `localities_mt` once per request and returns `{ canonical: string, aliases: string[], districtId: uuid, districtNumber }[]`. The AI is given this list as the only allowed values, and writes are validated server-side against it.

## AI tagging

Server function `tagProposalGeo(proposalId)`:
1. Loads proposal title + description (en + mt) + the locality registry.
2. Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with **structured output** (Zod schema for `{ scope, localities[] }`).
3. Drops any locality not in the registry, derives `district_ids`, persists with `geo_tagged_by = 'ai'`.

Triggers:
- **Auto** at the end of the manifesto-import "Apply decisions" step for every newly created/updated proposal (sequential, with small delay so we don't hammer the gateway).
- **Manual** "Re-tag with AI" button per proposal in `/admin/proposals`.
- **Bulk** "Tag untagged with AI" action in `/admin/proposals` toolbar (background job, progress toast).

## Admin UI (`/admin/proposals`)

New compact "Geo" cell per row:
- Pills showing scope + locality count (tooltip lists localities + districts).
- Inline editor: scope select, multi-select localities (typeahead from registry), "Re-tag with AI" button.
- Bulk action in toolbar: "AI-tag untagged".

## Public prioritisation

`/my-district/$number` gets tabs above the proposals list:

```text
[ Local · District · National · All ]
```

- **Local** = proposals whose `localities` include any locality that maps to this district (default tab when district has any local proposals).
- **District** = `district_ids @> {thisDistrictId}` AND `geo_scope <> 'national'`.
- **National** = `geo_scope = 'national'`.
- **All** = unfiltered.

Counts shown on each tab. Existing sorting/cards unchanged.

## Out of scope (this turn)

- Locality picker on `/proposals` (general listing) — keep as today.
- Backfill of every existing proposal — admin can run the bulk "AI-tag untagged" action when ready.

## Quick housekeeping

Fix hydration mismatch in `formatUpdatedAt` (server UTC vs client Malta TZ flips the day near midnight) by forcing `timeZone: "Europe/Malta"`.

## Files

- migration: new columns, indexes, SQL helper
- `src/lib/localityRegistry.server.ts` — parse + cache registry
- `src/lib/proposalGeoTag.functions.ts` — `tagProposalGeo`, `bulkTagUntagged`, `setProposalGeo` (manual save)
- `src/components/admin/ProposalGeoCell.tsx` — admin row UI
- `src/routes/admin.proposals.tsx` — wire cell + bulk button
- `src/server/manifestoImport.server.ts` — kick off geo tagging after apply
- `src/routes/$lang.my-district.$number.tsx` — tabs + filtered query
- `src/lib/formatDate.ts` — pin Malta TZ
- i18n: 4 new strings (Local / District / National / All)
