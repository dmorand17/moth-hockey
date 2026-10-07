# Game Box Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship #122: a box score on live/final games, availability locked in from the scorekeeper's check-in, and collapsible Box score / Availability / Play-by-play sections.

**Architecture:** A pure `buildBoxScore` in `lib/box-score.ts` turns the lineup (`game_appearances`) and events into per-team stat lines. `lib/lineup-availability.ts` writes the check-in back to `game_availability` after `startGame`/`updateRoster`, enabled by RLS migration `0024`. The game page wraps its sections in a native `<details>` component.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), Tailwind v4, Bun (`bun test`).

**Spec:** `docs/superpowers/specs/2026-10-07-game-box-scores-design.md`

## Global Constraints

- Skater columns: G · A · PTS · PEN · PS · PSG. Goalie columns: GA · PSF · PSV + result. Definitions must match `app/players/[id]/page.tsx` (GA includes made penalty shots against; PSF = penalty events committed by the goalie's own team; PSV = those saved).
- Position: `team_players.position` for the game's season; a `game_subs` row overrides it; otherwise `"forward"`.
- Skaters sorted by PTS desc, then G desc, then name.
- Goalie result only on final games: W if the team scored more, else OTL when `decided_in` is `ot`/`shootout`, else L.
- Availability write-back: rostered players of both teams → `in` if in the lineup, else `out`; upsert on `(game_id, player_id)`; subs get no availability row. Non-blocking: log `[lineup-availability]` and never fail `startGame`/`updateRoster`.
- No backfill of past games.
- Migration number **`0024`**.
- Default open: live/final → Box score and Play-by-play open, Availability collapsed. Scheduled → Availability open.
- Don't combine the `.eyebrow` class with Tailwind `text-*` colors (known CSS bug: `.eyebrow` overrides them).
- Package manager is bun (`bun`, `bunx`). `bun run lint` has exactly 2 pre-existing warnings in `app/admin/schedule/page.tsx`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/box-score.ts` (create) | Pure stat-line builder |
| `lib/box-score.test.ts` (create) | `bun test` for it |
| `supabase/migrations/0024_scorekeeper_availability.sql` (create) | Scorekeeper write policy on `game_availability` |
| `lib/lineup-availability.ts` (create) | Pure `availabilityFromLineup` + server `syncAvailabilityFromLineup` |
| `lib/lineup-availability.test.ts` (create) | `bun test` for the pure part |
| `app/score/[gameId]/actions.ts` (modify) | Call the sync after `startGame` / `updateRoster` |
| `components/CollapsibleSection.tsx` (create) | `<details>` + `SectionHeader` wrapper |
| `components/BoxScore.tsx` (create) | Box score tables |
| `app/games/[id]/page.tsx` (modify) | Load lineup, render box score, reorder + collapse sections |
| `docs/DATABASE.md` (modify) | Document the new policy |

---

### Task 1: `buildBoxScore` (pure, tested)

**Files:**
- Create: `lib/box-score.ts`
- Test: `lib/box-score.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `lib/box-score.ts`):
  - `type Position = "forward" | "defense" | "goalie"`
  - `type LineupPlayer = { playerId: string; name: string; jersey: number | null; teamId: string; position: Position; isSub: boolean }`
  - `type BoxEvent = { type: "goal" | "penalty"; teamId: string; playerId: string | null; assist1Id: string | null; assist2Id: string | null; shotTakerId: string | null; shotResult: "goal" | "saved" | null }`
  - `type SkaterLine = { playerId: string; name: string; jersey: number | null; isSub: boolean; g: number; a: number; pts: number; pen: number; ps: number; psg: number }`
  - `type GoalieLine = { playerId: string; name: string; jersey: number | null; isSub: boolean; ga: number; psf: number; psv: number; result: "W" | "L" | "OTL" | null }`
  - `type TeamBox = { teamId: string; skaters: SkaterLine[]; goalies: GoalieLine[]; totals: { g: number; a: number; pts: number; pen: number; ps: number; psg: number } }`
  - `type FinalInfo = { homeScore: number; awayScore: number; decidedIn: "regulation" | "ot" | "shootout" | null }`
  - `buildBoxScore(input: { lineup: LineupPlayer[]; events: BoxEvent[]; homeTeamId: string; awayTeamId: string; final: FinalInfo | null }): { home: TeamBox; away: TeamBox }`

- [ ] **Step 1: Write the failing tests**

