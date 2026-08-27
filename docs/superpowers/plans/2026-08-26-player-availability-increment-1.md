# Player Availability — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A linked player can mark IN/OUT for their next game from the Account page, backed by a new `game_availability` table.

**Architecture:** New `game_availability` table (RLS: manage own, public read) + a `setAvailability` server action + a `CheckInToggle` client component wired into a new "Your Next Game" card on the Account page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres). Package manager `bun`.

## Global Constraints

- **No test runner is configured.** Verification per task = `bunx tsc --noEmit` (exit 0) + `bun run lint` (0 errors; 2 pre-existing warnings in `app/admin/schedule/page.tsx` acceptable). The final task also runs `bun run build` and a manual local check.
- **Spec:** `docs/superpowers/specs/2026-08-26-player-availability-design.md`.
- Writes to `game_availability` are gated (own linked player); reads are public.
- Statuses are only `in` / `out`; no row = "no response".
- Embedded Supabase relations (`home_team:home_team_id(...)`) confuse the typed client — cast results `as unknown as <LocalType>`, matching the existing pattern in `app/players/[id]/page.tsx` and `app/score/[gameId]/page.tsx`.
- Branch: `feat/player-availability` (already created off `staging`). The account page already has an uncommitted edit (the "View your profile →" link) — keep it. Commit with conventional messages. Do not push.

---

### Task 1: `game_availability` migration + regenerated types

**Files:**
- Create: `supabase/migrations/0009_game_availability.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces the `game_availability` table (`game_id`, `player_id`, `status`, `updated_at`) and the `availability_status` enum, and their generated TS types — consumed by Tasks 2 & 3.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_game_availability.sql`:

```sql
-- Pre-game player availability / check-in (In or Out). Distinct from
-- game_appearances (which records who actually played, set at game start).
-- No row for a (game, player) means "no response".

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

-- Availability is public-readable (matches the app's open-read posture).
create policy "public read availability" on game_availability for select
  using (true);
```

- [ ] **Step 2: Apply the migration locally**

Run: `bunx supabase db reset`
Expected: all migrations apply, ending with `Applying migration 0009_game_availability.sql...` and `Finished supabase db reset`.

- [ ] **Step 3: Regenerate the typed client**

Run: `bunx supabase gen types typescript --local > lib/supabase/database.types.ts`
Expected: the file now contains a `game_availability` table type and an `availability_status` enum. Sanity check:
`grep -n "game_availability\|availability_status" lib/supabase/database.types.ts` prints matches.

- [ ] **Step 4: Verify types**

