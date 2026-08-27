# Player Availability / Check-in — Design

**Date:** 2026-08-26
**Status:** Approved; building in two increments (Increment 1 detailed below, Increment 2 outlined).

## Problem

A signed-in user linked to a player has no way to say whether they'll be at their
next game. Captains have no pre-game headcount. Today `game_appearances` only
records who *actually played* (set by the scorekeeper when a game goes live) —
there's no pre-game RSVP concept.

## Goal

Let a linked player mark **In / Out** for their next game from the Account page,
and (Increment 2) let captains/admins see a per-game in/out list.

## Data model (new) — migration `0009_game_availability.sql`

```sql
create type availability_status as enum ('in', 'out');

create table game_availability (
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  status     availability_status not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table game_availability enable row level security;

-- A signed-in user manages availability for the player linked to them.
create policy "players manage own availability" on game_availability for all
  using (player_id in (select id from public.players where user_id = auth.uid()))
  with check (player_id in (select id from public.players where user_id = auth.uid()));

-- Availability is public-readable (matches the app's open-read posture). This
-- avoids depending on a captains role that isn't set up yet; Increment 2 gates
-- WHO sees the per-game list in the UI, not the row-level read.
create policy "public read availability" on game_availability for select
  using (true);
```

Notes:
- No row for a (game, player) = "no response". Statuses are only `in`/`out`.
- Read is open (consistent with the rest of the schema — see DATABASE.md); only
  writes are gated (to the row's own linked player).
- Creating a new enum type and using it in the same migration is fine (unlike
  *adding a value* to an existing enum — the gotcha in DEVELOPMENT.md).
- Grants: migrations add none; cloud relies on Supabase default privileges, as
  every other table does. (Local dev needs the `supabase/.temp`/grants seed
  workaround — see Testing.)

## Increment 1 — player side (this spec's build target)

### Server action — `app/account/actions.ts`: `setAvailability`

```ts
export async function setAvailability(input: {
  gameId: string;
  status: "in" | "out" | null; // null clears the row (back to no-response)
}): Promise<{ ok: true } | { ok: false; error: string }>
```

1. `supabase.auth.getUser()`; if no user → `{ ok: false, error: "Not signed in." }`.
2. Resolve the linked player: `players.select("id").eq("user_id", user.id).maybeSingle()`.
   If none → `{ ok: false, error: "No player linked to your account." }`.
3. Validate `gameId` non-empty and `status` in `in`/`out`/`null`.
4. If `status === null` → `delete` the `(gameId, player_id)` row. Else `upsert`
   `{ game_id, player_id, status, updated_at: now() }` (onConflict `game_id,player_id`).
5. `revalidatePath("/account")`. Return `{ ok: true }` (or the DB error).

### Account page (`app/account/page.tsx`)

When the user is linked to a player, load (in the existing `Promise.all`, scoped
via `getCurrentSeason()`):
- current-season roster row: `team_players` (join `team(name,slug,color)`,
  `jersey_number`, `position`) where `player_id = linked.id` and
  `season_id = current`.
- next game: `games` where `season_id = current`, `status = 'scheduled'`,
  (`home_team_id` or `away_team_id` = their team), `scheduled_at >= now`, order
  `scheduled_at` asc, limit 1 — with home/away team refs.
- current availability: `game_availability.status` for `(nextGame.id, linked.id)`.

Render additions:
- Keep the existing **Linked player** row + **View your profile →** link
  (already implemented).
- A new **YOUR NEXT GAME** card:
  - Team chip (color + name via `TeamBadge`) + `#<jersey> · <position>`.
  - The game: date/time (via `formatDate`/`formatTime`), "vs <opponent>",
    location if present. (If no upcoming game → "No upcoming games scheduled.")
  - An **IN / OUT** check-in control: a minimal client component
    `CheckInToggle` (props: `gameId`, initial `status`) using the scorekeeper's
    `useTransition` pattern. It renders two buttons reflecting current status
    (IN = goal/green filled when active, OUT = ice when active); tapping IN
    calls `setAvailability({ gameId, status: "in" })`, tapping the already-active
    status calls it with `status: null` (clears), then `router.refresh()`. On a
    failed result it shows an inline error. A client component is used (rather
    than plain redirecting forms) because `setAvailability` returns a result
    object and the toggle needs the re-tap-to-clear + inline-error UX.

If the user has **no linked player**: show today's "Not linked yet…" hint and no
next-game card.

### Testing (Increment 1)

No test runner. Verify with `bunx tsc --noEmit`, `bun run lint`, `bun run build`
(catches `"use server"`/RSC issues), and a manual local check on `/account`
signed in as a linked user:
- Ensure the local DB grants authenticated access to the new table (the
  `game_availability` table needs the same local grant workaround as other
  tables; apply grants or run the seed grant fix before testing).
- Link `admin@moth.test` to a rostered player, open `/account`: confirm the team
  chip, next game, and IN/OUT toggle render; set IN → persists + shows active;
  re-tap IN → clears; set OUT → persists. Verify rows in `game_availability`.
- Confirm a non-linked account shows no card and no errors.

## Increment 2 — captain/admin visibility (outline, separate spec/PR)

On the existing game page `/games/[id]` for upcoming games, a section shown only
to captains/admins (`getSessionIfRole(["team_captain","admin"])`) listing, per
team, each rostered player's status (In / Out / No response), read from
`game_availability` joined to the season roster. Read-only. No writes there.

## Files touched (Increment 1)

- `supabase/migrations/0009_game_availability.sql` — new table + RLS.
- `lib/supabase/database.types.ts` — regenerate/add `game_availability` +
  `availability_status` enum.
- `app/account/actions.ts` — `setAvailability` action.
- `app/account/page.tsx` — next-game card + team chip + check-in wiring.
- `components/CheckInToggle.tsx` — client toggle calling `setAvailability`.
