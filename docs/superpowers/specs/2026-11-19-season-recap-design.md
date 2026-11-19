# Season Recap — Design

Date: 2026-11-19 · Status: draft for approval · Source brief: the user's "Season Recap page" request (this conversation)

## Intent

One page per season that is both **shareable** (a link posted to the league group chat after the final, read on phones) and **the permanent record** of that season. Award winners move off `/stats` onto it.

Success: a league member taps the link in the group chat, the link preview shows the season and champion, and on one phone screen they see who won, the final score and the start of the season story. Years later the same URL still shows that season's record.

## Goals

- `/seasons/[slug]/recap` for **every** season, including imported historical ones (sections without data drop out quietly).
- `/recap` redirects to the right season's recap.
- Live, computed sections that always agree with the rest of the site (if a game is corrected, the recap follows).
- An AI-written summary that is generated **once** on admin request, reviewed, edited, published and then frozen. Never regenerated per request.
- An admin-curated media gallery (photos, videos, PDFs) stored in Vercel Blob.
- Award Winners removed from `/stats` (player-page award badges stay).

## Non-goals

- New data entry (no new stats or manual "moments").
- Public uploads or comments on media.
- Regenerating the summary automatically when data changes.
- A new comment system for seasons.

## Anti-goals (failure even if it "works")

