## Goal

Cover hosting, Cloud and AI costs without compromising the site's civic neutrality. No ads, no paywalls, no upsells in political content. Just a calm, clearly-labelled way for readers and civic-minded organisations to chip in.

## Design principles

- **Neutrality first.** Donations and sponsor logos never appear next to party, candidate or proposal content. They live on dedicated pages and in the footer.
- **Subtle, not pleading.** One quiet "Support this project" link in the footer; one soft inline prompt at the bottom of long-read pages (About, Methodology, FAQ). No modals, no banners, no exit popups.
- **Transparent.** A public `/supporters` page lists every institutional patron with disclosure language ("Patrons have no editorial influence"). Monthly running-cost figure shown openly.
- **Anonymous by default.** Individual donors are anonymous unless they opt in to be named.

## What gets built

### 1. `/support` page (the donation page)
- Short, honest explanation: what the site costs to run (hosting, Cloud usage, AI categorisation), why it's independent, why donations help.
- Three suggested one-off amounts (€5 / €15 / €50) + custom amount.
- Toggle to make it monthly (€3 / €10 / €25 supporter tiers).
- Stripe Checkout handles everything — no card data touches the app.
- Optional "show my name on /supporters" checkbox and an optional message field.
- Post-donation thank-you page with a transparent breakdown of where the money goes.

### 2. `/supporters` page (transparency + recognition)
- **Institutional patrons** section: logo wall for NGOs, universities, foundations who back the project, each with a one-line disclosure.
- **Individual supporters** section: opt-in list of named monthly supporters (first name + optional last initial).
- **Running costs** section: current monthly infrastructure spend and what's covered this month (simple progress bar — not a guilt-trip thermometer, just transparency).
- Clear statement: *"Patrons and supporters have no influence over editorial content, party coverage, or candidate profiles."*

### 3. Footer link
- A single discreet "Support this project" link in the existing site footer, next to About / Methodology. No icon, no badge, no colour.

### 4. Soft inline prompts (two places only)
- Bottom of `/about`: short paragraph + link to `/support`.
- Bottom of `/methodology`: same pattern.
- **Not** added to: home, parties, candidates, proposals, themes, districts, compare, ask, news. These stay editorial-pure.

### 5. Admin: supporters & patrons management
- New admin page `/admin/supporters` to:
  - Add/edit institutional patrons (name, logo, website, disclosure note, sort order, published flag).
  - View incoming donations (read-only list synced from Stripe webhook).
  - Toggle which named individual supporters appear publicly.
- Standard staff-only RLS, same pattern as other admin pages.

## Technical sketch (for the implementer)

- **Provider:** Lovable's built-in Stripe Payments (no API keys, sandbox + live environments managed for you, supports one-off + recurring).
- **Two products in Stripe:**
  - "One-off support" with custom amount.
  - "Monthly supporter" with the three tiers as prices.
- **Server function** `createSupportCheckout` (TanStack `createServerFn`) creates the Stripe Checkout session and redirects.
- **Server route** `/api/public/hooks/stripe-webhook` verifies the Stripe signature and writes to two new tables:
  - `donations` (amount, currency, kind one-off/monthly, donor_name nullable, message nullable, show_publicly bool, stripe_session_id, created_at).
  - `patrons` (name, logo_url, website, disclosure_note, sort_order, published, created_at, updated_at).
- **RLS:**
  - `donations`: public can read only rows where `show_publicly = true`; staff can read all; nothing else.
  - `patrons`: public can read where `published = true`; staff full access.
- **No PII leaks:** donor email is stored only inside Stripe, never in our DB.
- **Cost transparency widget** reads a small `site_finance` settings row (monthly_cost_eur, currency) that an admin can edit.

## What is explicitly NOT in this plan

- No display ads, ever.
- No "Pro" features behind a paywall — the site stays fully free.
- No paid API tiers (can be revisited later if journalists actually ask).
- No sponsor logos on party / candidate / proposal pages.
- No popups, modals, or interstitials.

## Order of work (suggested, small steps)

1. Database migration: `donations`, `patrons`, `site_finance` tables + RLS.
2. Enable Stripe Payments + create the two Stripe products.
3. Build `/support` page + `createSupportCheckout` server function.
4. Build Stripe webhook route + thank-you page.
5. Build public `/supporters` page.
6. Add footer link + the two soft inline prompts.
7. Build `/admin/supporters` for patron + donation management.

Each step is independently shippable. You can stop after step 6 and already have a working, dignified donation flow; step 7 is purely admin polish.
