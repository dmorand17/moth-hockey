# Mobile-First Plan

Punch list for bringing the public site into compliance with the mobile-first
rules in [PLAN.md](./PLAN.md) (lines 7–15): design at 360–390px, tap targets
≥ 44×44px, no horizontal scroll, no hover-only affordances, sticky elements
sparingly, verify in mobile DevTools.

The site is already in good shape — Bebas Neue + JetBrains Mono on the dark
scoreboard palette holds up well on a phone, and most layouts use mobile-default
Tailwind classes. The work below is concentrated in a few specific places.

Tasks are grouped by priority. Check them off as they're completed.

---

## P0 — Breaks the rules outright

### [x] M-P0-1 — Slim down the sticky header on mobile
**File:** `app/layout.tsx:44–88`

The header has the brand row *and* a second mobile nav strip, both inside
`sticky top-0`. At 360px width that consumes ~96px (~1/8 of viewport)
persistently — eats too much real estate.

**Fix:**
- Drop `sticky top-0` on mobile (`md:sticky`). Brand-row sticky is unnecessary;
  the nav strip alone is fine sticky if you want one.
- Hide the tagline (`Mostly Over The Hill · EST. PRE-COVID`) below `sm:` so the
  brand row shrinks from ~64px to ~52px.
- Bump nav-strip from `py-2.5` (~38px) to `py-3 min-h-[44px]` to hit the 44px rule.
- Reduce nav text from `text-[13px]` to `text-[12px]` at the smallest breakpoint
  to keep all 5 links from crowding.

### [x] M-P0-2 — Enforce 44×44px tap targets across interactive controls
**Files:** multiple

Audit findings:
- `app/layout.tsx:67` — desktop nav `py-2 text-[15px]` ≈ ~36px
- `app/layout.tsx:82` — mobile nav `py-2.5` ≈ 38px
- `app/page.tsx:41,44` — hero CTA buttons `py-2.5` ≈ ~40px
- `app/teams/[slug]/page.tsx:185–202` — roster `<tr>` rows ~41px tall; only
  the player name is a click target, not the whole row
- `app/stats/page.tsx:178–195, 252–267` — same row-target issue
- `components/SectionHeader.tsx:24` — "Full standings →" link is ~16px tall

**Fix:**
- Add a `.tap { min-height: 44px; min-width: 44px; }` utility in `globals.css`,
  apply to all interactive controls.
- For roster/stats table rows: wrap entire row in a `<Link>`, or use
  `<tr style="position:relative">` with `<Link className="absolute inset-0">`
  so the whole row is tappable.

### [x] M-P0-3 — Fix AwardBadge popover clipping at narrow viewports
**File:** `components/AwardBadge.tsx:64–69`

Popover is anchored `absolute left-0 top-full min-w-[180px]`. Badges near the
right edge of a 360px screen will clip off-screen — no flip logic.

**Fix:**
- Change to `left-1/2 -translate-x-1/2` and add `max-w-[calc(100vw-32px)]` so
  the popover centers under the badge and never clips.
- Drop the `group-hover:opacity-100` trigger entirely (see M-P2-1) — keep only
  the click toggle to avoid sticky hover state on touch devices.

### [x] M-P0-4 — Vertical stack the boxscore at narrow widths
**File:** `app/games/[id]/page.tsx:97–105`

The 3-column `grid-cols-[1fr_auto_1fr]` with `text-[88px]` scores crushes at
360px. Two-line team names like "Puck Dynasty" wrap awkwardly under
`text-[28px]` and break alignment with the score.

**Fix:**
- Mobile: vertical stack — away team (badge + score on one row) → "VS" divider
  → home team (badge + score on one row).
- Restore horizontal layout at `md:` and up.
- Reduce mobile score from `text-[88px]` to `text-[72px]`.

### [x] M-P0-5 — Reduce SectionHeader title size on mobile
**File:** `components/SectionHeader.tsx:13`

`size="lg"` produces `text-[44px] md:text-[60px]`. At 360px, "STANDINGS" in
Bebas Neue + tracking crowds the right edge; "ABOUT M.O.T.H" wraps unhelpfully.
Used by `/standings`, `/teams`, `/schedule`, `/stats`, `/about`.

