# Message Board — Design

**Date:** 2026-10-14
**Status:** Approved 2026-10-14.
**Revised 2026-10-14:** the board moved from `/board` onto the homepage as section 01 (above Upcoming), also rendered off-season; `/board` and its nav link were removed. Actions live in `app/post-actions.ts`; pagination uses `/?before=<cursor>#board`. The homepage shows the newest 5 threads with a "Show N more" button for the rest of the page. Each post shows the author's team (current season, else most recent) as a team-color chip next to their name and a team-color initials avatar (X-style feed), on the homepage and game discussions. The homepage board is season-scoped: a season owns posts from its start date until the next season starts; it shows the current season (else the most recent), and older seasons are a read-only archive at `/?boardSeason=<id>`, linked from the end of each season. No posts are deleted.
**Issue:** #140

## Problem

The site has no place for league members to talk: not league-wide, and not about a specific game.

## Goal

A site-wide board at `/board` and a discussion thread on each `/games/[id]` page. Anyone can read. Only users linked to a roster player can post or reply.

## Decisions

| Topic | Decision |
|---|---|
| Who can post/reply | Signed-in users with a linked `players` row (`players.user_id = auth.uid()`). Admins count only if they are also linked. |
| Who can read | Everyone, including anonymous visitors. |
| Editing | Authors edit their own posts. Admins edit any post. |
| Deleting | Admins only. Hard delete; deleting a top-level post deletes its replies. Authors cannot delete. |
| Threading | One level: top-level posts, each with a flat list of replies (oldest first). Replies to replies are not allowed. |
| Board shape | Feed, not forum topics: body only, no titles. Top-level posts newest first. |
| Freshness | Refresh on post (`revalidatePath`). No Realtime. |
| Formatting | Markdown (GFM). No raw HTML, no images. |
| Abuse limits | Body 1–2000 characters after trimming. At most 5 posts per minute and 50 per rolling 24 hours per user (posts and replies combined). |
| Notifications | None. |

## Data — `supabase/migrations/0027_posts.sql`

```
posts
  id          uuid pk default gen_random_uuid()
  author_id   uuid not null references auth.users(id) on delete cascade
  game_id     uuid null references games(id) on delete cascade   -- null = site board
  parent_id   uuid null references posts(id) on delete cascade   -- null = top-level
  body        text not null check (char_length(trim(body)) between 1 and 2000)
  created_at  timestamptz not null default now()
  edited_at   timestamptz null
```

Indexes: `(game_id, parent_id, created_at desc)` for feeds, `(parent_id, created_at)` for replies, `(author_id, created_at desc)` for the rate limit.

**Helper:** `is_linked_player()`: `security definer`, `search_path = public`. It returns true if a `players` row exists with `user_id = auth.uid()`.

**Insert trigger (`BEFORE INSERT`):**
- If `parent_id` is set, the parent must have `parent_id is null`, and `new.game_id` must equal the parent's `game_id` (both null counts as equal). Otherwise it raises `posts_invalid_parent`.
- If the author already has 5 posts in the last minute or 50 in the last 24 hours, it raises `posts_rate_limited`.

**Update trigger (`BEFORE UPDATE`, `posts_before_update`):** raises `posts_immutable_column` if `id`, `author_id`, `game_id`, `parent_id` or `created_at` change; sets `edited_at = now()` when `body` changes, otherwise keeps the old `edited_at`. (A column grant was the original plan, but local `seed.sql` re-grants all table privileges after migrations, so it would only hold in prod.)

**RLS:**

| Op | Policy |
|---|---|
| select | `true` (public) |
| insert | `author_id = auth.uid() and is_linked_player()` |
| update | `author_id = auth.uid() or is_admin()` |
| delete | `is_admin()` |

After the migration, regenerate `lib/supabase/database.types.ts`.

## Author display

Join `posts.author_id` to `players.user_id`, which is already public. Show the player's name in the site's usual player-name format, linked to `/players/[id]`. If no player is linked anymore (an admin unlinked them), show "Former player" with no link.

## Server code

- **`lib/board.ts`** (pure, unit-tested):
  - `validateBody(raw)`: trims the body; returns `{ ok: true, body }` or `{ ok: false, error }` for empty or over-2000.
  - `postErrorMessage(err)`: maps Postgres errors to user text. `posts_rate_limited` → "You're posting too fast — try again in a minute."; `posts_invalid_parent` → "That post can't be replied to."; RLS violation → "Only linked players can post."; anything else → a generic message.
- **`lib/queries.ts`:**
  - `getBoardPosts({ before?: string })`: the newest 20 top-level posts with `game_id is null` and `created_at < before`, plus all their replies and author names. Returns `{ posts, nextCursor }`.
  - `getGamePosts(gameId)`: all top-level posts for the game plus replies and author names, top-level newest first.
- **`app/board/actions.ts`** (`"use server"`):
  - `createPost({ body, gameId?, parentId? })`
  - `editPost({ id, body })`
  - `deletePost({ id })`

  Each action runs `getAuthSession()` first: create requires a linked player, edit requires the author or an admin, delete requires an admin. Then it validates with `validateBody` and writes through the server client, with RLS as the second line of defense. On success it calls `revalidatePath("/board")` and, when the post has a `game_id`, `revalidatePath("/games/<id>")`. Errors come back as `{ error }` for the form to display.

## UI

- **`/board`** (`app/board/page.tsx`): a header, a compose box (or the notice below), the feed, and an "Older posts" link (`?before=<cursor>`) when `nextCursor` is set.
- **`/games/[id]`**: a "Discussion" section at the bottom, using the same thread component.
- **Header nav:** add "Board".
- **`components/PostThread.tsx`** (server) renders the posts and replies. **`components/PostForm.tsx`** (client) handles compose, reply, and inline edit, and shows a character counter and server errors.
- **Viewer states:**
  - Anonymous: "Sign in to post" with a link to `/login`.
  - Signed in but not linked: "Your account isn't linked to a player yet — ask an admin."
  - Linked: compose box and "Reply" on each top-level post.
  - Author: "Edit" on their own posts.
  - Admin: "Edit" and "Delete" (with a confirm) on every post.
- Each post shows the author, a relative time, and "(edited)" when `edited_at` is set.
- **Markdown:** `components/PostBody.tsx` wraps `react-markdown` with `remark-gfm`. No `rehype-raw`, so raw HTML is never rendered. `img` is disallowed. Links render with `target="_blank" rel="nofollow noopener noreferrer"`.

## Testing

- `bun test`: `lib/board.ts`. Covers trimming, empty, exactly 2000, 2001, and the error-message mapping.
- Browser checks on the local stack (seeded users via Mailpit):
  - Anonymous can read `/board` and the game discussion but sees no compose box.
  - An unlinked user sees the not-linked notice. A direct insert through the API is rejected by RLS.
  - A linked player can post, reply, and edit their own post ("(edited)" appears). They get no Delete button and cannot edit someone else's post.
  - Replying to a reply is rejected.
  - The sixth post within a minute shows the rate-limit message.
  - An admin can edit and delete any post, and deleting a top-level post removes its replies.
  - Markdown renders (bold, lists, links). `<script>`, raw HTML, and image syntax do not render as HTML or images.

## Docs

- `docs/DATABASE.md`: add the migration row, the `posts` table, `is_linked_player()`, the triggers, and the RLS row.
- `docs/ARCHITECTURE.md`: add `/board` to the public routes, and note that posting requires a linked player.

## Out of scope

Notifications, Realtime, reactions or likes, nested replies, author self-delete, reporting or flagging, images and attachments, and search.
