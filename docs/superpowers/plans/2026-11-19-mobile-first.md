# Mobile-First Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public site comfortable on 360–430px phones (thumb nav, less sticky chrome, tables that fit, 44px targets, shorter first screens) without changing data, queries, routes or logic.

**Architecture:** Presentation-only changes to existing App Router pages and shared components. Two small client components carry the new mobile chrome (`MobileHeader` behavior and `BottomNav`); one pure function (`lib/scroll-header.ts`) decides header visibility so it can be unit-tested. Sticky elements keep using the existing `--header-h` CSS variable, which the header now updates at runtime on mobile. Verification is a Playwright matrix (`matrix.ts`, scratchpad) plus Lighthouse.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, Tailwind v4 (`app/globals.css`), bun (`bun test lib`), sharp (already a trusted dependency) for image/icons, Playwright + @axe-core (scratchpad only).

**Spec:** `docs/superpowers/specs/2026-11-19-mobile-first-brief.md`

## Global Constraints

- Do NOT change data, queries, routes/URLs or logic. Keep Next.js App Router + Tailwind v4.
- Mobile widths: 360, 390, 430. `<768px` = mobile chrome; `>=768px` keeps the current top nav.
- Tap targets >= 44x44 on mobile, >= 8px between adjacent targets.
- No text < 12px. Bebas only at >= 20px (existing rule).
- Sticky stack (header + sticky bars + th) <= 110px on mobile.
- Bottom bar: 56px + `env(safe-area-inset-bottom)`; icon + label; ice active state; `aria-current="page"`.
- Mobile top bar: one row <= 56px (logo, wordmark, Log in), hides on scroll down, shows on scroll up.
- Theme/background color stays `#0b0d10`.
- Small commits; `bun run lint` (0 errors; 2 known warnings in `app/admin/schedule`) and `bun run build` after each task.
- Branch `feat/mobile-first` (stacked on `fix/leaders-subs-playoff-chip`). No pushes to `main`.
- Local data: use `/teams/frost-giants` for `/teams/blue` and `?team=crimson-bears` for `?team=red`.

## Baseline (measured 2026-11-19, prod build on :3002)

- `scrollWidth <= innerWidth` everywhere. Hero already `w-full` on phones (358x130 at 390).
- Sticky stack: 151px stats, 155px game box score, 113–141px schedule; header alone 106px.
- Tap < 44: stats 13–19 (leader names 88x20, award links 92x32, "All"/"G"/"A" chips 36–42 wide); game box 29 (scoreboard team links 260x32, box-score name links 36 tall); plays 5 (scorer links 20 tall).
- No bottom bar. Screens: `scratchpad/shots/mf-before/` (report.json has per-page details).

## Review Focus

1. iOS rubber-band scrolling (negative `scrollY`, bounce at page end) must not flicker the header; at `y <= 0` it is always shown. → Task 2 unit test `shows header at or above the top`.
2. Anchor jumps (`#goalies`, `#focus-night`, game tab hash) while the header is hidden must not leave the target under the header or the bottom bar. → Task 2 step "anchor check".
3. Signed-in users must still reach Admin / Scorekeeper / Account on mobile. → Task 2: the More sheet renders the same `authLinks` the header uses.
4. `/score` uses `body.chrome-off`; the bottom bar must hide there too and must not pad the page. → Task 2 CSS rule + manual check.
5. The More sheet must close on Escape, on outside tap and after navigation, and return focus to the More button. → Task 2 Playwright check.

---

### Task 1: Hero banner

**Files:**
- Create: `public/moth-banner-strip.webp` (from the 1200x432 PNG; source is 1200px wide, so no upscale)
- Modify: `app/page.tsx` (hero section)

- [ ] **Step 1:** Export WebP with sharp: `bun -e 'await (await import("sharp")).default("public/moth-banner-strip.png").webp({quality:82}).toFile("public/moth-banner-strip.webp")'`. Expected: file < 150KB. Leave `moth-banner-dark.png` as PNG: it is only the OpenGraph/Twitter share image (not rendered on pages), and some link-preview crawlers reject WebP.
- [ ] **Step 2:** Hero image: `src="/moth-banner-strip.webp"`, `width={1200} height={432}`, `priority`, `sizes="(min-width: 640px) 400px, calc(100vw - 32px)"`, classes `block w-full h-auto rounded-lg border border-rule sm:w-[400px] sm:shrink-0`. Keep alt text. (Padded + rounded variant, not full-bleed.)
- [ ] **Step 3:** Compact hero below `sm`: hide the eyebrow (`hidden sm:block`), h1 `text-[32px] leading-9 sm:text-[40px] sm:leading-[44px] md:text-[56px] md:leading-[64px]`, games-played line stays. Total hero height at 390 <= 170px.
- [ ] **Step 4:** Verify: `BASE=http://127.0.0.1:3002 bun matrix.ts ../shots/mf-t1 home` → `hero=W x H / W` with W equal to container at 360/390/430; hero section height <= 170 at 390 (probe `section` bottom).
- [ ] **Step 5:** Lint + build; commit `style(home): responsive hero banner served as WebP`.