**Fix:**
- Drop mobile size to `text-[36px] sm:text-[44px] md:text-[60px]`. Bebas at 36
  is still strongly heroic.

### [x] M-P0-6 — Compact hero on landing page
**File:** `app/page.tsx:32`

`text-[56px] md:text-[88px]` × 2 lines + tagline + 2 buttons = ~480px tall on a
360×780 viewport. Pushes standings below the fold.

**Fix:**
- Drop mobile hero to `text-[44px]`.
- Reorder so the leader card appears *before* the goals/games tiles since
  that's the more interesting info on a small screen.

---

## P1 — Hidden info / friction on mobile

### [x] M-P1-1 — Show W-L-OTL on the landing-page standings preview
**File:** `app/page.tsx:79–97`

W/L/OTL/GF/GA are hidden behind `hidden sm:table-cell` and `hidden md:table-cell`.
At 360px the user only sees `# / Team / GP / PTS` — but **W-L-OTL is the most
important info on a standings table**. Same total points doesn't reveal
"Team A is 5-0 vs. Team B is 3-2."

**Fix:**
- Add a compact `5-0-1` record column (concatenated `W-L-OTL`) visible on
  mobile in place of the three separate columns. Switch back to separate
  columns at `sm:` and up.
- Alternative: render mobile as a card list (one card per team) with full
  record visible.

### [x] M-P1-2 — Compact GameRow at narrow widths
**File:** `components/GameRow.tsx`, used by `app/schedule/page.tsx:58`

Schedule uses `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`. From 390–640px there's
a stretch where one game card is full-width and ~360px tall — six games × 360px
= ~2160px scroll for one month.

**Fix:**
- Tighter padding on mobile, smaller score font, drop the date label below the
  chip onto the same row. Aim for ~120px tall per card so a month of 6 games
  fits in ~720px.
- Keep `sm:grid-cols-2` since 640px+ has horizontal room.

### [x] M-P1-3 — Boxscore events log: surface team identity on mobile
**File:** `app/games/[id]/page.tsx:146–151, 162–164, 211`

Period/clock column (`hidden md:flex`) and team marker (`hidden md:flex`,
line 211) are hidden on mobile. Fallback shows clock as a tiny eyebrow;
team identity is only inferable from the 2px left border color.

**Fix:**
- Promote the team color stripe — make it more visually prominent on mobile.
- Show the team name in small text under the player name on mobile (vertical
  space is available).

### [x] M-P1-4 — Player profile hero — avoid awkward stacking at 360px
**File:** `app/players/[id]/page.tsx:249–290`

Single `flex items-center gap-5` with jersey tile + name area + awards causes
chaotic stacking at 360px. Team badge inline (line 274) collides with the
position eyebrow.

**Fix:**
- Change top flex from `items-center` to `items-start gap-4` on mobile,
  `items-center gap-8` on `md:`.
- Wrap the team badge + position into `flex-col items-start gap-1` on mobile.

### [x] M-P1-5 — Teams card grid: bump 2-up to `md:` instead of `sm:`
**File:** `app/teams/page.tsx:33`

`grid gap-3 sm:grid-cols-2 lg:grid-cols-2`. At ~300–320px (small tablet
half-width), the team name `text-[26px]` collides with the points column.

**Fix:**
- Change to `grid gap-3 md:grid-cols-2`. Mobile and small tablets get a single
  full-width card each — better readability.

---

## P2 — Polish and progressive enhancement

### [x] M-P2-1 — Drop hover trigger on AwardBadge popover
**File:** `components/AwardBadge.tsx:64–67`

Has BOTH hover (`group-hover:opacity-100`) AND click (state-managed). On touch
devices the hover-stuck state can persist after a tap.

**Fix:** Remove the `group-hover` line; the click state alone works on every
device. (Folds into M-P0-3.)

### [x] M-P2-2 — Set `theme-color` meta to match the board
> Implemented via Next 16's `viewport` export (`app/layout.tsx:27-29`) rather than `metadata.themeColor`, which is the correct location in Next 16.
**File:** `app/layout.tsx:22–25`

Mobile Safari/Chrome address bar defaults to white — jarring against the dark
scoreboard.

