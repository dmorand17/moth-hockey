# Season Recap Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead the recap with an uncropped champions photo, show the rest as a proper gallery with a better lightbox, and cut the page to under ~4,500px at 390px.

**Architecture:** Pure helpers in `lib/media.ts` and `lib/season-recap.ts` (hero selection, aspect, zoom math, neighbour preload, visible rows) carry the logic, with tests. The lightbox is extracted from `MediaGrid` into a reusable client `Lightbox`. A client `HeroPhoto` (top of page) and `PhotoGallery` (media section) each open it over the same ordered list. The page stays a server component.

**Tech Stack:** Next.js 16.2.6 (`next/image`; read `node_modules/next/dist/docs/` for `priority`/`preload`, `sizes` and `placeholder`), React 19.2.4, Tailwind v4, bun test.

**Spec:** `docs/superpowers/specs/2026-11-19-recap-mobile-design.md`

## Global Constraints
- Use bun, not npm. Branch `feat/recap-mobile` off staging, PR into staging.
- Mobile-first: verify at 390×844, then 360×740, then 1440.
- No horizontal page scroll except intentional carousels. Tap targets at least 44px. Body text 16px or larger, labels 12px or larger, contrast at least 4.5:1.
- Only the hero image gets priority. Every image has correct `sizes`, CLS 0, no new dependencies, and the page stays a server component.
- Hero: `sizes="(min-width:1024px) 720px, 100vw"`, `quality={75}`. Gallery tiles: `sizes="(min-width:768px) 33vw, 50vw"`, `aspect-[4/3]`, `object-cover`, `object-[50%_20%]`.
- Headings: "Regular season leaders", "Regular season highlights", "Playoff leaders", "Playoff highlights".
- Big nights: top 5, then a "Show all (N)" toggle. Never show "N items".
- Doc review before the PR (CLAUDE.md "Keep docs current"). Retake the README recap screenshots.

## Review Focus
1. **Media with no images** (only videos or PDFs): no hero, and the videos stay in the gallery. Test in Task 1 (`splitHero`).
2. **Hero without width/height:** a 4:3 frame with `object-contain`. Test in Task 1 (`mediaAspect`).
3. **Zoomed image:** a drag pans instead of switching photos, and closing or switching resets the zoom. Test in Task 1 (`zoom` helpers), plus a browser check in Task 2.
4. **Backdrop tap vs. image tap vs. swipe:** only a tap on the backdrop closes the lightbox. A swipe that ends on the backdrop doesn't. Browser check in Task 2.
5. **Admin with photos:** sees the hero, and the manager lists everything. Moving a photo to the top changes the hero. Browser check in Task 3.

---

### Task 0: Before screenshots
- [ ] Run a production build of the current branch (no changes yet). Add sample media rows for Spring 2026 that point at local `/public` images through a temporary, uncommitted `next.config` (the same approach as PR 3). Include the 4:3 `moth-banner-dark.png` as the first photo, with width/height set.
- [ ] Take screenshots at 390 and 360 (full page), record the page height at 390, and save them to scratchpad `shots/before-*`. Nothing to commit.

### Task 1: Pure helpers

**Files:** Modify `lib/media.ts`, `lib/media.test.ts`, `lib/season-recap.ts`, `lib/season-recap.test.ts`.

