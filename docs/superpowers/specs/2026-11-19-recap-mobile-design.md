# Season Recap — Mobile Polish — Design (short)

Date: 2026-11-19 · Status: approved ("your picks") · Source: the user's pasted brief (recap photo hero, gallery, lightbox, shorter page, clearer headings).

## Intent
Most visitors open the recap on a phone from the group chat. The photos are what they want to see, but today they're a small square crop at about 89% of the way down a ~6,900px page. Goal: lead with the champions photo, show the rest of the photos properly, and cut the page to under ~4,500px at 390px, without losing any content.

## Decisions
- **Hero photo:** the first *image* in the admin's gallery order (videos never become the hero). Admins pick the hero by moving a photo to the top. No schema change. *(user approved)*
- **Hero placement:** full width, directly below the champions card and the final result. It keeps its stored width/height (no crop). Rows without dimensions use a 4:3 frame with `object-contain` on the dark background. Uses `next/image` with `priority`, `sizes="(min-width:1024px) 720px, 100vw"`, `quality={75}`, and a caption below. The placeholder is the dark background at the right size (no blur data is stored). *(my call)*
- **Gallery:** all media except the hero.
  - Render nothing when that set is empty, and never show an "N items" eyebrow.
  - 2 columns on phones and 3 from `md`. Tiles are `aspect-[4/3]` with `object-cover` and the object position toward the top centre (faces).
  - Each tile is a `<button>` labelled "Open photo: <caption>" (or "Open video: …"), at least 44px, lazy loaded, `sizes="(min-width:768px) 33vw, 50vw"`. Captions show under the tiles.
  - More than 6 items switch to a horizontal snap carousel with tiles about 80vw wide, so the next one peeks.
  - The section moves to right after Playoffs, and the "Photos" chip scrolls to it, clearing the sticky header and chip bar.
  - Files (PDF/HEIC) stay in the list under the gallery.
- **Lightbox (native `<dialog>`):**
  - Keep: swipe, ←/→, Escape, video gesture guard, focus return, safe-area insets.
  - Add:
    - pinch and double-tap zoom on images, with pointer events and no new dependency; panning while zoomed; swipe disabled while zoomed
    - close on a backdrop tap
    - body scroll lock while open
    - no counter when there's one item
    - preload the next and previous images
  - The hero opens the same lightbox, at index 0.
  - The dialog's `showModal()` provides the focus trap.
- **Shorter page:**
  - The Big nights card shows the top 5 rows with a "Show all (N)" toggle (44px).
  - Hat tricks become wrapped name chips with ×N.
  - Biggest win, Highest-scoring game, Hat tricks and Best single game stay as their own cards.
- **Headings:** "Regular season leaders", "Regular season highlights", "Playoff leaders", "Playoff highlights".
- **Award winners:**
  - The swipe row already has a 220px card, the next card peeking, and a right-edge fade (`ScrollFade`). Keep it.
  - With 2 or fewer awards, stack the cards below 400px instead of showing a row.
- **Admins:** see the hero as well. The management grid (`MediaAdmin`) still lists every item, with a hint that the first photo is the hero.

## Constraints
- Mobile-first: 360–430px first, no horizontal page scroll except the intentional carousels, tap targets at least 44px, body text 16px or larger, labels 12px or larger, contrast at least 4.5:1.
- Keep the sticky header, bottom tab bar and chip bar working. Content clears the tab bar and safe area.
- Existing dark tokens and Bebas display font.
- Only the hero is priority, everything else lazy, CLS 0, no heavy JS. The page stays a server component; the gallery, lightbox and toggles are client components.
- `bun run build`, lint and tests must pass. Use bun, not npm.

## Approaches
1. **Hero = first image in admin order (chosen):** no migration, and reuses reorder.
2. "Set as hero" flag column: more explicit, but needs a migration and UI for one choice. Rejected for now.

## Left to the builder
Exact zoom limits (1–4×), toggle copy, chip styling, how captions sit under tiles, and the carousel threshold behaviour at `md+` (the carousel is phone-only; `md+` uses the grid).

## Verification
Check at 390×844, then 360×740, then 1440:
- the hero is near the top and uncropped
- one photo gives no gallery and no "1 item"
- 2 or more photos give consistent tiles
- the lightbox swipe, zoom, X/Escape/backdrop close and focus return all work
- page height at 390 is under ~4,500px with representative data
- no horizontal scroll
- every image has alt text and every button a label

Lighthouse mobile CLS 0 and LCP ≤ 2.5s on a production build. Before/after screenshots at 390.