### Task 2: Mobile chrome — top bar + bottom tab bar

**Files:**
- Create: `lib/scroll-header.ts`, `lib/scroll-header.test.ts`
- Create: `components/MobileChrome.tsx` (client: header hide-on-scroll controller + `BottomNav` + More sheet)
- Modify: `app/layout.tsx` (header markup below md, mount BottomNav), `app/globals.css` (`--header-h` mobile value, bottom padding, `chrome-off` rule)

**Interfaces:**
- Produces: `headerVisible(prevY: number, y: number, wasVisible: boolean, threshold?: number): boolean` (default threshold 8).
- Produces: `<MobileHeaderController />` sets `document.documentElement.style.setProperty("--header-h", visible ? "<bar height>px" : "0px")` and toggles `data-hidden` on `body > header` (CSS translates it `-100%`), only when `matchMedia("(max-width: 767px)")` matches.
- Produces: `<BottomNav authLinks={...} />` root has `data-bottom-nav`, `md:hidden`, fixed bottom, height `calc(56px + env(safe-area-inset-bottom))`.

- [ ] **Step 1: Write failing tests** in `lib/scroll-header.test.ts`:
  - `shows header at or above the top`: `headerVisible(50, 0, false) === true`; `headerVisible(10, -30, false) === true`.
  - `hides after scrolling down past threshold`: `headerVisible(100, 120, true) === false`.
  - `ignores jitter under threshold`: `headerVisible(100, 104, true) === true`; `headerVisible(100, 96, false) === false`.
  - `shows on scroll up past threshold`: `headerVisible(300, 280, false) === true`.
- [ ] **Step 2:** `bun test lib/scroll-header.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `headerVisible` in `lib/scroll-header.ts`.
- [ ] **Step 4:** `bun test lib/scroll-header.test.ts` → PASS.
- [ ] **Step 5:** Layout below md: header is one row, `min-h-14` (56px) + `pt-[env(safe-area-inset-top)]`: logo 32px, wordmark, `AuthMenu` (Log in link or menu). Remove the mobile text-nav row. `>=md` header unchanged. Set mobile `--header-h: calc(56px + env(safe-area-inset-top))` default in CSS; md value stays 71px.
- [ ] **Step 6:** BottomNav: items Home `/`, Standings `/standings`, Schedule `/schedule`, Stats `/stats`, More (button). Inline SVG icons (24px) + 12px label; active = ice text + top 2px ice bar, `aria-current="page"` (reuse `NavLink` active rule: exact `/` for Home, prefix for others). More opens a bottom sheet (`role="dialog"`, `aria-modal`, labelled "More") listing Teams, About, then the layout's `authLinks`; closes on Escape, backdrop tap, and route change; focus returns to More.
- [ ] **Step 7:** CSS: `main` and `footer` get `padding-bottom: calc(56px + env(safe-area-inset-bottom))` below md (footer only, so the last content clears the bar); `body.chrome-off > [data-bottom-nav] { display: none !important; }`.
- [ ] **Step 8: Anchor check:** Playwright at 390: open `/stats`, click "Goalies ↓"; assert `#goalies` top >= current `--header-h` and its bottom < bottom-bar top. Open `/schedule`, click "Jump to…"; same assertion for `#focus-night`.
- [ ] **Step 9: Sheet check:** Playwright: open More, `Escape` closes and focus is on More; open, tap backdrop closes; open, tap Teams → URL `/teams`, sheet gone.
- [ ] **Step 10:** Matrix on all routes: `sticky <= 110` on mobile, `end=clear`, header height 56 at 390.
- [ ] **Step 11:** Lint + build; commit `feat(mobile): bottom tab bar and hide-on-scroll top bar`.

### Task 3: Scroll hints, mobile column diet, short tab labels

**Files:**
- Create: `components/ScrollFade.tsx` (client)
- Modify: `components/DataTable.tsx`, `components/GameTabs.tsx`, `components/StatsTables.tsx` (goalie columns), `app/players/[id]/page.tsx` (career columns), `components/GameLogSection.tsx` (date format), `app/globals.css`

**Interfaces:**
- Produces: `<ScrollFade className?>{children}</ScrollFade>` — a `div` with `overflow-x-auto` + `scroll-snap-type: x proximity`; sets `data-end="true"` when `scrollLeft + clientWidth >= scrollWidth - 1` (on scroll + ResizeObserver). CSS `.scroll-fade:not([data-end="true"])` applies a right-edge `mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent)`.