Create `lib/box-score.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildBoxScore, type BoxEvent, type LineupPlayer } from "@/lib/box-score";

const H = "home";
const A = "away";

const lineup: LineupPlayer[] = [
  { playerId: "h1", name: "Alex Boyd", jersey: 7, teamId: H, position: "forward", isSub: false },
  { playerId: "h2", name: "Sam Lund", jersey: 9, teamId: H, position: "forward", isSub: false },
  { playerId: "h3", name: "Kai Hale", jersey: null, teamId: H, position: "defense", isSub: true },
  { playerId: "hg", name: "Drew Rask", jersey: 30, teamId: H, position: "goalie", isSub: false },
  { playerId: "a1", name: "Quinn Cross", jersey: 11, teamId: A, position: "forward", isSub: false },
  { playerId: "ag", name: "Avery Kane", jersey: 31, teamId: A, position: "goalie", isSub: false },
];

const goal = (teamId: string, playerId: string, a1: string | null = null, a2: string | null = null): BoxEvent => ({
  type: "goal", teamId, playerId, assist1Id: a1, assist2Id: a2, shotTakerId: null, shotResult: null,
});
const penalty = (committingTeam: string, offender: string, shooter: string | null, result: "goal" | "saved" | null): BoxEvent => ({
  type: "penalty", teamId: committingTeam, playerId: offender, assist1Id: null, assist2Id: null, shotTakerId: shooter, shotResult: result,
});

const events: BoxEvent[] = [
  goal(H, "h1", "h2", "h3"),
  goal(H, "h2", "h1"),
  goal(A, "a1"),
  // Away commits; home's h1 takes the shot and scores.
  penalty(A, "a1", "h1", "goal"),
  // Home commits; away's a1 takes the shot and it's saved.
  penalty(H, "h3", "a1", "saved"),
];

describe("buildBoxScore", () => {
  const box = buildBoxScore({
    lineup, events, homeTeamId: H, awayTeamId: A,
    final: { homeScore: 3, awayScore: 1, decidedIn: "regulation" },
  });

  test("skater lines count goals, assists, penalties and penalty shots", () => {
    const h1 = box.home.skaters.find((s) => s.playerId === "h1")!;
    expect(h1).toEqual({ playerId: "h1", name: "Alex Boyd", jersey: 7, isSub: false, g: 1, a: 1, pts: 2, pen: 0, ps: 1, psg: 1 });
    const h3 = box.home.skaters.find((s) => s.playerId === "h3")!;
    expect(h3).toMatchObject({ isSub: true, g: 0, a: 1, pts: 1, pen: 1, ps: 0, psg: 0 });
  });

  test("skaters sort by points, then goals, then name; goalies are separate", () => {
    expect(box.home.skaters.map((s) => s.playerId)).toEqual(["h1", "h2", "h3"]);
    expect(box.home.goalies.map((g) => g.playerId)).toEqual(["hg"]);
  });

  test("goalie GA includes made penalty shots; PSF/PSV count shots against", () => {
    expect(box.home.goalies[0]).toMatchObject({ ga: 1, psf: 1, psv: 1, result: "W" });
    // Away goalie: 2 goals + 1 made penalty shot against; 1 shot faced, 0 saved.
    expect(box.away.goalies[0]).toMatchObject({ ga: 3, psf: 1, psv: 0, result: "L" });
  });

  test("totals add up the skater lines", () => {
    expect(box.home.totals).toEqual({ g: 2, a: 3, pts: 5, pen: 1, ps: 1, psg: 1 });
  });

  test("players who recorded nothing still appear", () => {
    expect(box.away.skaters).toHaveLength(1);
    expect(box.away.skaters[0]).toMatchObject({ playerId: "a1", g: 1, pts: 1, pen: 1, ps: 1, psg: 0 });
  });
});

describe("goalie result", () => {
  const base = { lineup, events: [] as BoxEvent[], homeTeamId: H, awayTeamId: A };
  test("OTL for the loser of an OT or shootout game", () => {
    const box = buildBoxScore({ ...base, final: { homeScore: 2, awayScore: 3, decidedIn: "ot" } });
    expect(box.home.goalies[0].result).toBe("OTL");
    expect(box.away.goalies[0].result).toBe("W");
  });
  test("no result while the game is live", () => {
    const box = buildBoxScore({ ...base, final: null });
    expect(box.home.goalies[0].result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/box-score.test.ts`
Expected: FAIL — cannot find module `@/lib/box-score`.

- [ ] **Step 3: Implement `lib/box-score.ts`**