**Interfaces (Produces):**
```ts
// lib/media.ts
export function splitHero<T extends { contentType: string }>(items: T[]): { hero: T | null; rest: T[] }; // hero = first mediaKind "image"; rest keeps order without it
export function mediaAspect(width: number | null, height: number | null): { ratio: string; known: boolean }; // "w / h" or "4 / 3"
export const ZOOM_MIN = 1, ZOOM_MAX = 4;
export function clampZoom(scale: number): number;
export function doubleTapZoom(scale: number): number;            // > 1 → 1; else 2.5
export function pinchZoom(startScale: number, startDist: number, dist: number): number; // clamped
export function neighbors(i: number, length: number): number[];  // prev+next, wrapped, unique, excludes i; [] if length 1
// lib/season-recap.ts
export function visibleRows<T>(rows: T[], expanded: boolean, limit?: number): { shown: T[]; hidden: number }; // limit default 5
```
- [ ] **Failing tests:**
  - `splitHero`:
    - `[video, img1, img2]` → hero `img1`, rest `[video, img2]`
    - videos only → hero `null`, rest unchanged
    - `image/heic` is never the hero
  - `mediaAspect`: `(1200, 900)` → `{ ratio: "1200 / 900", known: true }`; `(null, 900)` → `{ ratio: "4 / 3", known: false }`
  - Zoom:
    - `clampZoom(0.5) === 1` and `clampZoom(9) === 4`
    - `doubleTapZoom(1) === 2.5` and `doubleTapZoom(2) === 1`
    - `pinchZoom(1, 100, 250) === 2.5` and `pinchZoom(2, 100, 10) === 1`
  - `neighbors`: `(0, 4)` → `[3, 1]`, `(0, 1)` → `[]`, `(0, 2)` → `[1]`
  - `visibleRows`: 7 rows, collapsed → 5 shown and `hidden: 2`; expanded → 7 shown and `hidden: 0`; 3 rows → 3 shown and `hidden: 0`
- [ ] Run `bun test lib`. Expected: FAIL. Implement. Expected: pass.
- [ ] Commit `feat(recap): helpers for hero, aspect, zoom and row limits`.

### Task 2: Lightbox upgrade

**Files:** Create `components/recap/Lightbox.tsx` (client). Modify `components/recap/MediaGrid.tsx` to use it.

**Interfaces:** `Lightbox({ items, index, seasonName, onIndex, onClose }: { items: SeasonMedia[]; index: number | null; seasonName: string; onIndex: (i: number) => void; onClose: () => void })`. It opens with `showModal()` when `index !== null`, and the owner restores focus in `onClose`.

- [ ] **Keep the current behaviour:** native dialog, ←/→ via `lightboxGesture`, Escape, touch-only swipe via `swipeDir`, the video guard, safe-area padding, captions.
- [ ] **Add:**
  - **Zoom:** pinch on images (two active pointers: `pinchZoom`) and double-tap (`doubleTapZoom` when two taps land within 300ms). While zoomed, one-finger drags pan the image (`transform: translate() scale()`) and swipe is off. Zoom and pan reset on step and on close. Set `touch-action: none` on the image stage.
  - **Backdrop close:** a click whose target is the dialog element itself, or the stage outside the image box, closes it. It only counts when the pointer moved 10px or less since pointerdown.
  - **Scroll lock:** `document.body.style.overflow = "hidden"` while open, restored on close.
  - **Counter:** hidden when `items.length === 1`.
  - **Preload:** render `neighbors(index, n)` images as hidden `next/image` elements, so they warm the cache. The large image only renders while the lightbox is open.
- [ ] **Verify** at 390 with the sample rows:
  - open, swipe, ←/→, double-tap zoom then pan without switching photo
  - backdrop tap closes; tapping the image doesn't
  - Escape closes and focus returns to the tile
  - `document.body.style.overflow` is `"hidden"` while open
  - one item shows no counter
- [ ] Commit `feat(recap): lightbox zoom, backdrop close, scroll lock, preload`.

### Task 3: Hero photo + gallery

**Files:** Create `components/recap/HeroPhoto.tsx` and `components/recap/PhotoGallery.tsx` (client). Modify `app/seasons/[slug]/recap/page.tsx`, `components/recap/MediaAdmin.tsx` (a one-line hint) and `lib/season-recap.ts`/test if `jumpLinks` inputs change.

- [ ] **`HeroPhoto({ items, seasonName })`** (the hero is `items[0]`; `items` is the full ordered visual list):
  - A full-width `button` labelled "Open photo: <caption or alt>", in a rounded frame with `style={{ aspectRatio: mediaAspect(w, h).ratio }}`.
  - `next/image fill` with `priority`, the hero `sizes`, and `quality={75}`. The class is `object-cover` when the aspect is known, else `object-contain`, on `bg-board-3`.
  - Caption below in 14px `text-ink-dim`. Opens `Lightbox` at 0.
