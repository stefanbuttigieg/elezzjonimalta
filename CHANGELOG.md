# Changelog

All notable changes to Elezzjoni Malta are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-04-29

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