```ts
// Box score stat lines from a game's lineup (game_appearances, i.e. the
// scorekeeper's check-in) and its events. Pure — the game page loads rows and
// calls this. Definitions match the player game log in app/players/[id].

export type Position = "forward" | "defense" | "goalie";

export type LineupPlayer = {
  playerId: string;
  name: string;
  jersey: number | null;
  teamId: string;
  position: Position;
  isSub: boolean;
};

export type BoxEvent = {
  type: "goal" | "penalty";
  // For a goal, the scoring team; for a penalty, the committing team.
  teamId: string;
  playerId: string | null;
  assist1Id: string | null;
  assist2Id: string | null;
  shotTakerId: string | null;
  shotResult: "goal" | "saved" | null;
};

export type SkaterLine = {
  playerId: string;
  name: string;
  jersey: number | null;
  isSub: boolean;
  g: number;
  a: number;
  pts: number;
  pen: number;
  ps: number;
  psg: number;
};

export type GoalieLine = {
  playerId: string;
  name: string;
  jersey: number | null;
  isSub: boolean;
  ga: number;
  psf: number;
  psv: number;
  result: "W" | "L" | "OTL" | null;
};

export type TeamBox = {
  teamId: string;
  skaters: SkaterLine[];
  goalies: GoalieLine[];
  totals: { g: number; a: number; pts: number; pen: number; ps: number; psg: number };
};

export type FinalInfo = {
  homeScore: number;
  awayScore: number;
  decidedIn: "regulation" | "ot" | "shootout" | null;
};

function skaterLine(p: LineupPlayer, events: BoxEvent[]): SkaterLine {
  let g = 0, a = 0, pen = 0, ps = 0, psg = 0;
  for (const e of events) {
    if (e.type === "goal") {
      if (e.playerId === p.playerId) g++;
      if (e.assist1Id === p.playerId || e.assist2Id === p.playerId) a++;
    } else {
      if (e.playerId === p.playerId) pen++;
      if (e.shotTakerId === p.playerId) {
        ps++;
        if (e.shotResult === "goal") psg++;
      }
    }
  }
  return { playerId: p.playerId, name: p.name, jersey: p.jersey, isSub: p.isSub, g, a, pts: g + a, pen, ps, psg };
}

function goalieLine(p: LineupPlayer, events: BoxEvent[], result: GoalieLine["result"]): GoalieLine {
  let ga = 0, psf = 0, psv = 0;
  for (const e of events) {
    if (e.type === "goal" && e.teamId !== p.teamId) ga++;
    // A penalty committed by the goalie's own team puts a shooter on them.
    if (e.type === "penalty" && e.teamId === p.teamId) {
      psf++;
      if (e.shotResult === "saved") psv++;
      else if (e.shotResult === "goal") ga++;
    }
  }
  return { playerId: p.playerId, name: p.name, jersey: p.jersey, isSub: p.isSub, ga, psf, psv, result };
}

function teamResult(teamId: string, homeTeamId: string, final: FinalInfo | null): GoalieLine["result"] {
  if (!final) return null;
  const isHome = teamId === homeTeamId;
  const mine = isHome ? final.homeScore : final.awayScore;
  const theirs = isHome ? final.awayScore : final.homeScore;
  if (mine > theirs) return "W";
  return final.decidedIn === "ot" || final.decidedIn === "shootout" ? "OTL" : "L";
}

function teamBox(teamId: string, input: Parameters<typeof buildBoxScore>[0]): TeamBox {
  const players = input.lineup.filter((p) => p.teamId === teamId);
  const result = teamResult(teamId, input.homeTeamId, input.final);
  const skaters = players
    .filter((p) => p.position !== "goalie")
    .map((p) => skaterLine(p, input.events))
    .sort((x, y) => y.pts - x.pts || y.g - x.g || x.name.localeCompare(y.name));
  const goalies = players
    .filter((p) => p.position === "goalie")
    .map((p) => goalieLine(p, input.events, result));
  const totals = skaters.reduce(
    (t, s) => ({ g: t.g + s.g, a: t.a + s.a, pts: t.pts + s.pts, pen: t.pen + s.pen, ps: t.ps + s.ps, psg: t.psg + s.psg }),
    { g: 0, a: 0, pts: 0, pen: 0, ps: 0, psg: 0 },
  );
  return { teamId, skaters, goalies, totals };
}

export function buildBoxScore(input: {
  lineup: LineupPlayer[];
  events: BoxEvent[];
  homeTeamId: string;
  awayTeamId: string;
  final: FinalInfo | null;
}): { home: TeamBox; away: TeamBox } {
  return { home: teamBox(input.homeTeamId, input), away: teamBox(input.awayTeamId, input) };
}
```

Note: a goalie's own goals/penalties don't appear on a skater line (goalies have no skater line). That matches the rest of the app, which tracks goalies by GA/PSF/PSV only.

- [ ] **Step 4: Run to verify the tests pass**

Run: `bun test lib/box-score.test.ts`
Expected: PASS (7 tests). Then `bun test lib` — all pass.

- [ ] **Step 5: Typecheck and commit**

```bash
bunx tsc --noEmit
git add lib/box-score.ts lib/box-score.test.ts
git commit -m "feat(box-score): stat lines from lineup and events"
```