- [ ] **`PhotoGallery({ items, offset, seasonName })`** (`items` = full visual list, `offset` = 1 when there's a hero, else 0):
  - Tiles show `items.slice(offset)`.
  - **6 or fewer tiles:** `grid grid-cols-2 md:grid-cols-3 gap-2`.
  - **More than 6:** below `md`, a horizontal `snap-x` row with tiles at `w-[80vw] max-w-[360px]`; at `md+`, the grid.
  - Each tile is a `button` with `aria-label="Open photo: …"` or `"Open video: …"` and `aspect-[4/3]`. Images use `object-cover object-[50%_20%]` and lazy loading. Videos use `preload="metadata"` with the ▶ badge.
  - The caption sits under the tile (14px, `line-clamp-2`).
  - Opens `Lightbox` at `offset + i`, and focus returns to that tile.
- [ ] **Page:**
  - `visual` = image and video media, in order.
  - `{ hero } = splitHero(visual)`. If a hero exists, reorder `visual` so the hero is first.
  - Render `<HeroPhoto>` in the hero section after the final result, for everyone.
  - The media section renders only when `visual.length - (hero ? 1 : 0) > 0`, or there are files, or the viewer is an admin. It's titled "Photos & video", with no eyebrow count.
  - Admins: `MediaAdmin` as now, plus a hint: "The first photo is the hero at the top of the recap."
  - `jumpLinks`: `media` is true only when that section renders.
  - Keep the `anchor` scroll-margin.
- [ ] **Delete the old `MediaGrid` path, or keep `MediaGrid` only for `MediaAdmin`,** whichever leaves less duplicate code. Record which in the ledger.
- [ ] **Verify** at 390/360/1440 with 1 photo, then 2, then 8:
  - 1 photo: hero only, no media section, no Photos chip
  - 2 photos: hero plus 1 tile
  - 8 photos: carousel on phones, grid at `md+`
  - the hero frame has no crop, and CLS is 0 (no layout shift on load)
  - admin: moving the second photo up makes it the hero
- [ ] Commit `feat(recap): hero photo and gallery`.

### Task 4: Moments, headings, award stacking

**Files:** Modify `components/recap/parts.tsx`, `app/seasons/[slug]/recap/page.tsx` and `components/AwardWinners.tsx`.

- [ ] **Headings.** `RecapLeaders` and `RecapMoments` take a `title` prop.
  - The page passes "Regular season leaders" / "Regular season highlights" and "Playoff leaders" / "Playoff highlights".
  - Drop the now-redundant eyebrow, or keep it only for the playoffs summary numbers.
- [ ] **Big nights.** The card becomes a small client component, `BigNightsList`. It shows `visibleRows(nights, expanded)`, plus a "Show all (N)" / "Show fewer" button (`min-h-11`, `aria-expanded`).
- [ ] **Hat tricks.** The card renders `flex flex-wrap gap-2` chips, one per player. Each chip links to the player and shows "Name ×N" (×N only when N > 1), at `min-h-11` and 14px.
- [ ] **Awards.** With `layout="row"` and `awards.length <= 2`, the wrapper stacks below 400px (`max-[399px]:flex-col` and full-width cards). Otherwise keep the row with its peek and `ScrollFade`.
- [ ] **Verify:**
  - page height at 390 with 19 big nights seeded is under 4,500px
  - "Show all" expands and collapses
  - the chips wrap
  - the headings read correctly
  - 2 awards stack at 360
- [ ] Commit `feat(recap): clearer headings, big-nights top 5, hat-trick chips, stacked awards`.

### Task 5: Verification, Lighthouse, docs
- [ ] `bun run test && bunx tsc --noEmit && bun run lint && bun run build`. Expected: all clean.
- [ ] Production build with the sample rows, checked at 390×844, 360×740 and 1440:
  - after screenshots, and the page height at 390
  - no horizontal scroll
  - every `img` has alt text and every `button` has an accessible name
- [ ] Lighthouse mobile through the chrome-devtools MCP (`lighthouse_audit`) on the recap: record CLS and LCP. Expected: CLS 0 and LCP ≤ 2.5s locally.
- [ ] **Doc review:**
  - README: the Season recap feature row mentions the hero photo; retake `docs/images/recap*.png` from a production build without sample media.
  - DEVELOPMENT / LOCAL-TESTING: only if they're affected.
- [ ] Remove the sample rows and restore `next.config`. Commit `docs: recap hero and gallery`.
