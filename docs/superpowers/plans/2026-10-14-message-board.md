# Message Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public-read message board at `/board` plus a discussion thread on each `/games/[id]`, where only users linked to a roster player can post or reply (issue #140).

**Architecture:** A single `posts` table (`game_id` null = site board, `parent_id` null = top-level). DB triggers enforce one-level threading and a rate limit; RLS and column grants enforce who can write what. Pages are server components reading via `lib/queries.ts`; mutations are server actions in `app/board/actions.ts`; small client components handle the compose, edit and delete UI.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), Tailwind v4, `react-markdown` + `remark-gfm`, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-14-message-board-design.md`

## Global Constraints

- Branch: `feat/message-board` (already created off `staging`). Commit after each task. Do not push.
- Use `bun` / `bunx` (never npm/npx). The `supabase` CLI is invoked as `bunx supabase`.
- Next.js 16: check `node_modules/next/dist/docs/` before using any Next API you're unsure of. `params` and `searchParams` are Promises.
- Body: 1–2000 characters after trimming.
- Rate limit: at most 5 posts per minute and 50 per rolling 24 hours per user (posts and replies combined).
- Threading: one level only. Top-level newest first; replies oldest first.
- Posting requires a linked player (`players.user_id = auth.uid()`). Admins are no exception for posting.
- Authors edit their own posts; admins edit and delete any post; authors cannot delete. Hard delete; replies cascade.
- Markdown: GFM, no raw HTML (no `rehype-raw`), no images; links get `target="_blank" rel="nofollow noopener noreferrer"`.
- Author display: `"First Last"` linked to `/players/[id]`; if no linked player, `"Former player"` with no link.
- Error copy, verbatim:
  - `"You're posting too fast — try again in a minute."`
  - `"That post can't be replied to."`
  - `"Only linked players can post."`
  - `"Your account isn't linked to a player yet — ask an admin."`
  - `"Sign in to post"`
- Match existing styles: button class string from `components/WriteUpAdminControls.tsx`, `toast` from `sonner`, `ActionResult` / `ok` / `fail` from `lib/action-result.ts`.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/0027_posts.sql` (create) | Table, indexes, `is_linked_player()`, triggers, grants, RLS |
| `supabase/seed.sql` (modify) | Link `player@moth.test` and `admin@moth.test` to seed players for local testing |
| `lib/supabase/database.types.ts` (regenerate) | Generated types |
| `lib/board.ts` (create) | Pure: `BODY_MAX`, `validateBody`, `postErrorMessage`, `buildThreads`, `formatRelative`, types |
| `lib/board.test.ts` (create) | Unit tests for `lib/board.ts` |
| `lib/auth.ts` (modify) | `getBoardViewer()` |
| `lib/queries.ts` (modify) | `getBoardPosts`, `getGamePosts` |
| `app/board/actions.ts` (create) | `createPost`, `editPost`, `deletePost` |
| `components/PostBody.tsx` (create) | Safe markdown rendering |
| `components/PostForm.tsx` (create, client) | Compose / reply form |
| `components/PostCard.tsx` (create, client) | One post: header, body, edit/delete controls |
| `components/PostThread.tsx` (create, server) | Composer or notice, plus the list of threads |
| `app/board/page.tsx` (create) | `/board` route |
| `app/layout.tsx` (modify) | "Board" nav link |
| `app/games/[id]/page.tsx` (modify) | "Discussion" section |
| `docs/DATABASE.md`, `docs/ARCHITECTURE.md` (modify) | Docs |

---

### Task 1: Database — `posts` table, triggers, RLS, seed links, types