---
### Task 2: Lock availability in from the check-in

**Files:**
- Create: `supabase/migrations/0024_scorekeeper_availability.sql`
- Create: `lib/lineup-availability.ts`
- Test: `lib/lineup-availability.test.ts`
- Modify: `app/score/[gameId]/actions.ts` (`startGame` success path; `updateRoster` success path; imports)
- Modify: `docs/DATABASE.md` (RLS summary)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (exported from `lib/lineup-availability.ts`):
  - `availabilityFromLineup(rosterPlayerIds: string[], lineupPlayerIds: Set<string>): { playerId: string; status: "in" | "out" }[]`
  - `syncAvailabilityFromLineup(db: SupabaseClient<Database>, gameId: string): Promise<{ ok: true; written: number } | { ok: false; error: string }>` — never throws

The module must not import `server-only` or `@/lib/supabase/server` (value imports), so `bun test` can load it. Use type-only imports for the client type.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0024_scorekeeper_availability.sql`:

```sql
-- Let scorekeepers write game_availability while a game is scheduled or live
-- (#122). startGame / updateRoster now write the check-in back to
-- availability: rostered players in the lineup become 'in', the rest 'out'.
-- Before this, only players (own row), captains and admins could write it.
-- Same scope as the scorekeeper lineup policy from 0021; admins already have
-- full access via "admin manages all availability".

create policy "scorekeepers sync availability on scheduled or live games" on game_availability for all
  using (
    public.is_scorekeeper_or_admin() and exists (
      select 1 from games g
      where g.id = game_availability.game_id and g.status in ('scheduled', 'live')
    )
  )
  with check (
    public.is_scorekeeper_or_admin() and exists (
      select 1 from games g
      where g.id = game_availability.game_id and g.status in ('scheduled', 'live')
    )
  );
```

- [ ] **Step 2: Apply it and verify the boundaries as the scorekeeper**

```bash
bunx supabase migration up --local
P(){ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At "$@"; }
SK=$(P -c "select id from auth.users where email='scorekeeper@moth.test'")
SCHED=$(P -c "select id from games where status='scheduled' and home_team_id is not null limit 1")
FINAL=$(P -c "select id from games where status='final' limit 1")
PL=$(P -c "select id from players limit 1")
for G in $SCHED $FINAL; do
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres 2>&1 <<SQL | grep -oE 'INSERT 0 1|ERROR:.*' | head -1
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','$SK','role','authenticated')::text, true);
insert into game_availability (game_id, player_id, status) values ('$G', '$PL', 'in')
  on conflict (game_id, player_id) do update set status = excluded.status;
rollback;
SQL
done
```

Expected: `INSERT 0 1` for the scheduled game, then `ERROR:  new row violates row-level security policy for table "game_availability"` for the final game.

- [ ] **Step 3: Write the failing test**

Create `lib/lineup-availability.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { availabilityFromLineup } from "@/lib/lineup-availability";

describe("availabilityFromLineup", () => {
  test("rostered players in the lineup are in; the rest are out", () => {
    expect(availabilityFromLineup(["a", "b", "c"], new Set(["a", "c"]))).toEqual([
      { playerId: "a", status: "in" },
      { playerId: "b", status: "out" },
      { playerId: "c", status: "in" },
    ]);
  });

  test("subs in the lineup who aren't rostered get no row", () => {
    expect(availabilityFromLineup(["a"], new Set(["a", "sub"]))).toEqual([{ playerId: "a", status: "in" }]);
  });

  test("empty lineup marks everyone out", () => {
    expect(availabilityFromLineup(["a", "b"], new Set())).toEqual([
      { playerId: "a", status: "out" },
      { playerId: "b", status: "out" },
    ]);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `bun test lib/lineup-availability.test.ts`
Expected: FAIL — cannot find module `@/lib/lineup-availability`.

- [ ] **Step 5: Implement `lib/lineup-availability.ts`**

```ts
// Writes the scorekeeper's check-in back to game_availability (#122): once a
// game starts, every rostered player is 'in' if they were checked in and
// 'out' if not. The check-in is what actually happened, so it overrides
// earlier self-reports in both directions. Subs aren't rostered and get no row.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export function availabilityFromLineup(
  rosterPlayerIds: string[],
  lineupPlayerIds: Set<string>,
): { playerId: string; status: "in" | "out" }[] {
  return rosterPlayerIds.map((playerId) => ({
    playerId,
    status: lineupPlayerIds.has(playerId) ? "in" : "out",
  }));
}

// Never throws: callers (startGame, updateRoster) must not fail puck drop or a
// lineup edit because of this.
export async function syncAvailabilityFromLineup(
  db: SupabaseClient<Database>,
  gameId: string,
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  try {
    const { data: game, error: gameErr } = await db
      .from("games")
      .select("season_id, home_team_id, away_team_id")
      .eq("id", gameId)
      .single();
    if (gameErr || !game) return { ok: false, error: gameErr?.message ?? "game not found" };
    const teamIds = [game.home_team_id, game.away_team_id].filter((t): t is string => t != null);

    const [{ data: roster, error: rosterErr }, { data: lineup, error: lineupErr }] = await Promise.all([
      db.from("team_players").select("player_id").eq("season_id", game.season_id).in("team_id", teamIds),
      db.from("game_appearances").select("player_id").eq("game_id", gameId),
    ]);
    if (rosterErr) return { ok: false, error: `team_players: ${rosterErr.message}` };
    if (lineupErr) return { ok: false, error: `game_appearances: ${lineupErr.message}` };

    const rows = availabilityFromLineup(
      (roster ?? []).map((r) => r.player_id),
      new Set((lineup ?? []).map((a) => a.player_id)),
    );
    if (rows.length === 0) return { ok: true, written: 0 };

    const now = new Date().toISOString();
    const { error } = await db.from("game_availability").upsert(
      rows.map((r) => ({ game_id: gameId, player_id: r.playerId, status: r.status, updated_at: now })),
      { onConflict: "game_id,player_id" },
    );
    if (error) return { ok: false, error: `game_availability: ${error.message}` };
    return { ok: true, written: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `bun test lib/lineup-availability.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Wire it into the scorekeeper actions**

In `app/score/[gameId]/actions.ts`, add imports:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { syncAvailabilityFromLineup } from "@/lib/lineup-availability";
```

Add this helper near the top of the file (after the imports):

```ts
// Lock availability in from the lineup. Logged, never fatal: a failure here
// must not undo a started game or a saved lineup edit.
async function lockAvailability(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  gameId: string,
) {
  const res = await syncAvailabilityFromLineup(supabase as unknown as SupabaseClient<Database>, gameId);
  if (!res.ok) console.error("[lineup-availability]", gameId, res.error);
}
```

In `startGame`, after the block that flips the game to `live` succeeds (after the `if (updateErr || !started?.length) { … }` block) and before its `revalidatePath` calls, add:

```ts
  await lockAvailability(supabase, input.gameId);
```

In `updateRoster`, after the `if (toAdd.length > 0) { … }` block and before its `revalidatePath` calls, add the same line:

```ts
  await lockAvailability(supabase, input.gameId);
```

Also add `revalidatePath(\`/games/${input.gameId}\`);` next to the existing `revalidatePath` calls in both functions if it isn't already there, so the game page's availability refreshes.

- [ ] **Step 8: Document the policy**

In `docs/DATABASE.md`'s RLS summary table, after the `game_subs` row, add:

```markdown
| `game_availability` (since `0024`) | public | player (own row), captain (own team), admin; **scorekeeper** while the game is scheduled or live — `startGame`/`updateRoster` write the check-in back as in/out |
```

- [ ] **Step 9: Verify end to end as the scorekeeper**

With the dev server running (`bun dev`), pick a scheduled game and set up conflicting self-reports:

```bash
P(){ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At "$@"; }
G=$(P -c "select id from games where status='scheduled' and home_team_id is not null order by scheduled_at limit 1")
S=$(P -c "select season_id from games where id='$G'")
H=$(P -c "select home_team_id from games where id='$G'")
YES=$(P -c "select player_id from team_players where team_id='$H' and season_id='$S' and position='forward' order by player_id limit 1")
NO=$(P -c "select player_id from team_players where team_id='$H' and season_id='$S' and position='forward' order by player_id offset 1 limit 1")
P -c "delete from game_availability where game_id='$G'; insert into game_availability (game_id, player_id, status) values ('$G','$YES','out'),('$G','$NO','in');"
echo "G=$G YES=$YES NO=$NO"
```

Sign in as `scorekeeper@moth.test` (magic link via Mailpit at `http://127.0.0.1:54324`; click SIGN IN on `/auth/confirm`). Open `/score/$G`. The player `$YES` is pre-unchecked because they marked themselves out: **check them**. The player `$NO` is checked: **uncheck them**. Click Start Game. Then:

```bash
P -c "select player_id, status from game_availability where game_id='$G' and player_id in ('$YES','$NO')"
P -c "select count(*) from team_players tp join games g on g.id='$G' and tp.season_id=g.season_id and tp.team_id in (g.home_team_id,g.away_team_id)"
P -c "select count(*) from game_availability where game_id='$G'"
```

Expected: `$YES` → `in`, `$NO` → `out`; the two counts are equal (every rostered player has a row). No `[lineup-availability]` errors in the dev-server log.

Restore the game: `update games set status='scheduled', period=1, clock_seconds=1020 where id='$G'`, and delete its `game_appearances` and `game_availability` rows.

- [ ] **Step 10: Typecheck, lint, commit**

```bash
bun test lib && bunx tsc --noEmit && bun run lint
git add supabase/migrations/0024_scorekeeper_availability.sql lib/lineup-availability.ts lib/lineup-availability.test.ts "app/score/[gameId]/actions.ts" docs/DATABASE.md
git commit -m "feat(availability): lock in availability from the check-in

Refs #122"
```

---
### Task 3: Collapsible sections + box score on the game page

**Files:**
- Create: `components/CollapsibleSection.tsx`
- Create: `components/BoxScore.tsx`
- Modify: `app/games/[id]/page.tsx` (imports; load the lineup for live/final games; render the box score; convert Availability and Play-by-play to collapsible sections)

**Interfaces:**
- Consumes (Task 1): `buildBoxScore`, `type TeamBox`, `type LineupPlayer`, `type BoxEvent`, `type Position` from `@/lib/box-score`. Existing: `SectionHeader` (`components/SectionHeader.tsx`, props `eyebrow`, `title`, `subtitle`, …), `TeamBadge` (`components/TeamBadge.tsx`), the page's `events: EventRow[]` (fields `type`, `team_id`, `penalty_shot_result`, `scorer`, `assist1`, `assist2`, `shooter`, each player ref `{ id, first_name, last_name } | null`), `isLive`, `isFinal`, `isScheduled`, `homeTeam`, `awayTeam`, `homeView`, `awayView`, `game`.
- Produces:
  - `CollapsibleSection({ eyebrow, title, subtitle, defaultOpen, className, children }: { eyebrow?: string; title: string; subtitle?: string; defaultOpen: boolean; className?: string; children: ReactNode })`
  - `BoxScore({ box, home, away }: { box: { home: TeamBox; away: TeamBox }; home: TeamRef; away: TeamRef })` where `TeamRef = { id: string; name: string; slug: string; color: string }`

- [ ] **Step 1: Create `components/CollapsibleSection.tsx`**

```tsx
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";

// A page section the viewer can collapse. Native <details>, so it works without
// JavaScript and is announced correctly by screen readers. Open/closed state
// isn't remembered between visits.
export function CollapsibleSection({
  eyebrow,
  title,
  subtitle,
  defaultOpen,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={`group ${className ?? ""}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        </div>
        <span
          aria-hidden
          className="mt-1 sm:mt-2 text-[18px] text-ink-dim transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      {children}
    </details>
  );
}
```

- [ ] **Step 2: Create `components/BoxScore.tsx`**

```tsx
import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamBox } from "@/lib/box-score";

type TeamRef = { id: string; name: string; slug: string; color: string };

const num = "text-right tnum";

function TeamTable({ team, box }: { team: TeamRef; box: TeamBox }) {
  return (
    <div
      className="panel p-3 sm:p-4 space-y-3"
      style={{ borderLeftColor: team.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
    >
      <TeamBadge name={team.name} slug={team.slug} color={team.color} size="sm" />

      <div className="overflow-x-auto">
        <table className="board-table stats-table w-full text-[14px]">
          <thead>
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">Skater</th>
              <th className={num}>G</th>
              <th className={num}>A</th>
              <th className={num}>PTS</th>
              <th className={num}>PEN</th>
              <th className={num}>PS</th>
              <th className={num}>PSG</th>
            </tr>
          </thead>
          <tbody>
            {box.skaters.map((s) => (
              <tr key={s.playerId}>
                <td className="tnum text-ink-dim">{s.jersey ?? "—"}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/players/${s.playerId}`} className="hover:text-ink transition-colors">
                    {s.name}
                  </Link>
                  {s.isSub && <span className="chip ml-2 text-[10px]">SUB</span>}
                </td>
                <td className={num}>{s.g}</td>
                <td className={num}>{s.a}</td>
                <td className={`${num} text-ink`}>{s.pts}</td>
                <td className={num}>{s.pen}</td>
                <td className={num}>{s.ps}</td>
                <td className={num}>{s.psg}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td />
              <td>Totals</td>
              <td className={num}>{box.totals.g}</td>
              <td className={num}>{box.totals.a}</td>
              <td className={num}>{box.totals.pts}</td>
              <td className={num}>{box.totals.pen}</td>
              <td className={num}>{box.totals.ps}</td>
              <td className={num}>{box.totals.psg}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {box.goalies.length > 0 && (
        <div className="overflow-x-auto">
          <table className="board-table w-full text-[14px]">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Goalie</th>
                <th className={num}>GA</th>
                <th className={num}>PSF</th>
                <th className={num}>PSV</th>
                <th className={num}>Result</th>
              </tr>
            </thead>
            <tbody>
              {box.goalies.map((g) => (
                <tr key={g.playerId}>
                  <td className="tnum text-ink-dim">{g.jersey ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    <Link href={`/players/${g.playerId}`} className="hover:text-ink transition-colors">
                      {g.name}
                    </Link>
                    {g.isSub && <span className="chip ml-2 text-[10px]">SUB</span>}
                  </td>
                  <td className={num}>{g.ga}</td>
                  <td className={num}>{g.psf}</td>
                  <td className={num}>{g.psv}</td>
                  <td className={num}>{g.result ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Per-team stat lines for a live or final game. Away first, matching the
// scoreboard's left-to-right order.
export function BoxScore({ box, home, away }: { box: { home: TeamBox; away: TeamBox }; home: TeamRef; away: TeamRef }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamTable team={away} box={box.away} />
        <TeamTable team={home} box={box.home} />
      </div>
      <p className="text-[12px] text-ink-faint">
        PEN = penalties committed · PS = penalty shots taken · PSG = penalty-shot goals · GA includes penalty-shot goals ·
        PSF / PSV = penalty shots faced / saved
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Load the lineup and build the box score on the page**

In `app/games/[id]/page.tsx`, add imports:

```ts
import { BoxScore } from "@/components/BoxScore";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { buildBoxScore, type LineupPlayer, type Position, type TeamBox } from "@/lib/box-score";
```

Immediately before the component's main `return (`, add:

```ts
  // Box score: who played (the scorekeeper's check-in, i.e. game_appearances)
  // and their stat lines. Positions come from the season roster, overridden by
  // a lined-up sub's chosen position; anyone else defaults to forward.
  let box: { home: TeamBox; away: TeamBox } | null = null;
  let hasLineup = false;
  if ((isLive || isFinal) && homeTeam && awayTeam) {
    const [{ data: appRows }, { data: rosterRows }, { data: subRows }] = await Promise.all([
      supabase
        .from("game_appearances")
        .select("player_id, team_id, is_sub, player:player_id(first_name, last_name)")
        .eq("game_id", id),
      supabase
        .from("team_players")
        .select("player_id, position, jersey_number")
        .eq("season_id", game.season_id),
      supabase.from("game_subs").select("player_id, position").eq("game_id", id),
    ]);
    const rosterBy = new Map(
      (rosterRows ?? []).map((r) => [r.player_id, { position: r.position as Position, jersey: r.jersey_number }]),
    );
    const subPosition = new Map((subRows ?? []).map((s) => [s.player_id, s.position as Position]));
    const apps = (appRows ?? []) as unknown as {
      player_id: string;
      team_id: string;
      is_sub: boolean;
      player: { first_name: string; last_name: string } | null;
    }[];
    hasLineup = apps.length > 0;
    const lineup: LineupPlayer[] = apps.map((a) => ({
      playerId: a.player_id,
      name: a.player ? `${a.player.first_name} ${a.player.last_name}` : "Unknown",
      jersey: rosterBy.get(a.player_id)?.jersey ?? null,
      teamId: a.team_id,
      position: subPosition.get(a.player_id) ?? rosterBy.get(a.player_id)?.position ?? "forward",
      isSub: a.is_sub,
    }));
    box = buildBoxScore({
      lineup,
      events: events.map((e) => ({
        type: e.type,
        teamId: e.team_id,
        playerId: e.scorer?.id ?? null,
        assist1Id: e.assist1?.id ?? null,
        assist2Id: e.assist2?.id ?? null,
        shotTakerId: e.shooter?.id ?? null,
        shotResult: e.penalty_shot_result,
      })),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      final: isFinal
        ? {
            homeScore: game.home_score,
            awayScore: game.away_score,
            decidedIn: game.decided_in as "regulation" | "ot" | "shootout" | null,
          }
        : null,
    });
  }
```

Check `EventRow` in the page: if `assist1`/`assist2`/`shooter` don't include `id`, add `id` to their select strings in the existing events query (`assist1:assist1_player_id(id, first_name, last_name)` etc.) — the current query already selects `id` for all four refs.

- [ ] **Step 4: Render the box score and make sections collapsible**

1. Immediately after the write-up block (the `{/* WRITE-UP … */}` section(s) right after the scoreboard) and **before** `{/* AVAILABILITY … */}`, add:

```tsx
      {/* BOX SCORE (live and final games) */}
      {(isLive || isFinal) && box && (
        <CollapsibleSection eyebrow="Box score" title="Player stats" defaultOpen className="rise delay-1 space-y-4">
          {hasLineup ? (
            <BoxScore box={box} home={homeView} away={awayView} />
          ) : (
            <p className="text-[14px] text-ink-dim">No lineup recorded for this game.</p>
          )}
        </CollapsibleSection>
      )}
```

2. In the Availability block, replace the opening `<section className="rise delay-1 space-y-4">` and its `<SectionHeader eyebrow="Roster" title="Availability" subtitle={…} />` line with:

```tsx
        <CollapsibleSection
          eyebrow="Roster"
          title="Availability"
          subtitle={isScheduled ? "Who's in for this game" : "Who was in for this game"}
          defaultOpen={isScheduled}
          className="rise delay-1 space-y-4"
        >
```

and that block's closing `</section>` with `</CollapsibleSection>`. Leave the contents unchanged.

3. In the play-by-play block (`{/* EVENTS LOG */}`), replace `<section className="rise delay-1">` + `<SectionHeader eyebrow="Play-by-play" title="Scoring & Penalties" />` with:

```tsx
      <CollapsibleSection eyebrow="Play-by-play" title="Scoring & Penalties" defaultOpen className="rise delay-1">
```

and its closing `</section>` with `</CollapsibleSection>`.

4. Leave the Matchup section (scheduled games) where it is. The resulting order is: live/final → Box score, Availability, Play-by-play; scheduled → Availability, Matchup, Play-by-play.

5. Remove the `SectionHeader` import only if it's no longer used anywhere in the file (it still is for Matchup).

- [ ] **Step 5: Verify in the browser**

Check at 1280×900 and 390×844 (playwright-cli, named session), saving screenshots to `/tmp/box-score/`:
- A **final** game: Box score open with both teams' tables, totals and goalie results; Availability collapsed (click it: it expands); Play-by-play open. Pick a final game with a sub appearance (`select game_id from game_appearances where is_sub limit 1`) and confirm the SUB chip.
- Every number in one team's box score matches a hand count from `game_events` for that game (goals, assists, penalties, penalty shots; goalie GA = opposing goals + opposing made penalty shots).
- A **scheduled** game: no box score; Availability open; Play-by-play open.
- A final game with its `game_appearances` temporarily deleted shows "No lineup recorded for this game." (Re-insert or reseed afterwards: `scripts/local/seed-sample.sh 5`.)
- The page has no horizontal page scroll at 390px (tables scroll inside their panel).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
bun test lib && bunx tsc --noEmit && bun run lint
git add components/CollapsibleSection.tsx components/BoxScore.tsx "app/games/[id]/page.tsx"
git commit -m "feat(games): box score and collapsible sections

Refs #122"
```

---

### Task 4: Docs and full verification

**Files:**
- Modify: `docs/DEVELOPMENT.md` (a short "Box scores" note)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: docs; a verified branch.

- [ ] **Step 1: Document the behavior**

Append to `docs/DEVELOPMENT.md`:

```markdown
## Box scores and locked availability (#122)

- Live and final games show a **box score** built from the scorekeeper's check-in (`game_appearances`) and the game's events (`lib/box-score.ts`, tested). Skaters: G · A · PTS · PEN · PS · PSG; goalies: GA · PSF · PSV · result.
- **Starting a game locks in availability:** every rostered player becomes `in` if checked in and `out` if not, overriding earlier self-reports (`lib/lineup-availability.ts`, called from `startGame` and `updateRoster`). Subs get no availability row. Failures are logged as `[lineup-availability]` and never block a start or a lineup edit. Games played before this shipped were not backfilled.
- The game page's Box score, Availability and Play-by-play sections collapse (`components/CollapsibleSection.tsx`, native `<details>`).
```

- [ ] **Step 2: Run every check**

```bash
bun run test && bunx tsc --noEmit && bun run lint && bun run build
```

Expected: all tests pass (more than 49), no type errors, only the 2 pre-existing lint warnings, build succeeds.

- [ ] **Step 3: End-to-end on the local stack**

1. As `scorekeeper@moth.test`, start a scheduled game with one self-reported-`out` player checked and one self-reported-`in` player unchecked; confirm availability flips both ways and covers every rostered player (Task 2 Step 9 queries).
2. Record a goal with an assist, then a penalty with a **made** penalty shot, then finalize.
3. Open `/games/<id>`: the box score's lines match the events by hand count, including the shooter's PS/PSG and the opposing goalie's GA; the goalie results read W / L (or OTL); Availability (collapsed) shows the locked-in in/out.
4. Restore local data with `scripts/local/seed-sample.sh 5`.

- [ ] **Step 4: Commit**

```bash
git add docs/DEVELOPMENT.md
git commit -m "docs: box scores and locked availability"
```

- [ ] **Step 5: Deploy note (for the PR description)**

- Apply migration `0024` with `supabase db push` to staging, then prod at release, and verify with
  `select policyname from pg_policies where tablename = 'game_availability';` (expect `scorekeepers sync availability on scheduled or live games`).