Run: `bunx tsc --noEmit`
Expected: exit 0. (Regenerating types for the whole local schema is safe; this branch's migrations are 0001–0009.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_game_availability.sql lib/supabase/database.types.ts
git commit -m "feat(availability): add game_availability table + RLS"
```

---

### Task 2: `setAvailability` server action

**Files:**
- Modify: `app/account/actions.ts` (append the action)

**Interfaces:**
- Consumes existing imports (`createSupabaseServerClient`, `revalidatePath`) and the `game_availability` table (Task 1).
- Produces: `export async function setAvailability(input: { gameId: string; status: "in" | "out" | null }): Promise<{ ok: true } | { ok: false; error: string }>` — consumed by Task 3.

- [ ] **Step 1: Append `setAvailability` to `app/account/actions.ts`**

Add at the end of the file (the file already imports `revalidatePath` and `createSupabaseServerClient`):

```ts
// A linked player sets their availability for a game. status=null clears the
// row (back to "no response"). Writes are RLS-gated to the caller's own player.
export async function setAvailability(input: {
  gameId: string;
  status: "in" | "out" | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const gameId = input.gameId.trim();
  if (!gameId) return { ok: false, error: "Missing game." };
  if (input.status !== null && input.status !== "in" && input.status !== "out") {
    return { ok: false, error: "Invalid status." };
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!player) return { ok: false, error: "No player linked to your account." };

  if (input.status === null) {
    const { error } = await supabase
      .from("game_availability")
      .delete()
      .eq("game_id", gameId)
      .eq("player_id", player.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("game_availability").upsert(
      {
        game_id: gameId,
        player_id: player.id,
        status: input.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/account");
  return { ok: true };
}
```

- [ ] **Step 2: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors. (`setAvailability` is exported; not-yet-consumed is fine — Task 3 wires it.)

- [ ] **Step 3: Commit**

```bash
git add app/account/actions.ts
git commit -m "feat(availability): add setAvailability action"
```

---

### Task 3: `CheckInToggle` component + "Your Next Game" account card

**Files:**
- Create: `components/CheckInToggle.tsx`
- Modify: `app/account/page.tsx`

**Interfaces:**
- Consumes: `setAvailability` (Task 2); `getCurrentSeason` (`@/lib/queries`); `formatDate`/`formatTime` (`@/lib/format`); `TeamBadge` (`@/components/TeamBadge`).

- [ ] **Step 1: Create `components/CheckInToggle.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAvailability } from "@/app/account/actions";

export function CheckInToggle({
  gameId,
  status,
}: {
  gameId: string;
  status: "in" | "out" | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const set = (choice: "in" | "out") => {
    setError(null);
    const target = status === choice ? null : choice; // re-tap active = clear
    startTransition(async () => {
      const res = await setAvailability({ gameId, status: target });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => set("in")}
          disabled={pending}
          aria-pressed={status === "in"}
          className={`min-h-11 font-display tracking-[0.14em] text-[14px] rounded border transition-colors disabled:opacity-50 ${
            status === "in"
              ? "bg-goal text-board border-goal"
              : "bg-board-3 text-ink-dim border-rule hover:border-goal hover:text-ink"
          }`}
        >
          IN
        </button>
        <button
          type="button"
          onClick={() => set("out")}
          disabled={pending}
          aria-pressed={status === "out"}
          className={`min-h-11 font-display tracking-[0.14em] text-[14px] rounded border transition-colors disabled:opacity-50 ${
            status === "out"
              ? "bg-ice text-board border-ice"
              : "bg-board-3 text-ink-dim border-rule hover:border-ice hover:text-ink"
          }`}
        >
          OUT
        </button>
      </div>
      {error && (
        <p role="alert" className="text-goal text-[12px]">
          {error}
        </p>
      )}
      <p className="eyebrow text-[10px] text-ink-faint">
        {status === "in"
          ? "You're in. Tap IN again to clear."
          : status === "out"
            ? "You're out. Tap OUT again to clear."
            : "No response yet."}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add imports + data loading to `app/account/page.tsx`**

Add these imports after the existing `PhoneInput` import:

```tsx
import { TeamBadge } from "@/components/TeamBadge";
import { CheckInToggle } from "@/components/CheckInToggle";
import { getCurrentSeason } from "@/lib/queries";
import { formatDate, formatTime } from "@/lib/format";
```

Add these local types just below the `SearchParams` type:

```tsx
type TeamRef = { id: string; name: string; slug: string; color: string };
type RosterRow = {
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie";
  team: TeamRef | null;
};
type NextGame = {
  id: string;
  scheduled_at: string;
  location: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};
const POSITION_LABELS: Record<RosterRow["position"], string> = {
  forward: "Forward",
  defense: "Defense",
  goalie: "Goalie",
};
```

After the existing `Promise.all` destructuring (after the `linkedPlayer` query block), add the availability data loading:

```tsx
  let roster: RosterRow | null = null;
  let nextGame: NextGame | null = null;
  let availability: "in" | "out" | null = null;

  if (linkedPlayer) {
    const season = await getCurrentSeason();
    if (season) {
      const { data: rosterRaw } = await supabase
        .from("team_players")
        .select("jersey_number, position, team:team_id(id, name, slug, color)")
        .eq("player_id", linkedPlayer.id)
        .eq("season_id", season.id)
        .maybeSingle();
      roster = rosterRaw as unknown as RosterRow | null;

      if (roster?.team) {
        const teamId = roster.team.id;
        const { data: gameRaw } = await supabase
          .from("games")
          .select(
            "id, scheduled_at, location, " +
              "home_team:home_team_id(id, name, slug, color), " +
              "away_team:away_team_id(id, name, slug, color)",
          )
          .eq("season_id", season.id)
          .eq("status", "scheduled")
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        nextGame = gameRaw as unknown as NextGame | null;

        if (nextGame) {
          const { data: avail } = await supabase
            .from("game_availability")
            .select("status")
            .eq("game_id", nextGame.id)
            .eq("player_id", linkedPlayer.id)
            .maybeSingle();
          availability = (avail?.status as "in" | "out" | undefined) ?? null;
        }
      }
    }
  }
```

- [ ] **Step 3: Render the "Your Next Game" card in `app/account/page.tsx`**

Immediately after the closing `</section>` of the first read-only panel (the one containing Email/Role/Linked player) and before the `<form action={updateProfile}>`, insert:

```tsx
      {roster?.team && (
        <section className="panel p-5 space-y-4 mt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl tracking-[0.06em] text-ink">
              YOUR NEXT GAME
            </h2>
            <span className="flex items-center gap-2 shrink-0">
              <TeamBadge
                name={roster.team.name}
                slug={roster.team.slug}
                color={roster.team.color}
                size="sm"
              />
              <span className="eyebrow text-ink-faint">
                #{roster.jersey_number ?? "—"} · {POSITION_LABELS[roster.position]}
              </span>
            </span>
          </div>

          {nextGame ? (
            <>
              {(() => {
                const teamId = roster.team!.id;
                const opponent =
                  nextGame.home_team?.id === teamId
                    ? nextGame.away_team
                    : nextGame.home_team;
                return (
                  <div className="text-ink">
                    <div className="text-[15px]">
                      vs {opponent?.name ?? "TBD"}
                    </div>
                    <div className="eyebrow text-ink-faint mt-1">
                      {formatDate(nextGame.scheduled_at)} ·{" "}
                      {formatTime(nextGame.scheduled_at)}
                      {nextGame.location ? ` · ${nextGame.location}` : ""}
                    </div>
                  </div>
                );
              })()}
              <CheckInToggle gameId={nextGame.id} status={availability} />
            </>
          ) : (
            <p className="text-ink-faint text-sm">No upcoming games scheduled.</p>
          )}
        </section>
      )}
```

- [ ] **Step 4: Verify types + lint + build**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: tsc exit 0; lint 0 errors; build succeeds (prints the route manifest). The build catches `"use server"`/RSC issues that tsc misses.

- [ ] **Step 5: Manual verification (local)**

The new table needs the local grant workaround (this branch is off staging).
Apply it once after the reset from Task 1:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "grant all on all tables in schema public to anon, authenticated, service_role;"
```

Then sign in as `admin@moth.test` (magic link via Mailpit :54324; app on :3001) and open `/account`:
- If admin isn't linked to a rostered player, link them:
  `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "update players set user_id=(select id from auth.users where email='admin@moth.test') where id='20000000-0000-0000-0000-000000000101';"` (Doug Morand, Ice Holes — a current-season roster player).
- Confirm the **YOUR NEXT GAME** card shows the team chip, jersey/position, and the next scheduled game.
- Tap **IN** → active (green) + persists; tap **IN** again → clears; tap **OUT** → active (ice).
- Verify rows: `psql ... -c "select * from game_availability;"`.
- Confirm a signed-in user with no linked player sees no card and no error.

- [ ] **Step 6: Commit**

```bash
git add components/CheckInToggle.tsx app/account/page.tsx
git commit -m "feat(availability): Your Next Game card with IN/OUT check-in"
```

---

## Self-Review

**Spec coverage (Increment 1):**
- `game_availability` table + RLS (manage own, public read) → Task 1. ✅
- `setAvailability` action (auth, linked-player resolve, upsert/clear, revalidate) → Task 2. ✅
- Account card: team chip + jersey/position + next game + IN/OUT toggle → Task 3. ✅
- `CheckInToggle` client component (re-tap clears, inline error, router.refresh) → Task 3 Step 1. ✅
- Keeps the existing "View your profile →" link (untouched in Task 3 edits). ✅
- Local grant + build + manual verification → Task 3 Steps 4–5. ✅

**Placeholder scan:** none — full code in every code step; `database.types.ts` is regenerated by command (the canonical approach, per DEVELOPMENT.md).

**Type consistency:** `setAvailability({ gameId, status })` signature matches its call in `CheckInToggle`. `availability` is typed `"in" | "out" | null` in the page and passed as `CheckInToggle`'s `status` prop. Embedded-relation results are cast `as unknown as` the local `RosterRow`/`NextGame` types, matching the app's established pattern.