**Files:**
- Create: `supabase/migrations/0027_posts.sql`
- Modify: `supabase/seed.sql` (append at end)
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: table `public.posts(id, author_id, game_id, parent_id, body, created_at, edited_at)`; function `public.is_linked_player() returns boolean`; error messages `posts_rate_limited` and `posts_invalid_parent` (raised with `raise exception '<name>'`, so they appear as the Postgres error `message`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_posts.sql`:

```sql
-- Message board (#140). One table for the site board (game_id is null) and
-- per-game threads. Threads are one level deep: replies point at a top-level
-- post. Anyone can read; only users linked to a roster player can post.

create table posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users(id) on delete cascade,
  game_id    uuid references games(id) on delete cascade,
  parent_id  uuid references posts(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index posts_feed_idx    on posts (game_id, parent_id, created_at desc);
create index posts_replies_idx on posts (parent_id, created_at);
create index posts_author_idx  on posts (author_id, created_at desc);

-- True when the caller is linked to a roster player.
create or replace function public.is_linked_player()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from players where user_id = auth.uid());
$$;

-- One-level threading + per-user rate limit.
create or replace function public.posts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent posts%rowtype;
begin
  if new.parent_id is not null then
    select * into parent from posts where id = new.parent_id;
    if not found
       or parent.parent_id is not null
       or parent.game_id is distinct from new.game_id then
      raise exception 'posts_invalid_parent';
    end if;
  end if;

  if (select count(*) from posts
        where author_id = new.author_id
          and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from posts
        where author_id = new.author_id
          and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'posts_rate_limited';
  end if;

  return new;
end;
$$;

create trigger posts_before_insert
  before insert on posts
  for each row execute function public.posts_before_insert();

create or replace function public.posts_touch_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger posts_touch_edited_at
  before update on posts
  for each row execute function public.posts_touch_edited_at();

-- Only the body is editable through the API.
revoke update on posts from anon, authenticated;
grant update (body) on posts to authenticated;

alter table posts enable row level security;

create policy "public read posts" on posts for select
  using (true);

create policy "linked players create posts" on posts for insert
  with check (author_id = auth.uid() and public.is_linked_player());

create policy "authors and admins edit posts" on posts for update
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "admins delete posts" on posts for delete
  using (public.is_admin());
```

- [ ] **Step 2: Link seed users to players**

Append to the end of `supabase/seed.sql`:

```sql

-- ---------- message board (#140) ----------
-- Link dev users to roster players so they can post locally.
-- scorekeeper@moth.test stays unlinked to exercise the "not linked" state.
update players set user_id = 'f0000000-0000-0000-0000-000000000003'
  where id = '20000000-0000-0000-0000-000000000102'; -- player@ → Wayne Gretzky
update players set user_id = '7d01ac6b-7077-45c2-8b1c-41e7b15e7f41'
  where id = '20000000-0000-0000-0000-000000000101'; -- admin@ → Doug Morand
```

- [ ] **Step 3: Apply locally**

Run: `bunx supabase db reset`
Expected: finishes with no errors and reports `0027_posts.sql` applied.

- [ ] **Step 4: Verify the rules in SQL**

Run `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` and paste:

```sql
-- As player@ (linked): a top-level post and a reply succeed.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}';
insert into posts (id, author_id, body) values
  ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'hello');
insert into posts (id, author_id, parent_id, body) values
  ('a0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'reply');
-- Reply to a reply → ERROR: posts_invalid_parent
insert into posts (author_id, parent_id, body) values
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'nested');
rollback;

-- Column grant: changing author_id → ERROR: permission denied for table posts
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}';
insert into posts (id, author_id, body) values
  ('a0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'x');
update posts set author_id = '7d01ac6b-7077-45c2-8b1c-41e7b15e7f41'
  where id = 'a0000000-0000-0000-0000-000000000003';
rollback;

-- Rate limit: the 6th insert → ERROR: posts_rate_limited
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}';
insert into posts (author_id, body)
  select 'f0000000-0000-0000-0000-000000000003', 'p' || g from generate_series(1, 6) g;
rollback;

-- As scorekeeper@ (unlinked) → ERROR: new row violates row-level security policy
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into posts (author_id, body) values ('f0000000-0000-0000-0000-000000000002', 'nope');
rollback;
```

Expected: the first block's first two inserts succeed and the third fails with `posts_invalid_parent`; the second block fails with `permission denied`; the third with `posts_rate_limited`; the fourth with `row-level security`. (The rate-limit block works in one statement because a volatile `BEFORE ROW` trigger sees rows inserted earlier in the same command.)

- [ ] **Step 5: Regenerate types**

Run: `bunx supabase gen types typescript --local > lib/supabase/database.types.ts`
Then: `grep -n "posts: {" lib/supabase/database.types.ts`
Expected: one match.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0027_posts.sql supabase/seed.sql lib/supabase/database.types.ts
git commit -m "feat(board): posts table with threading, rate limit and RLS (#140)"
```

---
### Task 2: Pure board helpers (`lib/board.ts`)

**Files:**
- Create: `lib/board.ts`
- Test: `lib/board.test.ts`

**Interfaces:**
- Produces (all exported from `lib/board.ts`):
  - `BODY_MAX = 2000`
  - `type PostRow = { id: string; author_id: string; game_id: string | null; parent_id: string | null; body: string; created_at: string; edited_at: string | null }`
  - `type AuthorRow = { id: string; first_name: string; last_name: string; user_id: string | null }`
  - `type Post = { id: string; authorId: string; author: { playerId: string; name: string } | null; gameId: string | null; body: string; createdAt: string; editedAt: string | null }`
  - `type Thread = Post & { replies: Post[] }`
  - `validateBody(raw: string): { ok: true; body: string } | { ok: false; error: string }`
  - `postErrorMessage(err: { code?: string; message: string }): string`
  - `buildThreads(top: PostRow[], replies: PostRow[], authors: AuthorRow[]): Thread[]` — keeps `top` order; replies sorted oldest first.
  - `formatRelative(iso: string, now?: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/board.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  BODY_MAX,
  buildThreads,
  formatRelative,
  postErrorMessage,
  validateBody,
  type AuthorRow,
  type PostRow,
} from "./board";

describe("validateBody", () => {
  test("trims and accepts normal text", () => {
    expect(validateBody("  hi there \n")).toEqual({ ok: true, body: "hi there" });
  });

  test("rejects empty and whitespace-only", () => {
    expect(validateBody("")).toEqual({ ok: false, error: "Post can't be empty." });
    expect(validateBody("   \n ")).toEqual({ ok: false, error: "Post can't be empty." });
  });

  test("accepts exactly BODY_MAX characters, rejects one more", () => {
    expect(validateBody("a".repeat(BODY_MAX)).ok).toBe(true);
    expect(validateBody("a".repeat(BODY_MAX + 1))).toEqual({
      ok: false,
      error: `Posts must be ${BODY_MAX} characters or fewer.`,
    });
  });

  test("length is measured after trimming", () => {
    expect(validateBody(`  ${"a".repeat(BODY_MAX)}  `).ok).toBe(true);
  });
});

describe("postErrorMessage", () => {
  test("maps trigger errors", () => {
    expect(postErrorMessage({ message: "posts_rate_limited" })).toBe(
      "You're posting too fast — try again in a minute.",
    );
    expect(postErrorMessage({ message: "posts_invalid_parent" })).toBe("That post can't be replied to.");
  });

  test("maps RLS violations", () => {
    expect(
      postErrorMessage({ code: "42501", message: 'new row violates row-level security policy for table "posts"' }),
    ).toBe("Only linked players can post.");
  });

  test("falls back to a generic message", () => {
    expect(postErrorMessage({ code: "XX000", message: "boom" })).toBe("Something went wrong — please try again.");
  });
});

describe("buildThreads", () => {
  const row = (over: Partial<PostRow>): PostRow => ({
    id: "p",
    author_id: "u1",
    game_id: null,
    parent_id: null,
    body: "b",
    created_at: "2026-10-14T12:00:00Z",
    edited_at: null,
    ...over,
  });
  const authors: AuthorRow[] = [{ id: "pl1", first_name: "Wayne", last_name: "Gretzky", user_id: "u1" }];

  test("attaches authors and replies (oldest first), keeping top-level order", () => {
    const top = [row({ id: "t2", created_at: "2026-10-14T13:00:00Z" }), row({ id: "t1" })];
    const replies = [
      row({ id: "r2", parent_id: "t1", created_at: "2026-10-14T12:10:00Z" }),
      row({ id: "r1", parent_id: "t1", created_at: "2026-10-14T12:05:00Z" }),
    ];
    const threads = buildThreads(top, replies, authors);
    expect(threads.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(threads[0].replies).toEqual([]);
    expect(threads[1].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(threads[1].author).toEqual({ playerId: "pl1", name: "Wayne Gretzky" });
    expect(threads[1].authorId).toBe("u1");
  });

  test("author is null when no linked player", () => {
    const [t] = buildThreads([row({ id: "t", author_id: "ghost" })], [], authors);
    expect(t.author).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  test("buckets", () => {
    expect(formatRelative("2026-10-14T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-14T11:55:00Z", now)).toBe("5m ago");
    expect(formatRelative("2026-10-14T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelative("2026-10-12T12:00:00Z", now)).toBe("2d ago");
  });

  test("falls back to a date after 7 days", () => {
    expect(formatRelative("2026-10-01T18:00:00Z", now)).toBe("Thu, Oct 1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/board.test.ts`
Expected: FAIL — `Cannot find module './board'`.

- [ ] **Step 3: Implement**

Create `lib/board.ts`:

```ts
import { formatDate } from "./format";

export const BODY_MAX = 2000;

export type PostRow = {
  id: string;
  author_id: string;
  game_id: string | null;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type AuthorRow = { id: string; first_name: string; last_name: string; user_id: string | null };

export type Post = {
  id: string;
  authorId: string;
  author: { playerId: string; name: string } | null;
  gameId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

export type Thread = Post & { replies: Post[] };

export function validateBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Post can't be empty." };
  if (body.length > BODY_MAX) return { ok: false, error: `Posts must be ${BODY_MAX} characters or fewer.` };
  return { ok: true, body };
}

// Maps Postgres errors from the posts triggers / RLS to user-facing text.
export function postErrorMessage(err: { code?: string; message: string }): string {
  if (err.message.includes("posts_rate_limited")) return "You're posting too fast — try again in a minute.";
  if (err.message.includes("posts_invalid_parent")) return "That post can't be replied to.";
  if (err.code === "42501") return "Only linked players can post.";
  return "Something went wrong — please try again.";
}

export function buildThreads(top: PostRow[], replies: PostRow[], authors: AuthorRow[]): Thread[] {
  const byUser = new Map(
    authors.filter((a) => a.user_id).map((a) => [a.user_id!, { playerId: a.id, name: `${a.first_name} ${a.last_name}` }]),
  );
  const toPost = (r: PostRow): Post => ({
    id: r.id,
    authorId: r.author_id,
    author: byUser.get(r.author_id) ?? null,
    gameId: r.game_id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  });
  const sortedReplies = [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return top.map((t) => ({
    ...toPost(t),
    replies: sortedReplies.filter((r) => r.parent_id === t.id).map(toPost),
  }));
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const secs = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(iso);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/board.test.ts`
Expected: all pass. (The 7-day fallback input uses 18:00Z so it is Oct 1 in every US timezone.)

Then: `bun run test`
Expected: the whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add lib/board.ts lib/board.test.ts
git commit -m "feat(board): pure helpers for validation, errors, threading, relative time (#140)"
```

---
### Task 3: Viewer context and read queries

**Files:**
- Modify: `lib/auth.ts` (append)
- Modify: `lib/queries.ts` (append; add one import)

**Interfaces:**
- Consumes: `buildThreads`, `PostRow`, `AuthorRow`, `Thread` from `lib/board.ts` (Task 2); `posts` table (Task 1).
- Produces:
  - `type BoardViewer = { userId: string; isAdmin: boolean; isLinked: boolean }` and `getBoardViewer(): Promise<BoardViewer | null>` in `lib/auth.ts`
  - `getBoardPosts(opts?: { before?: string }): Promise<{ threads: Thread[]; nextCursor: string | null }>` in `lib/queries.ts`
  - `getGamePosts(gameId: string): Promise<Thread[]>` in `lib/queries.ts`

- [ ] **Step 1: Add `getBoardViewer` to `lib/auth.ts`**

Append:

```ts
export type BoardViewer = { userId: string; isAdmin: boolean; isLinked: boolean };

// Who's looking at a message board, and what they may do there. Posting
// requires a linked roster player; admins can edit/delete regardless.
export async function getBoardViewer(): Promise<BoardViewer | null> {
  const session = await getAuthSession();
  if (!session) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("players").select("id").eq("user_id", session.userId).maybeSingle();
  return { userId: session.userId, isAdmin: session.role === "admin", isLinked: !!data };
}
```

- [ ] **Step 2: Add the queries to `lib/queries.ts`**

Add to the imports at the top:

```ts
import { buildThreads, type AuthorRow, type PostRow, type Thread } from "./board";
```

Append:

```ts
const POST_COLUMNS = "id, author_id, game_id, parent_id, body, created_at, edited_at";
const BOARD_PAGE_SIZE = 20;

// Replies + author names for a page of top-level posts.
async function hydrateThreads(top: PostRow[]): Promise<Thread[]> {
  if (top.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data: replies } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .in("parent_id", top.map((p) => p.id));
  const all = [...top, ...(replies ?? [])];
  const userIds = [...new Set(all.map((p) => p.author_id))];
  const { data: authors } = await supabase
    .from("players")
    .select("id, first_name, last_name, user_id")
    .in("user_id", userIds);
  return buildThreads(top, (replies ?? []) as PostRow[], (authors ?? []) as AuthorRow[]);
}

// Site board: newest 20 top-level posts older than `before` (an ISO timestamp cursor).
export async function getBoardPosts(
  opts: { before?: string } = {},
): Promise<{ threads: Thread[]; nextCursor: string | null }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .is("game_id", null)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(BOARD_PAGE_SIZE + 1);
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data } = await query;
  const rows = (data ?? []) as PostRow[];
  const page = rows.slice(0, BOARD_PAGE_SIZE);
  return {
    threads: await hydrateThreads(page),
    nextCursor: rows.length > BOARD_PAGE_SIZE ? page[page.length - 1].created_at : null,
  };
}