- [ ] **Step 1:** `DataTable` uses `ScrollFade` when `scroll` is true. `GameTabs` tablist container uses `ScrollFade`.
- [ ] **Step 2:** Game tab labels: add `shortLabel` to `GameTab` (`Recap`/`Preview` → same, `Box Score` → `Box`, `Play-by-Play` → `Plays`, `Discussion` → `Chat`); render short below sm, full from sm (`<span class="sm:hidden">` / `<span class="hidden sm:inline">`). Tabs are `flex-1` below sm so 4 fit at 360.
- [ ] **Step 3:** Goalie table: mark `l`, `otl`, `ps_faced` as `secondary` (hidden on mobile behind the existing "More columns"); primary GP, W, GA, PSV.
- [ ] **Step 4:** Player career table: PEN/PS/PSG (skater) and PSF (goalie) `hidden sm:table-cell`; legend states they show on wider screens.
- [ ] **Step 5:** Game log date below sm: `"Apr 12"` (month + day, no weekday) via a `formatShortDate(iso)` added to `lib/format.ts` with a test in `lib/format.test.ts` (`formatShortDate("2026-04-12T23:00:00Z")` contains `"Apr"` and `"12"` and no weekday).
- [ ] **Step 6:** Verify at 360: every `table` width <= its scroll container width on /stats (skaters + goalies, More columns off), player page (career + game log), game box; 4 tabs fully visible (each tab's right edge <= viewport).
- [ ] **Step 7:** Lint + build; commit `style(mobile): scroll fades, fewer mobile columns, short tab labels`.

### Task 4: Tap targets

**Files:** `components/StatsExplorer.tsx`, `components/AwardWinners.tsx`, `components/BadgeShelf.tsx`, `components/StatsTables.tsx`, `components/BoxScore.tsx`, `app/games/[id]/page.tsx`, `components/TeamBadge.tsx`, `app/page.tsx`

- [ ] **Step 1:** Fix each baseline failure: leader-tile name links `inline-flex min-h-[44px] items-center`; award winner links `min-h-[44px]`; segmented filter buttons and sort chips `min-w-[44px]`; box-score `Name` link `min-h-[44px]`; scoreboard team links `min-h-[44px]`; play-by-play scorer/shooter links `inline-flex min-h-[44px] items-center`; profile award badges `min-h-[44px]`; gaps between adjacent targets `gap-2` (8px) minimum.
- [ ] **Step 2:** Verify: matrix `tap<44=0` for every mobile row (360/390/430).
- [ ] **Step 3:** Lint + build; commit `fix(mobile): 44px tap targets`.

### Task 5: Home first screen

**Files:** `app/page.tsx`, `components/GameRow.tsx` (card variant)

**Interfaces:**
- Produces: `GameCard` (export from `components/GameRow.tsx`) with the same props as `GameRow`; a 200px-wide card (date/status line, two team lines with scores) used in a horizontal `ScrollFade` strip.

- [ ] **Step 1:** Below md, order: hero → "Scores" strip (recent results newest first, then upcoming; `GameCard` each) → Standings → Leaders → Locker Room. At md+ keep current order (standings, results list, upcoming list | sidebar). Do it with two renderings gated by `md:hidden` / `hidden md:block` for the scores section only; standings/leaders reorder with `order-*` classes.
- [ ] **Step 2:** Leaders: one 3-up row (`grid-cols-3`) of compact tiles (label, gold value, name, team dot) on mobile and in the sidebar.
- [ ] **Step 3:** Empty upcoming: one slim `EmptyState compact` line (already); empty strip side shows only results.
- [ ] **Step 4:** Verify at 390x844 (top of page): the first `GameCard` bottom and the 3rd standings row bottom are both < `844 - 56` (bottom bar).
- [ ] **Step 5:** Lint + build; commit `style(home): mobile first screen with scores strip`.

### Task 6: Stats and schedule length

**Files:** `components/StatsExplorer.tsx`, `components/ScheduleView.tsx`, `components/StatsTables.tsx`, `app/stats/all-time/page.tsx`, `lib/paginate.ts`, `lib/paginate.test.ts`

- [ ] **Step 1:** Stats below lg: header → leaders 3-up → filter row (one horizontally scrollable `ScrollFade` row: position chips, games chips, team select) → skaters → goalies → Award Winners as a horizontal snap row of cards. lg+: leaders and Award Winners side by side (`lg:grid-cols-[1fr_1fr]`, awards as a compact 2-col list), then filters and tables.
- [ ] **Step 2:** Verify at 390: skater table top <= 1.5 × 844 = 1266px.
- [ ] **Step 2b: All-time pagination.** Add optional `pageSize?: number` to `SkaterTable`/`GoalieTable` (→ `StatTable`); when set, show `pageSize` rows of the sorted list with Prev / Next buttons (44px) and "Page N of M · X players"; changing the sort resets to page 1. `app/stats/all-time/page.tsx` passes `pageSize={25}`; the season stats page passes nothing (all rows). Pure helper `paginate<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number }` in `lib/paginate.ts` (clamps `page` to `1..pages`, `pages >= 1`), tested in `lib/paginate.test.ts`: 0 rows → `{rows: [], page: 1, pages: 1}`; 60 rows size 25 page 3 → 10 rows, pages 3; page 9 clamps to 3; page 0 clamps to 1.
- [ ] **Step 3:** Schedule: team chip row becomes sticky at `top: var(--header-h)` (44px) and date headers stick at `top: calc(var(--header-h) + 52px)`; combined chips + date header <= 80px. On first load with no hash, scroll the latest-results night into view (`scrollIntoView({block: "start"})`, instant); keep "Next up" highlight.
- [ ] **Step 4:** Verify: schedule sticky stack (excluding header) <= 80px; after load `scrollY > 0` and the "Latest results" header is within the viewport.
- [ ] **Step 5:** Lint + build; commit `style(mobile): shorter stats page, sticky schedule filters`.

### Task 7: PWA / iOS

**Files:**
- Create: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `app/apple-icon.png` (180x180, flattened on `#0b0d10`)
- Modify: `public/manifest.webmanifest`, `app/layout.tsx` (`viewport.viewportFit = "cover"`)
- Test: `lib/manifest.test.ts`

- [ ] **Step 1: Failing test** `lib/manifest.test.ts`: reads `public/manifest.webmanifest`; asserts `id === "/"`, `lang === "en"`, `categories` equals `["sports"]`, `theme_color` and `background_color` equal `#0b0d10`, icons include `{sizes:"192x192",purpose:"any"}`, `{sizes:"512x512",purpose:"any"}`, `{sizes:"512x512",purpose:"maskable"}` and each `src` file exists in `public/`.
- [ ] **Step 2:** `bun test lib/manifest.test.ts` → FAIL.
- [ ] **Step 3:** Generate icons from `public/moth-logo.png` with sharp (maskable: logo at 80% on a `#0b0d10` 512 canvas; apple: 180 flattened on `#0b0d10`); update manifest.
- [ ] **Step 4:** Test → PASS; `curl -sI http://127.0.0.1:3002/apple-icon.png` → 200.
- [ ] **Step 5:** Lint + build; commit `feat(pwa): manifest icons, apple icon, viewport-fit cover`.

### Task 8: Small items + desktop

**Files:** `components/PostCard.tsx`, `components/PostThread.tsx`, `app/games/[id]/page.tsx`, `components/WriteUpCard.tsx`, `app/page.tsx`

- [ ] **Step 1:** Locker Room: composer/reply buttons `min-h-[44px]`; nested replies `space-y-4` and more left indent.
- [ ] **Step 2:** Play-by-play below sm shows the full team name (dot + name) instead of `TeamTag`; codes stay only in tables.
- [ ] **Step 3:** Desktop: home 2-col from 900px (`min-[900px]:grid-cols-[minmax(0,1fr)_320px]`); sidebar `lg:sticky lg:top-[calc(var(--header-h)+24px)]`; recap body `lg:columns-2 lg:gap-10` with the card full width (each column stays well under 75ch). Stats pagination: all-time page only (Task 6 Step 2b).
- [ ] **Step 4:** Lint + build; commit `style: locker room spacing, recap columns, balanced home sidebar`.

### Task 9: Verification

- [ ] **Step 1:** `bun run lint`, `bun run test`, `bun run build`.
- [ ] **Step 2:** `BASE=http://127.0.0.1:3002 bun matrix.ts ../shots/mf-after` → every row `ovx=0`, mobile `tap<44=0 tiny=0 sticky<=110 end=clear err=0`, hero width == container below 640.
- [ ] **Step 3:** iPhone 14 device run (`devices['iPhone 14']`, with `safe-area` simulated by checking computed `padding-top/bottom` include `env()` values): header and bottom bar padding present; Tab order reaches skip link → top bar → main → bottom bar; `aria-current="page"` on the active tab for `/`, `/standings`, `/schedule`, `/stats`.
- [ ] **Step 4:** axe on home, stats, game, player, schedule at 390 and 1440 → 0 violations.
- [ ] **Step 5:** Lighthouse mobile (`/`, `/stats`, game): record Perf, A11y, LCP; report banner bytes before/after.
- [ ] **Step 6:** Before/after comparison list (`mf-before/` vs `mf-after/`) and regressions found.
