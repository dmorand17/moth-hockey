# Season Recap PR 3 — Media Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins upload photos, videos and PDFs to a season's recap page. Everyone sees them in a gallery with a lightbox.

**Architecture:** Files go from the browser straight to Vercel Blob through `upload()` from `@vercel/blob/client`. A token route, `POST /api/media/upload`, issues the upload token only to admins and only for the season's path prefix. After the upload, an admin server action `recordSeasonMedia` re-checks the URL with `head()` and inserts a `season_media` row. All decision logic (prefixes, limits, URL checks, reorder, lightbox navigation) lives in pure, tested `lib/media.ts`. `lib/storage.ts` is the only file that imports `@vercel/blob` on the server, so storage can move later.

**Tech Stack:** Next.js 16.2.6 App Router (read `node_modules/next/dist/docs/` for `next/image` `remotePatterns` and route handlers), React 19.2.4, Supabase RLS, `@vercel/blob`, Tailwind v4, bun test.

**Spec:** `docs/superpowers/specs/2026-11-19-season-recap-design.md`, section "Media (PR 3)" and the verification section.

## Global Constraints

- Worktree `.worktrees/recap-media`, branch `feat/recap-media` off `origin/staging`. PR targets `staging`. Use bun and `bunx` only.
- Use the existing public Blob store "moth-hockey-media" through `BLOB_READ_WRITE_TOKEN`. Don't create a store.
- Allowed types: image/jpeg, image/png, image/webp, image/heic, image/gif, video/mp4, video/quicktime, application/pdf.
- Max size: 20 MB for images and PDFs, 200 MB for video. Use `addRandomSuffix: true`.
- Paths: `seasons/{slug}/…` when `VERCEL_ENV === "production"`. Every other environment uses `dev/seasons/{slug}/…`.
- `onUploadCompleted` is not relied on, because Blob can't call back to localhost. The client calls `recordSeasonMedia` after `upload()` resolves.
- Only admins can upload, caption, reorder or delete. RLS: public select, admin insert/update/delete.
- Display:
  - 2 columns on mobile, 3–4 on desktop, using `next/image` with `sizes` and lazy loading.
  - Alt text is the caption, or "Photo from {Season}" when there's no caption.
  - Videos play inline with `preload="metadata"`.
  - PDFs, other files and HEIC go in a file list with icon, name, size and a download link.
  - Lightbox: native `<dialog>` with swipe, ←/→, Escape, captions, and focus restored on close.
- Admin UI:
  - A drag-and-drop zone on desktop, and an "Add photos & videos" button (`multiple`) on mobile.
  - Per-file progress, caption editing, delete (blob first, then the row), and move up/down buttons (44px, keyboard-accessible).