// Per-game discussion: every top-level post for the game, newest first.
export async function getGamePosts(gameId: string): Promise<Thread[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("game_id", gameId)
    .is("parent_id", null)
    .order("created_at", { ascending: false });
  return hydrateThreads((data ?? []) as PostRow[]);
}
```

- [ ] **Step 3: Type-check and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts lib/queries.ts
git commit -m "feat(board): board viewer context and post queries (#140)"
```

---

### Task 4: Server actions

**Files:**
- Create: `app/board/actions.ts`

**Interfaces:**
- Consumes: `getBoardViewer` (Task 3); `validateBody`, `postErrorMessage` (Task 2); `ok`, `fail`, `ActionResult` from `lib/action-result.ts`.
- Produces:
  - `createPost(input: { body: string; gameId?: string | null; parentId?: string | null }): Promise<ActionResult>`
  - `editPost(input: { id: string; body: string }): Promise<ActionResult>`
  - `deletePost(input: { id: string }): Promise<ActionResult>`

- [ ] **Step 1: Write the actions**

Create `app/board/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getBoardViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { postErrorMessage, validateBody } from "@/lib/board";

function revalidateBoard(gameId: string | null) {
  revalidatePath("/board");
  if (gameId) revalidatePath(`/games/${gameId}`);
}

// Writes go through the request client, so RLS enforces the same rules the
// checks below report; the triggers enforce threading and the rate limit.
export async function createPost(input: {
  body: string;
  gameId?: string | null;
  parentId?: string | null;
}): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  if (!viewer.isLinked) return fail("Only linked players can post.");
  const valid = validateBody(input.body);
  if (!valid.ok) return fail(valid.error);

  const gameId = input.gameId ?? null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("posts").insert({
    author_id: viewer.userId,
    game_id: gameId,
    parent_id: input.parentId ?? null,
    body: valid.body,
  });
  if (error) return fail(postErrorMessage(error));
  revalidateBoard(gameId);
  return ok(input.parentId ? "Reply posted" : "Posted");
}

export async function editPost(input: { id: string; body: string }): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  const valid = validateBody(input.body);
  if (!valid.ok) return fail(valid.error);

  const supabase = await createSupabaseServerClient();
  const { data: post } = await supabase.from("posts").select("author_id, game_id").eq("id", input.id).maybeSingle();
  if (!post) return fail("Post not found.");
  if (post.author_id !== viewer.userId && !viewer.isAdmin) return fail("You can only edit your own posts.");

  const { error } = await supabase.from("posts").update({ body: valid.body }).eq("id", input.id);
  if (error) return fail(postErrorMessage(error));
  revalidateBoard(post.game_id);
  return ok("Saved");
}

export async function deletePost(input: { id: string }): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  if (!viewer.isAdmin) return fail("Admins only.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("posts").delete().eq("id", input.id).select("game_id");
  if (error) return fail(postErrorMessage(error));
  if (!data || data.length === 0) return fail("Post not found.");
  revalidateBoard(data[0].game_id);
  return ok("Deleted");
}
```