- The AI summary states a number, name or quote that isn't in its input facts.
- An unpublished or half-finished summary is visible to non-admins (it could get shared early).
- Anyone but an admin can upload, delete, regenerate or publish.
- The page is slow or breaks layout on a phone (it's mostly opened from a chat app).
- Local testing pollutes the production media store.

## Constraints

- Existing stack: Next.js 16 App Router (server components + server actions), Tailwind v4, Supabase Postgres with RLS, `lib/auth.ts` roles (`requireRole`, `getSessionIfRole`), bun.
- Design system already in place: Bebas + Inter, flat dark theme, `SectionHeader`, `DataTable`, `ScrollFade`, `GameCard`/`GameRow`, `AwardWinners`, 44px tap targets, mobile bottom tab bar with a More sheet.
- AI: reuse the existing OpenRouter client (`lib/write-ups/openrouter.ts`, `OPENROUTER_API_KEY`, `WRITE_UP_MODEL` default `deepseek/deepseek-v4.1-flash-1017`, fallback `openai/gpt-6-luna`). No Vercel AI SDK.
- Media: the existing public Vercel Blob store "moth-hockey-media" (`BLOB_READ_WRITE_TOKEN` in all Vercel environments). Don't create a store.
- Schema changes only as new tables (+ migrations); no changes to existing tables, routes or scoring logic.
- Seasons have no slug column; teams do.

## Approaches considered (decided in conversation)

1. **Live sections + frozen AI summary with stored input facts — chosen.** Standings, leaders, bracket, numbers and moments are computed from game data on every request; the summary is generated once, the exact facts JSON sent to the model is stored next to it (same pattern as `game_write_ups.input`), and the published text is frozen. Corrections flow everywhere; the story stays stable and auditable.
2. Snapshot every section at publish — never changes, but can silently disagree with the stats pages after a correction. Rejected.
3. Live sections, store only the summary text — simplest, but no record of what the AI was told and no way to spot-check it. Rejected.

AI provider: reuse OpenRouter (chosen) vs adding the Vercel AI SDK (rejected: second AI stack, second key). Models: DeepSeek v4.1 Flash primary, gpt-6-luna fallback (user's choice, shipped separately on `chore/write-up-models`).

## Design

### Shipping order (three PRs)

1. **Recap page** — route, computed sections, links, OG image, `/recap` redirect, awards moved off `/stats`.
2. **AI summary** — `season_recaps` table, admin generate / edit / publish.
3. **Media** — `season_media` table, Blob uploads, gallery + lightbox.

Each PR is useful alone: (1) is a complete recap without story or photos.

### Routing and identity

- **Season slug** = slugified `seasons.name` (lowercase, non-alphanumerics → `-`, trimmed): `Fall 2026` → `fall-2026`, `Winter 2025-26` → `winter-2025-26`. A pure `seasonSlug(name)` in `lib/`, tested. The route resolves by matching `seasonSlug(name)` against all seasons; unknown slug → 404.
- **Season state** (builder's call, recorded here): *complete* = `finalized_at` is set, **or** the season is not current and its `start_date` is before the current season's `start_date` (or before today when no season is current). *Upcoming* = not current and starting after the current season (an admin created it but hasn't activated it): recap route 404s and no links point at it. *In progress* = the current season, not finalized.
- **`/recap`** redirects (307) to: the current season if it is complete; otherwise the most recent complete season by `start_date`; if none exist, the current season's recap (which shows the in-progress state). Never to an upcoming season.
- **In progress**: the page shows the hero (season name), "Recap available when the season ends", and the current leaders; nothing else.
- **Metadata**: title `"<Season> Season Recap — M.O.T.H Hockey"` (via the existing title template: page title `"<Season> Season Recap"`), description naming the champion when known. **OG image** via a route-segment `opengraph-image.tsx` (`next/og`): banner art + season name + `Champions: <Team>` (or the season name alone when there's no champion).

### Sections (mobile-first order) and data

| # | Section | Source (reuse first) | Imported seasons |
|---|---|---|---|
| 1 | Hero: season name, champion (team color bar), final record, championship score → game link, Share button | `getChampionTeamId`, `getStandings`, games with `playoff_round = 'final'` | champion from `getHistoricalStandings` (`is_champion`, derived from champion awards) if present; no score |
| 2 | AI summary (PR 2) | `season_recaps` (published only for non-admins) | allowed (facts = awards, standings, leaders) |
| 3 | Award winners | existing `AwardWinners` (row on mobile, grid on desktop), `player_awards` | yes |
| 4 | Regular season by the numbers: games, goals, goals/game, OT/SO games, penalties (counts; penalty *minutes* aren't tracked) | final **regular-season** games + `game_events` | totals from `season_player_stats` where available, else omitted |
| 5 | Final standings (`DataTable`, regular season) | `getStandings` / `getHistoricalStandings` | yes |
| 6 | Regular-season leaders: top 5 points, goals, assists; goalies top 5 by GAA (min. games as the Vezina rule) and wins | `getSeasonFinalizeInputs` + `computeSeasonTotals` (regular only, as today) for seasons with games; `season_player_stats` otherwise | yes |
| 7 | Regular-season notable moments, each linking to its game: biggest win margin, highest-scoring game, hat tricks (≥3 goals by one player in a game), longest win streak per team, best single-game points | pure functions over final regular-season games + goal events, in `lib/season-recap.ts`, tested | omitted |
| 7b | **Playoffs** (only when at least one playoff game is final): the path (SF1, SF2, Championship as `GameRow`s, OT/SO marked), playoff leaders (top 5 points; goalies by GA and wins), playoff notable moments (same definitions, playoff games only), playoff games/goals count | a playoff-games variant of the totals: `computeSeasonTotals` gains a `kind` option (`"regular"` default, `"playoff"`), tested; moments reuse the same functions on playoff games | omitted (no game data) |
| 8 | Media gallery (PR 3) | `season_media` | yes |
| 9 | Locker Room | read-only list of that season's **site-board** posts via `getBoardPosts` with the season's date window (board posts have `game_id` null and no season column), plus a link to the home board archive for that season. Game-discussion threads stay on their game pages (builder's call: keeps the section short on phones; the notable-moment and playoff links lead to those games) | yes (if posts fall in the window) |

Regular season and playoffs are **never mixed** (user decision): sections 4–7 count final regular-season games only, so they match `/stats` and the awards; everything playoff lives in section 7b. Leaders exclude sub appearances (same rule as stats/leaders).

### Links in

- `/stats`: Award Winners section replaced by a slim "Season Recap →" card for the selected season.
- Season selector: a "Recap →" link next to `SeasonSelect` on `/stats` and `/standings` for the selected season.
- Home: when the current season is complete, a "Season Recap" card under the hero.
- Mobile More sheet: "Season recap" → `/recap`.

### AI summary (PR 2)

- Tables (two, because row-level security can't hide individual columns: a draft column on a published row would be readable through the public API):
  - **`season_recaps`** — the published record, publicly readable: `season_id` (PK, FK seasons, on delete cascade), `summary_markdown` text, `input` jsonb (the facts behind the published text), `model` text, `generated_at`, `edited_by` uuid (auth.users, set null), `edited_at`, `published` boolean default true, `published_at`. RLS: select where `published`; admins (`is_admin()`) all.
  - **`season_recap_drafts`** — the admin working copy: `season_id` (PK, FK, cascade), `draft_markdown`, `input`, `model`, `generated_at`, `edited_by`, `edited_at`. RLS: admins only (no public select).
  - Generate/Regenerate/Edit write the draft. Publish upserts the draft into `season_recaps` (published = true). Unpublish sets `published = false`. Regenerating never changes what the league sees until the admin publishes again. (Deviation from the brief's single-table sketch, for the reason above; it keeps the brief's columns.)
- **Facts JSON** (built server-side, compact): season name and dates; final standings (team, W-L-OTL, PTS, GF, GA); regular-season top-5 leaders and notable moments; playoff results (round, teams, score, OT/SO), playoff leaders and playoff moments, kept in a separate `playoffs` object; champion; award winners by award. Pure `buildRecapFacts(...)`, tested.
- **Prompt**: fun, friendly recap for a rec "Mostly Over The Hill" league; 250–400 words, 3–5 short paragraphs of markdown; use only the provided facts; never invent stats, quotes or names; mention the champion, the playoff run, award winners and 2–3 storylines. Pure `buildRecapPrompt(facts)`, tested (contains each fact section, contains the "only these facts" rule).
- **Generation**: admin-only server action → `generateText` (OpenRouter) with a larger output budget than game write-ups (needs an optional `maxTokens` on `generateText`, default unchanged). Depends on `chore/write-up-models` (DeepSeek defaults + low reasoning) merging to staging first; PR 2 adds `maxTokens` on top of it. Stores markdown, input, model; leaves `published` as is (regenerate never auto-publishes).
- **Admin UI** on the recap page: Generate / Regenerate, Edit (markdown textarea with live preview), Publish / Unpublish. Shows "Draft — not visible to the league" while unpublished.
- **Render**: `react-markdown` (already used) without raw HTML — safe by default. "Written with AI from league stats" note (13px); "edited by an admin" when edited.
- **Fact check**: a pure `numbersNotInFacts(markdown, facts)` helper lists numbers in the text that don't appear in the facts JSON; the admin editor shows that list as a warning before publishing. (Covers the "never invent stats" anti-goal mechanically for numbers.)

### Media (PR 3)

- Table **`season_media`**: `id` uuid PK, `season_id` FK (cascade), `blob_url`, `pathname` (unique), `content_type`, `size_bytes`, `width`, `height` (nullable), `caption`, `uploaded_by` (auth.users, set null), `created_at`, `sort_order` int. RLS: public select; admin insert/update/delete.
- **`lib/storage.ts`** wraps `@vercel/blob` (`del`, `head`) and the upload route helpers so storage can move to R2 later.
- **Upload flow**: browser → `upload()` from `@vercel/blob/client` → `POST /api/media/upload` (`handleUpload`). `onBeforeGenerateToken` checks the session is admin (rejects otherwise), validates the pathname prefix, and sets `allowedContentTypes` (image/jpeg, image/png, image/webp, image/heic, image/gif, video/mp4, video/quicktime, application/pdf) and `maximumSizeInBytes` (20 MB images/PDF, 200 MB video), `addRandomSuffix: true`. **After `upload()` resolves, the client calls an admin server action `recordSeasonMedia`** that re-checks admin, verifies the URL is on the store's host and under the season's prefix, reads size/type via `head()`, and inserts the row. `onUploadCompleted` is not relied on, because Blob can't call back to `localhost` (so local dev works without a tunnel).
- **Paths**: production `seasons/{slug}/…`; any other environment `dev/seasons/{slug}/…` so local/preview test files never mix with real media in the shared store.
- **Admin UI**: drag-and-drop zone on desktop; "Add photos & videos" button (native picker, `multiple`, camera roll) on mobile; per-file progress bars; caption editing; delete (removes blob then row); reorder (move up/down buttons, 44px, keyboard-accessible).
- **Display**: grid (2 columns mobile, 3–4 desktop) of `next/image` with `sizes`, lazy below the fold, `alt` from caption (fallback "Photo from <Season>"); videos inline with `preload="metadata"` (first frame as poster); PDFs/other files in a list with icon, name, size, download link. Lightbox: native `<dialog>` with swipe (pointer events) on touch, ←/→ and Escape on keyboard, captions, focus restore.
- **HEIC**: the picker's `accept` lists JPEG/PNG/WebP/GIF/MP4/MOV/PDF; iOS then converts camera-roll HEIC to JPEG on upload. HEIC files that still arrive are shown in the file list (browsers other than Safari can't render them).
- `next.config` `images.remotePatterns`: `https://*.public.blob.vercel-storage.com`.

### Admin workflow after finalizing (user requirement)

Finalizing a season is the trigger for its recap. Any complete season (including one already finalized before this ships, e.g. the current production season) can get a recap at any time; nothing is generated automatically.

- **Finalize page** (`/admin/seasons/[id]/finalize`): once `finalized_at` is set, show a "Season recap →" link to `/seasons/{slug}/recap`, next to the existing "Finalized …" note.
- **Admin seasons list** (`/admin/seasons`): each complete season shows a "Recap" link.
- **Recap page, as admin**: an admin panel at the top of the summary section. With no summary yet: "Generate summary". With a draft: Edit, Regenerate, Publish. With a published summary: Edit, Unpublish (and Regenerate, which creates a new draft without unpublishing until the admin publishes again). Media upload controls sit at the top of the gallery (PR 3).
- **Re-finalizing** a season (which rewrites stored totals) does not touch an existing summary; the live sections update on their own, and the admin can regenerate if the story is now wrong.

### Cleanup

- Remove Award Winners from `/stats` (StatsExplorer `awards()` and its mobile/desktop placements). Keep `AwardWinners` (moves to the recap) and player-page badges.

## Left to the builder

Exact visual layout within each section (follow existing components), notable-moment tie-breaking, empty-state copy, the OG image composition, and test fixtures — following the decisions above.

## Verification (from the brief)

Lint, typecheck, build, tests, migrations apply on a clean local reset. Screenshots of a complete season's recap at 360, 390, 430 and 1440: no overflow, 44px targets, award row swipes, lightbox works. As admin: generate, edit, publish a summary; upload 3 images, 1 video, 1 PDF; caption, reorder, delete. Logged out / non-admin: no controls, and the upload route rejects. Spot-check the summary's numbers against standings/stats. List required env vars (`BLOB_READ_WRITE_TOKEN`, `OPENROUTER_API_KEY`, `WRITE_UP_MODEL`/`WRITE_UP_FALLBACK_MODEL`).

Local test data: no local season is complete with played playoffs; a local-only seed of a completed season (all games final, playoffs played, awards) is needed for screenshots.