- Picker `accept` lists JPEG/PNG/WebP/GIF/MP4/MOV/PDF, so iOS converts HEIC to JPEG.
- `images.remotePatterns`: `https://*.public.blob.vercel-storage.com`.
- Mobile-first: verify at 390 first, then 1440. Tap targets are at least 44px.
- **Doc review (CLAUDE.md "Keep docs current").** This PR also carries the README and `docs/ARCHITECTURE.md` updates deferred from PR 2 (#159).

## Review Focus

1. A non-admin, or a signed-out user, requests an upload token. Expected: rejected, with no token issued. `checkUploadRequest` test in Task 1.
2. `recordSeasonMedia` gets a URL from another host, another season's prefix, or the wrong environment prefix. Expected: rejected. `validateMediaUrl` tests in Task 1.
3. A HEIC or other non-renderable file arrives. Expected: it goes in the file list, not the image grid. `mediaKind` test in Task 1.
4. Reorder at the ends of the list. Expected: moving the first item up, or the last item down, changes nothing. `moveItem` test in Task 1.
5. Deleting media whose blob is already gone. Expected: the row is still removed. `deleteBlob` treats not-found as success; browser check in Task 6.

---

### Task 1: Pure media helpers

**Files:** Create `lib/media.ts` and `lib/media.test.ts`.

**Interfaces (Produces):**
```ts
export const MEDIA_TYPES: readonly string[];                       // the 8 allowed types
export const PICKER_ACCEPT: string;                                // "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf"
export function mediaPrefix(slug: string, vercelEnv: string | undefined): string; // "seasons/{slug}/" | "dev/seasons/{slug}/"
export function maxBytesFor(contentType: string): number;         // 200 MB video/*, else 20 MB
export type MediaKind = "image" | "video" | "file";
export function mediaKind(contentType: string): MediaKind;        // heic → "file"; pdf → "file"
export function checkUploadRequest(r: { isAdmin: boolean; pathname: string; slug: string; vercelEnv: string | undefined }): { ok: true } | { ok: false; error: string };
export function validateMediaUrl(url: string, prefix: string): { ok: true; pathname: string } | { ok: false; error: string };
export function moveItem<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[];
export function stepIndex(i: number, dir: -1 | 1, length: number): number; // lightbox: wraps around
export function swipeDir(dx: number, dy: number): -1 | 1 | 0;     // |dx| ≥ 50 and |dx| > |dy|: left swipe → 1 (next)
export function formatBytes(n: number): string;                   // "512 KB", "3.4 MB"
```

- [ ] **Step 1: Failing tests.**
  - `mediaPrefix("spring-2026","production") === "seasons/spring-2026/"`. For `"preview"` and `undefined` it returns `"dev/seasons/spring-2026/"`.
  - `maxBytesFor("video/mp4") === 200*1024*1024` and `maxBytesFor("image/jpeg") === 20*1024*1024`.
  - `mediaKind("image/heic") === "file"`, `mediaKind("image/webp") === "image"`, `mediaKind("video/quicktime") === "video"`, `mediaKind("application/pdf") === "file"`.
  - `checkUploadRequest({isAdmin:false,…})` gives `ok: false`. For an admin with pathname `dev/seasons/spring-2026/a.jpg` and slug `fall-2025`, it gives `ok: false`. The matching prefix gives `ok: true`.
  - `validateMediaUrl`:
    - `https://abc.public.blob.vercel-storage.com/dev/seasons/spring-2026/a-xyz.jpg` with prefix `dev/seasons/spring-2026/` → ok, with pathname `dev/seasons/spring-2026/a-xyz.jpg`.
    - Rejected: `http://` (not https), host `evil.com`, prefix `seasons/spring-2026/`, a different slug, and `../` in the path.
  - `moveItem([a,b,c],"a",-1)` returns the same order. `moveItem([a,b,c],"a",1)` returns `[b,a,c]`. `moveItem(…,"c",1)` doesn't change anything.
  - `stepIndex(0,-1,3) === 2` and `stepIndex(2,1,3) === 0`.
  - `swipeDir(-80,10) === 1`, `swipeDir(80,10) === -1`, `swipeDir(30,0) === 0`, `swipeDir(60,90) === 0`.
  - `formatBytes(524288) === "512 KB"` and `formatBytes(3_565_158) === "3.4 MB"`.
- [ ] **Step 2: Run** `bun test lib/media.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** `validateMediaUrl` parses with `new URL` and requires `https:`. The host must end with `.public.blob.vercel-storage.com`. The decoded pathname, without its leading `/`, must start with the prefix and contain no `..`.
- [ ] **Step 4: Run** `bun run test`. Expected: pass.
- [ ] **Step 5: Commit** `feat(media): pure helpers for recap media`

### Task 2: `season_media` migration

**Files:** Create `supabase/migrations/0030_season_media.sql`. Modify `lib/supabase/database.types.ts` (regenerate, then `bunx prettier --no-semi --write`) and `docs/DATABASE.md`.

- [ ] **Step 1: Migration.**
  - Columns per the spec: `id uuid pk default gen_random_uuid()`, `season_id uuid not null references seasons(id) on delete cascade`, `blob_url text not null`, `pathname text not null unique`, `content_type text not null`, `size_bytes bigint not null`, `width int`, `height int`, `caption text not null default ''` (≤ 300 chars, check), `uploaded_by uuid references auth.users(id) on delete set null`, `created_at timestamptz not null default now()`, `sort_order int not null default 0`.
  - Index on `(season_id, sort_order)`.
  - RLS enabled. Policies: `"public read season media"` for select using `true`, and `"admins manage season media"` for all using/with check `public.is_admin()`.
- [ ] **Step 2: Apply.** Run `bunx supabase migration up`. Expected: 0030 applied.
- [ ] **Step 3: RLS check.** As postgres, insert one row. Then:
  - `set role anon; select count(*) from season_media;` → 1
  - `set role anon; insert …` → permission/RLS error
  - `set role authenticated; delete from season_media;` → `DELETE 0`

  Remove the test row afterwards.
- [ ] **Step 4: Types and docs.** Regenerate the types and confirm `tsc` is clean. Add the table, its RLS row and the 0030 row to DATABASE.md.
- [ ] **Step 5: Commit** `feat(media): season_media table`

### Task 3: Storage wrapper, upload token route, config

**Files:**
- Run `bun add @vercel/blob`. Keep the `trustedDependencies` / `ignoreScripts` arrangement in package.json unchanged.
- Create `lib/storage.ts` and `app/api/media/upload/route.ts`.
- Modify `next.config.ts` (remotePatterns) and `.env.example` (`BLOB_READ_WRITE_TOKEN` in the App section, with a comment that local uploads land under `dev/`).

**Interfaces (Produces):**
- `lib/storage.ts`, server only:
  - `headBlob(url: string): Promise<{ size: number; contentType: string; pathname: string } | null>` returns null when the blob is not found.
  - `deleteBlob(url: string): Promise<void>` treats not-found as success.
  - `handleMediaUpload(request: Request, body: unknown, authorize: (pathname: string, clientPayload: string | null) => Promise<{ allowedContentTypes: string[]; maximumSizeInBytes: number }>): Promise<unknown>` wraps `handleUpload`. It sets `addRandomSuffix: true`, and `onUploadCompleted` is a no-op.
- Route: `POST /api/media/upload`.
  - `clientPayload` is JSON `{ slug, contentType }`.
  - `authorize` calls `getAuthSession()`, then `checkUploadRequest({ isAdmin, pathname, slug, vercelEnv: process.env.VERCEL_ENV })`. It throws on failure, which makes the route return 400/403.
  - It returns `{ allowedContentTypes: MEDIA_TYPES, maximumSizeInBytes: maxBytesFor(contentType) }`.

- [ ] **Step 1: Write `lib/storage.ts` and the route.** Read the installed `@vercel/blob` README and types for the exact `handleUpload` / `onBeforeGenerateToken` signatures, and check whether `onUploadCompleted` is optional. Return 403 with `{ error }` when the session is not admin, and 400 for any other failure.
- [ ] **Step 2: Add remotePatterns** (`protocol: "https", hostname: "*.public.blob.vercel-storage.com"`), checked against the Next docs.
- [ ] **Step 3: Verify (Review Focus 1).**
  - Logged out: `curl -s -X POST localhost:3003/api/media/upload -H 'content-type: application/json' -d '{"type":"blob.generate-client-token","payload":{"pathname":"dev/seasons/spring-2026/a.jpg","callbackUrl":"x","clientPayload":"{\"slug\":\"spring-2026\",\"contentType\":\"image/jpeg\"}","multipart":false}}'` → status 403 and no `clientToken`.
  - The same request with the admin cookie → a `clientToken`. This needs `BLOB_READ_WRITE_TOKEN` in `.env.local`. Without it, record the gap as a ledger ruling.
  - `bunx tsc --noEmit && bun run build` → clean.
- [ ] **Step 4: Commit** `feat(media): blob storage wrapper and admin upload token route`

### Task 4: Query + admin server actions

**Files:** Modify `lib/queries.ts`. Create `app/seasons/[slug]/recap/media-actions.ts`.

**Interfaces (Produces):**
- `export type SeasonMedia = { id: string; url: string; pathname: string; contentType: string; sizeBytes: number; width: number | null; height: number | null; caption: string; sortOrder: number }`
- `export async function getSeasonMedia(seasonId: string): Promise<SeasonMedia[]>`, ordered by `sort_order, created_at`. On a query error it logs and returns `[]`, the same way `getRecapSummary` degrades.
- Server actions, each admin-gated (copy `adminOnly()` from `summary-actions.ts`), returning `ActionResult` and revalidating `/seasons/${slug}/recap`:
  - `recordSeasonMedia({ slug, url, width, height, caption })`:
    1. Resolve the season id.
    2. `validateMediaUrl(url, mediaPrefix(slug, process.env.VERCEL_ENV))`.
    3. `headBlob(url)` (fail if null). Check that its content type is in `MEDIA_TYPES` and its size ≤ `maxBytesFor`.
    4. Insert with `sort_order` = max + 1 and `uploaded_by`.
  - `updateMediaCaption({ slug, id, caption })`: trim, ≤ 300 chars.
  - `moveSeasonMedia({ slug, id, dir })`:
    1. Load the season's rows.
    2. Apply `moveItem`.
    3. Write back `sort_order` = index for the rows whose index changed.
  - `deleteSeasonMedia({ slug, id })`: read the row, `deleteBlob(row.blob_url)`, then delete the row.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify.** `bunx tsc --noEmit && bun run lint` → clean.
- [ ] **Step 3: Commit** `feat(media): season media query and admin actions`

### Task 5: Gallery, lightbox, jump link

**Files:**
- Create `components/recap/MediaGallery.tsx` (server: splits the media by `mediaKind`), `components/recap/MediaGrid.tsx` (client: grid + lightbox) and `components/recap/MediaFiles.tsx`.
- Modify `lib/season-recap.ts` (`jumpLinks` gains `media`, labelled "Photos", between playoffs and board), `lib/season-recap.test.ts`, and `app/seasons/[slug]/recap/page.tsx` (replace the `{/* Media gallery (PR 3) goes here */}` placeholder with `<section id="media">` titled "Photos & video", eyebrow `{n} items`).

- [ ] **Step 1: Failing test.** `jumpLinks({ …, playoffs: true, media: true, board: true })` ids end with `["playoffs","media","board"]`. Update the existing `jumpLinks` test inputs with `media: false`.
- [ ] **Step 2: Run** `bun test lib/season-recap.test.ts`. Expected: FAIL. Then implement and confirm it passes.
- [ ] **Step 3: Build the gallery.**
  - Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2`. Each tile is a square `button` (`aspect-square`) wrapping `next/image fill` with `sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"` and `object-cover`.
  - Videos use `<video preload="metadata" muted playsInline src="{url}#t=0.1">` with a ▶ badge.
  - Tapping a tile opens the lightbox at that index.
  - Lightbox: `<dialog>` opened with `showModal()`, full-screen and dark. The image is `object-contain`; a video gets `controls autoPlay`. Shows the caption and an "i / n" counter, with prev/next/close buttons (44px).
  - Keyboard: ←/→ use `stepIndex`, and Escape closes natively.
  - Swipe: `pointerdown`/`pointerup` → `swipeDir`.
  - On close, focus returns to the tile that opened it.
  - File list: icon, caption or filename, `formatBytes`, and a download `<a download>`.
  - Alt text: the caption, else `Photo from ${season.name}`.
  - The section and its chip are shown when there is media, or when the viewer is an admin (for the uploader in Task 6).
- [ ] **Step 4: Verify.** Seed 3 image rows, 1 video row and 1 PDF row pointing at any public HTTPS sample URLs on the Blob host (from Task 3's test upload, or rows created in Task 6). At 390 and 1440, check: the grid columns, lightbox open, swipe/arrow navigation, Escape, focus restore, no overflow, and that the "Photos" chip lands on the section. Do the full check after Task 6 if there is no token for sample uploads.
- [ ] **Step 5: Commit** `feat(media): recap gallery and lightbox`

### Task 6: Admin uploader and management

**Files:** Create `components/recap/MediaAdmin.tsx` (client). Modify `components/recap/MediaGrid.tsx` (admin tile controls) and the page (render `MediaAdmin` above the gallery for admins).

- [ ] **Step 1: Build the uploader.**
  - Drop zone: `onDragOver`/`onDrop`, desktop only (`hidden sm:flex`). Plus an "Add photos & videos" button (≥ 44px) that opens `<input type="file" multiple accept={PICKER_ACCEPT}>`.
  - For each file:
    1. Reject it in the client if its type isn't in `MEDIA_TYPES` or it is over `maxBytesFor`, with a toast naming the file.
    2. Read width/height (`createImageBitmap` for images, `loadedmetadata` for video) and ignore failures.
    3. `upload(`${prefix}${safeName}`, file, { access: "public", handleUploadUrl: "/api/media/upload", clientPayload: JSON.stringify({ slug, contentType: file.type }), onUploadProgress })`. The prefix comes from a prop that the page computes with `mediaPrefix(slug, process.env.VERCEL_ENV)`.
    4. `recordSeasonMedia`.
  - Show a per-file progress bar (`<progress>`) and status. Upload at most 2 files at once.
  - Admin controls per item (on each tile, or in a list on mobile): caption input (saves on blur or Enter), ↑/↓ buttons (44px, `aria-label="Move {name} up"`, disabled at the ends), and Delete with a `confirm()`.
- [ ] **Step 2: Verify (Review Focus 5).** This needs `BLOB_READ_WRITE_TOKEN` in `.env.local`. As admin at 390 and 1440:
  - Upload 3 images, 1 video and 1 PDF. Each lands under `dev/seasons/spring-2026/`.
  - Edit a caption.
  - Move an item up and down.
  - Delete one item, then delete a row whose blob was already deleted (using `deleteBlob` directly). The row goes either way.
  - Logged out: no controls, and the gallery is visible.
  - A non-admin POST to the token route → 403.

  If there's no token, verify with seeded rows and record a ruling.
- [ ] **Step 3: Run** `bun run test && bunx tsc --noEmit && bun run lint && bun run build`. Expected: all clean.
- [ ] **Step 4: Commit** `feat(media): admin upload, caption, reorder and delete`

### Task 7: Doc review

**Files:** `README.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL-TESTING.md`, `docs/DEVELOPMENT.md` (if affected), `.env.example` (done in Task 3; re-check).

- [ ] **Step 1: README.** The Season recap row mentions the AI summary (admin-generated, edit and publish) and the photo/video gallery. The Admin table gains "Season recap" (summary + media). Roadmap: move the AI summary and the media gallery to Shipped. Retake `docs/images/recap.png` and `recap-mobile.png` if the hero area changed.
- [ ] **Step 2: ARCHITECTURE.md.**
  - Layout: `lib/recap-summary/`, `lib/media.ts`, `lib/storage.ts`, `components/recap/`.
  - Routes: `/api/media/upload` (admin-only token).
  - Data flow: the summary draft/publish tables, and the Blob client-upload → `recordSeasonMedia` flow.
- [ ] **Step 3: LOCAL-TESTING.md.** Add `BLOB_READ_WRITE_TOKEN` (copy it from Vercel, or run `vercel env pull`). Local and preview uploads go under `dev/` in the shared store. Without the token, upload is disabled.
- [ ] **Step 4: Commit** `docs: season recap summary and media gallery`
