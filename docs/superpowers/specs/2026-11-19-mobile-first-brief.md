Follow-up to the in-progress restyle. This pass is MOBILE-FIRST: most users open the site on phones (360, 390, 430 widths). Don't redo work that's already live (Bebas + Inter, flat theme, home 2-col, grouped schedule with ?team= filter, game tabs, shared DataTable). Do NOT change data, queries, routes/URLs or logic. Keep Next.js + Tailwind v4. Small incremental commits; lint + build after each; branch or PR, not production.

## 1) Hero banner (bug fix, do first)
Current: the home hero <Image src="/moth-banner-strip.png" width=1200 height=432> has `h-24 sm:h-30 md:h-36 w-auto self-start rounded-lg border border-rule` inside a `flex flex-col sm:flex-row` section. Fixed height + auto width + self-start means ~264x96 left-aligned on phones, with ~110px dead space. `sizes="(min-width:768px) 400px,(min-width:640px) 334px,267px"` serves a 384px file.
Fix:
- <640px: `block w-full h-auto` (no fixed h-*, no self-start). Expect ~328x118 at 360, ~358x129 at 390, ~398x143 at 430. Keep 16px side padding + rounded corners (or full-bleed with `-mx-4 w-[calc(100%+2rem)] rounded-none border-x-0`; pick one, be consistent).
- sm+: keep banner left / season title right, `sm:w-[400px] sm:shrink-0`.
- `sizes="(min-width:640px) 400px, calc(100vw - 32px)"`; keep `priority`.
- Re-export banners as WebP/AVIF ~1600px wide (moth-banner-strip.png is 725KB, moth-banner-dark.png 1.0MB). Keep width/height attrs (no layout shift), real alt text.

## 2) Navigation and sticky chrome (mobile)
Header is 106px (brand row + text-link row); with sticky table headers (37-45px), date headers (35px) or game tabs (49px) up to ~155px (18% of 844px) is chrome. No bottom nav; links are out of thumb reach.
- <768px: fixed bottom tab bar: Home, Standings, Schedule, Stats, More (Teams, About, Log in in a sheet). 56px + env(safe-area-inset-bottom), icon + label, ice active state, aria-current="page". Pad main content so nothing hides behind it.
- Mobile top bar: one row <=56px (logo, wordmark, Log in), hide on scroll down / show on scroll up. Drive sticky offsets from a `--header-h` variable so sticky th, date headers and tabs don't overlap or gap.
- >=768px keeps the current top nav.

## 3) Tables and horizontal scroll (mobile)
Player-page Recent Games is 374px in a 356px box, Skater Stats clips PS/PSG, goalie table on /stats is 411px in 356px, game tabs clip ("Discu...") — no scroll hint anywhere.
- DataTable + tab bar: right-edge fade/shadow that disappears at scroll end, scroll-snap.
- On phones hide low-value columns (PEN, PS, PSG, PSF/PSV) behind "More columns"/Legend; primary columns must fit 360px. Sticky-left first column if scrolling remains.
- Game tabs fit at 360px (short labels below sm: Recap | Box | Plays | Chat, or equal-width grid text-sm).

## 4) Tap targets
Everything tappable >=44x44 on mobile. Player links in roster/leaderboard rows are 20-40px (mostly 32px), team links 20-32px, MVP/Sniper chips 36px. Make the whole row (or name cell) the link with min-h-[44px], pad chips, >=8px between targets.

## 5) First screen and page length (mobile)
- Home: after the top bar, compact hero (full-width banner + season label, <=~170px total), then Recent Results/Upcoming ABOVE Standings (results can be a horizontal card strip). Target: latest result + top 3 standings rows visible at 390x844 without scrolling.
- Home leaders: currently repeats the same name across three rows; make one compact card or 3-up row. Empty "Upcoming" collapses to one slim line.
- Stats (4,374px at 390): leaders strip, then the table; Award Winners become a swipeable row or collapsible below the tables; filters as one chip row + "Filters" button if needed. Skater table starts within ~1.5 screens.
- Schedule: sticky date header + team chips together <=80px; default scroll to latest results.

## 6) PWA / iOS
- viewport-fit=cover (Next `viewport` export) and env(safe-area-inset-*) on top bar and bottom bar (status bar style is black-translucent, so content can go under the notch).
- Manifest: PNG icons 192 and 512 (purpose any) + maskable 512, plus id, lang, categories ["sports"]. Keep theme/background #0b0d10.
- Add app/apple-icon.png (180x180, opaque); /apple-icon.png currently 404s.

## 7) Small mobile items
- Nothing under 12px (a few spots on the player page).
- Full team names where there's room; 3-letter codes only in tight tables, with aria-label/title of the full name.
- Locker Room: more spacing for nested replies; composer / "Sign in to post" >=44px.

## 8) Desktop (>=1024px), keep small
- Home: sticky or balanced sidebar so there's no big empty area under the leaders card.
- Game recap: remove the narrow max-width so the card isn't ~40% empty; keep line length <=75ch.
- Stats: Award Winners beside the leaders strip rather than above the table; consider paginating the 38-row table.
- Consider the home 2-col layout from ~900px.

## Verification (required)
1. Lint + build pass, no console errors.
2. Full-page screenshots of /, /standings, /stats, /schedule, /schedule?team=red, /teams, /teams/blue, a player, a game (all 4 tabs), /about, /login at 360x800, 390x844, 430x932, 1440x900 (+768x1024 for /). Compare with before; list regressions.
3. Assert per viewport: scrollWidth <= innerWidth; hero width equals its container on <640px with no side gap; all tappables >=44x44 on mobile; no text <12px; sticky stack (header + sticky bars + th) <=110px on mobile; nothing hidden behind the bottom bar at page end.
4. Playwright devices['iPhone 14']: bottom bar and header clear safe areas; keyboard focus order and aria-current on nav.
5. Lighthouse mobile on /, /stats, a game page: Perf >=90, A11y >=95, LCP on / under 2.0s; report new banner weight.
6. Summary per page, before/after screenshot paths, any data TODOs.