- [ ] **Step 2: Type-check and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/board/actions.ts
git commit -m "feat(board): create/edit/delete post server actions (#140)"
```

---
### Task 5: Board UI components, `/board` page, nav link

**Files:**
- Create: `components/PostBody.tsx`, `components/PostForm.tsx`, `components/PostCard.tsx`, `components/PostThread.tsx`, `app/board/page.tsx`
- Modify: `app/layout.tsx` (`navLinks`, around line 65)

**Interfaces:**
- Consumes: `Thread`, `Post`, `BODY_MAX`, `formatRelative` (Task 2); `BoardViewer`, `getBoardViewer` (Task 3); `getBoardPosts` (Task 3); `createPost`, `editPost`, `deletePost` (Task 4).
- Produces:
  - `PostBody({ body }: { body: string })` — server-safe markdown renderer
  - `PostForm({ gameId, parentId }: { gameId: string | null; parentId?: string })` — client
  - `PostCard({ post, when, canEdit, canDelete, children })` — client
  - `PostThread({ threads, viewer, gameId, empty }: { threads: Thread[]; viewer: BoardViewer | null; gameId: string | null; empty: string })` — server; Task 6 uses it on the game page.

- [ ] **Step 1: `components/PostBody.tsx`**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// User-written markdown. No rehype-raw, so raw HTML is never rendered;
// images are dropped; links open in a new tab and carry no SEO credit.
export function PostBody({ body }: { body: string }) {
  return (
    <div className="prose-rink text-[14.5px] leading-relaxed text-ink-dim break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: `components/PostForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPost } from "@/app/board/actions";