**Fix:**
```ts
export const metadata: Metadata = {
  title: "...",
  description: "...",
  themeColor: "#0b0d10", // matches --board
};
```

### [x] M-P2-3 — Remove `background-attachment: fixed`
**File:** `app/globals.css:46–50`

Known mobile perf/scroll-jank issue, especially on iOS Safari. iOS doesn't
actually honor `fixed` — it scrolls with content anyway.

**Fix:** Delete the `background-attachment: fixed` line. Visual effect is
unchanged in practice; perf hazard removed.

### [x] M-P2-4 — Tighten About cards on mobile
**File:** `app/about/page.tsx:37–52`

`grid gap-3 md:grid-cols-3`. On mobile each card is ~160px tall — three cards
= ~520px scroll for what is essentially a nav index.

**Fix:** Tighten card padding from `p-6` to `p-5` on mobile, or convert to a
list-style row layout (eyebrow + title + → on a single row each).

### [x] M-P2-5 — Convert career stats table to card view at narrow widths
**File:** `app/players/[id]/page.tsx:306` (`min-w-[680px]`)

Currently uses `overflow-x-auto` which contradicts the PLAN rule "no horizontal
scroll." Users miss columns that scroll off-screen with no scroll indicator.

**Fix (pick one):**
- Below `sm:`, render each season as a stacked card (Season name + Team + 6
  stats in a 3×2 grid). Tables at `sm:` and up.
- OR hide low-priority columns on mobile (PEN, PS, PSG); show G / A / PTS
  only with a "More stats" disclosure.
- Add a visible right-edge fade gradient as a scroll affordance.

### [x] M-P2-6 — Same card-view fix for stats leaderboards
**File:** `app/stats/page.tsx:161 (min-w-[680px])`, `app/stats/page.tsx:235 (min-w-[560px])`

Same horizontal-scroll issue as M-P2-5.

**Fix:** Same approach — card view ≤ `sm:`, tables ≥ `sm:`.

### [x] M-P2-7 — Respect `prefers-reduced-motion`
**File:** `app/globals.css:191–199`

`.delay-3` + 420ms duration = up to 600ms before everything is on-screen. Can
feel laggy on lower-end phones, and inaccessible for users who prefer reduced
motion.

**Fix:** Add `@media (prefers-reduced-motion: reduce) { .rise { animation: none; } }`.

---

## Recommended order of operations

If you only have time for a single PR, do these in this sequence — touches the
most pages with the smallest blast radius:

1. **M-P2-3 + M-P2-7** (`globals.css`): add `.tap` utility, remove
   `background-attachment: fixed`, add reduced-motion query (5 min)
2. **M-P0-1** (`app/layout.tsx`): drop sticky on mobile, hide tagline below
   `sm:`, bump nav-strip to `min-h-[44px]` (10 min)
3. **M-P0-5** (`components/SectionHeader.tsx`): add `text-[36px]` mobile size
   for `lg` (5 min)
4. **M-P0-6 + M-P1-1** (`app/page.tsx`): drop hero to `text-[44px]`, change
   standings to show W-L-OTL on mobile (15 min)
5. **M-P0-3 + M-P2-1** (`components/AwardBadge.tsx`): drop hover trigger, use
   `left-1/2 -translate-x-1/2` (10 min)
6. **M-P0-4** (`app/games/[id]/page.tsx`): vertical stack scoreboard on mobile (15 min)
7. **M-P2-5 + M-P2-6** (`app/players/[id]/page.tsx` + `app/stats/page.tsx`):
   card view ≤ `sm:` for stat tables (30 min — biggest win for "no horizontal
   scroll" rule)

Total: ~90 min of focused work to take the site from "responsive" to
genuinely mobile-first per the PLAN.

---

## Verification

For each completed task, verify in this order:

1. **DevTools mobile emulation** at 360px width and 390px width. Look for
   horizontal scroll, clipped content, awkward wrapping.
2. **Tap targets:** use DevTools' "Show ruler" or hover inspector to confirm
   ≥ 44×44px on every interactive element.
3. **Real phone** (or a phone-shaped Chrome window) before merging — DevTools
   doesn't catch everything (e.g., iOS hover-stuck state, address-bar overlap).
4. **Lighthouse mobile audit** on the affected page; target ≥ 90.