import { BODY_MAX } from "@/lib/board";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

// Compose box for a new top-level post, or (with parentId) a reply that
// stays collapsed behind a "Reply" button until opened.
export function PostForm({ gameId, parentId }: { gameId: string | null; parentId?: string }) {
  const [open, setOpen] = useState(!parentId);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        Reply
      </button>
    );
  }

  const over = body.trim().length > BODY_MAX;
  const submit = () =>
    startTransition(async () => {
      const res = await createPost({ body, gameId, parentId });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Posted");
        setBody("");
        if (parentId) setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label={parentId ? "Reply" : "New post"}
        placeholder={parentId ? "Write a reply… (markdown ok)" : "Write a post… (markdown ok)"}
        rows={parentId ? 3 : 4}
        className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
      />
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || over || !body.trim()} className={btn} onClick={submit}>
          {pending ? "Posting…" : parentId ? "Post reply" : "Post"}
        </button>
        {parentId && (
          <button type="button" disabled={pending} className={btn} onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        <span className={`ml-auto text-[12px] ${over ? "text-goal" : "text-ink-faint"}`}>
          {body.trim().length}/{BODY_MAX}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/PostCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePost, editPost } from "@/app/board/actions";
import type { ActionResult } from "@/lib/action-result";
import { BODY_MAX, type Post } from "@/lib/board";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

// One post. `children` is the server-rendered markdown body; `when` is the
// relative time computed on the server (avoids hydration mismatches).
export function PostCard({
  post,
  when,
  canEdit,
  canDelete,
  children,
}: {
  post: Post;
  when: string;
  canEdit: boolean;
  canDelete: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        after?.();
        router.refresh();
      }
    });

  return (
    <article className="space-y-2">
      <header className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        {post.author ? (
          <Link href={`/players/${post.author.playerId}`} className="font-semibold text-ink hover:text-ice">
            {post.author.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink-dim">Former player</span>
        )}
        <span className="text-ink-faint">· {when}</span>
        {post.editedAt && <span className="text-ink-faint">(edited)</span>}
      </header>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Edit post"
            rows={4}
            className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !body.trim() || body.trim().length > BODY_MAX}
              className={btn}
              onClick={() => run(() => editPost({ id: post.id, body }), () => setEditing(false))}
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                setBody(post.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <span className="ml-auto text-[12px] text-ink-faint">
              {body.trim().length}/{BODY_MAX}
            </span>
          </div>
        </div>
      ) : (
        children
      )}

      {!editing && (canEdit || canDelete) && (
        <div className="flex gap-2">
          {canEdit && (
            <button type="button" disabled={pending} className={btn} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                if (window.confirm("Delete this post? Any replies will be deleted too.")) run(() => deletePost({ id: post.id }));
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: `components/PostThread.tsx`**

```tsx
import Link from "next/link";
import { PostBody } from "@/components/PostBody";
import { PostCard } from "@/components/PostCard";
import { PostForm } from "@/components/PostForm";
import type { BoardViewer } from "@/lib/auth";
import { formatRelative, type Post, type Thread } from "@/lib/board";

// Composer (or why you can't post) followed by top-level posts and their replies.
// Shared by /board (gameId = null) and the game page discussion.
export function PostThread({
  threads,
  viewer,
  gameId,
  empty,
}: {
  threads: Thread[];
  viewer: BoardViewer | null;
  gameId: string | null;
  empty: string;
}) {
  const now = new Date();
  const canPost = !!viewer?.isLinked;
  const card = (post: Post) => (
    <PostCard
      post={post}
      when={formatRelative(post.createdAt, now)}
      canEdit={!!viewer && (viewer.userId === post.authorId || viewer.isAdmin)}
      canDelete={!!viewer?.isAdmin}
    >
      <PostBody body={post.body} />
    </PostCard>
  );

  return (
    <div className="space-y-4">
      {!viewer ? (
        <p className="text-[14px] text-ink-dim">
          <Link href="/login" className="text-ice hover:underline">
            Sign in to post
          </Link>
        </p>
      ) : !viewer.isLinked ? (
        <p className="text-[14px] text-ink-dim">Your account isn&apos;t linked to a player yet — ask an admin.</p>
      ) : (
        <div className="panel p-4">
          <PostForm gameId={gameId} />
        </div>
      )}

      {threads.length === 0 ? (
        <p className="text-[14px] text-ink-dim">{empty}</p>
      ) : (
        <ol className="space-y-3">
          {threads.map((t) => (
            <li key={t.id} className="panel p-4 space-y-3">
              {card(t)}
              {(t.replies.length > 0 || canPost) && (
                <ol className="space-y-3 border-l-2 border-rule pl-4 ml-1">
                  {t.replies.map((r) => (
                    <li key={r.id}>{card(r)}</li>
                  ))}
                  {canPost && (
                    <li>
                      <PostForm gameId={gameId} parentId={t.id} />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `app/board/page.tsx`**

```tsx
import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { PostThread } from "@/components/PostThread";
import { getBoardViewer } from "@/lib/auth";
import { getBoardPosts } from "@/lib/queries";

type SearchParams = Promise<{ before?: string }>;

export default async function BoardPage({ searchParams }: { searchParams: SearchParams }) {
  const { before } = await searchParams;
  const cursor = before && !Number.isNaN(Date.parse(before)) ? before : undefined;
  const [{ threads, nextCursor }, viewer] = await Promise.all([
    getBoardPosts({ before: cursor }),
    getBoardViewer(),
  ]);

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="rise">
        <SectionHeader eyebrow="Locker Room" title="Message Board" size="lg" as="h1" />
      </div>
      <section className="rise delay-1">
        <PostThread threads={threads} viewer={viewer} gameId={null} empty="No posts yet — start the conversation." />
      </section>
      {(nextCursor || cursor) && (
        <nav className="rise delay-2 flex gap-4">
          {cursor && (
            <Link href="/board" className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11">
              ← Newest posts
            </Link>
          )}
          {nextCursor && (
            <Link
              href={`/board?before=${encodeURIComponent(nextCursor)}`}
              className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 ml-auto"
            >
              Older posts →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

In `app/layout.tsx`, change `navLinks` to:

```ts
const navLinks = [
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
  { href: "/stats", label: "Stats" },
  { href: "/board", label: "Board" },
  { href: "/about", label: "About" },
];
```

- [ ] **Step 7: Type-check, lint, build**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: no errors; `/board` listed as a dynamic route in the build output.

- [ ] **Step 8: Smoke-check in the browser**

With `bunx supabase start` running and `bun dev`, open `http://localhost:3001/board`:
- Logged out: "Sign in to post" link, empty-state text, "Board" in the header nav (check a ~390px-wide viewport too — the nav must not overflow).
- Sign in as `player@moth.test` (magic link via Mailpit, see `docs/LOCAL-TESTING.md`): post `**bold** and a [link](https://example.com)`; it appears with "Wayne Gretzky · just now", bold renders, the link opens in a new tab.

- [ ] **Step 9: Commit**

```bash
git add components/PostBody.tsx components/PostForm.tsx components/PostCard.tsx components/PostThread.tsx app/board/page.tsx app/layout.tsx
git commit -m "feat(board): /board page, thread components and nav link (#140)"
```

---
### Task 6: Game page discussion

**Files:**
- Modify: `app/games/[id]/page.tsx` (imports at top; data load near line 91; JSX before the closing `</div>` at line ~619)

**Interfaces:**
- Consumes: `PostThread` (Task 5); `getGamePosts` (Task 3); `getBoardViewer` (Task 3).

- [ ] **Step 1: Imports**

Add next to the existing imports:

```ts
import { PostThread } from "@/components/PostThread";
import { getGamePosts } from "@/lib/queries";
```

and change the auth import to:

```ts
import { getBoardViewer, getSessionIfRole } from "@/lib/auth";
```

- [ ] **Step 2: Load posts and viewer**

Directly after `const viewerIsAdmin = !!(await getSessionIfRole(["admin"]));` add:

```ts
  const [gamePosts, boardViewer] = await Promise.all([getGamePosts(id), getBoardViewer()]);
```

- [ ] **Step 3: Render the section**

Insert as the last child of the page's root `<div className="space-y-5 sm:space-y-8">`, i.e. immediately after the availability `)}` block that closes with `</CollapsibleSection>\n      )}` and before the root's closing `</div>`:

```tsx
      {/* DISCUSSION */}
      <section className="rise delay-1 space-y-4">
        <SectionHeader eyebrow="Locker Room" title="Discussion" />
        <PostThread threads={gamePosts} viewer={boardViewer} gameId={game.id} empty="No posts about this game yet." />
      </section>
```

- [ ] **Step 4: Type-check, lint, build**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: no errors.

- [ ] **Step 5: Smoke-check**

Open any game at `http://localhost:3001/games/<id>` (pick one from `/schedule`). The "Discussion" section is at the bottom. As `player@moth.test`, post and reply; both appear there and **not** on `/board`.

- [ ] **Step 6: Commit**

```bash
git add "app/games/[id]/page.tsx"
git commit -m "feat(board): per-game discussion thread on the game page (#140)"
```

---

### Task 7: Docs and end-to-end verification

**Files:**
- Modify: `docs/DATABASE.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: `docs/DATABASE.md`**

- In the migrations table, add a row after `0026`:
  `| \`0027_posts.sql\` | Message board: \`posts\`, \`is_linked_player()\`, threading + rate-limit triggers, body-only update grant (#140) |`
- Under "Stats, awards, content", add:
  ```markdown
  - **`posts`** — message board (#140). `game_id` null = site board, otherwise a
    game's discussion; `parent_id` null = top-level, otherwise a reply (one level
    only). `body` 1–2000 chars after trim; `edited_at` set on body change. Only
    `body` is updatable through the API (column grant).
  ```
- Under "Helper functions (RLS)", add:
  `- \`is_linked_player()\` (\`0027\`) — a \`players\` row exists with \`user_id = auth.uid()\`. Gates posting.`
- Under "Triggers", add:
  ```markdown
  - **`posts_before_insert`** — rejects replies whose parent is itself a reply or
    belongs to a different game (`posts_invalid_parent`), and enforces the rate
    limit: 5 posts/minute and 50 per 24 hours per author (`posts_rate_limited`).
  - **`posts_touch_edited_at`** — sets `edited_at` when `body` changes.
  ```
- In the RLS summary table, add:
  `| \`posts\` | public | insert: linked player as self; update (\`body\` only): author or admin; delete: admin (replies cascade) |`

- [ ] **Step 2: `docs/ARCHITECTURE.md`**

- In "Routes", add `/board` to the public list: `` `/stats`, `/board`, `/about`, ``.
- After the paragraph about contact info on `/players/[id]`, add:
  ```markdown
  Posting on `/board` and in the game-page discussion requires a signed-in user
  linked to a roster player (`getBoardViewer()` in `lib/auth.ts`, plus RLS);
  reading is public.
  ```

- [ ] **Step 3: Full verification on the local stack**

Run `bunx supabase db reset`, then `bun dev`. Sign in via Mailpit as each user (`docs/LOCAL-TESTING.md`) and confirm:

| As | Check | Expected |
|---|---|---|
| Logged out | `/board` and a game's Discussion | Posts readable; "Sign in to post"; no Reply/Edit/Delete |
| `scorekeeper@moth.test` (unlinked) | `/board` | "Your account isn't linked to a player yet — ask an admin."; no Reply |
| `player@moth.test` | Post, reply, edit own post | All succeed; "(edited)" appears after edit; no Delete button |
| `player@moth.test` | Another user's post | No Edit button |
| `player@moth.test` | 6 posts within a minute | 6th shows "You're posting too fast — try again in a minute." |
| `player@moth.test` | Post containing `<script>alert(1)</script>`, `<b>hi</b>` and `![x](https://example.com/x.png)` | Text is shown escaped or dropped; no alert, no bold from HTML, no image |
| `player@moth.test` | Post of 2001 characters | Post button disabled; counter turns red |
| `admin@moth.test` | Edit and delete player@'s top-level post that has replies | Edit saves; Delete confirms, then the post and its replies are gone |
| Any | `/board?before=garbage` | Renders newest posts (bad cursor ignored) |

Also run: `bun run test && bunx tsc --noEmit && bun run lint && bun run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/DATABASE.md docs/ARCHITECTURE.md
git commit -m "docs: message board schema, RLS and routes (#140)"
```
