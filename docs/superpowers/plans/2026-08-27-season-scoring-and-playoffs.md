# Season Scoring Config + On-Demand Playoffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-season point system (2-1-0 / 3-2-1) and configurable tie-breakers driving standings + seeding, plus a single Generate Playoffs button replacing pre-created stubs.

**Architecture:** Two new `seasons` columns feed `getStandings` (points tally + sort). A per-season config UI edits them. Playoffs are generated on demand from the configured standings.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase/Postgres + RLS, bun.

## Global Constraints

- Package manager **bun**; run binaries with **bunx**. **No test runner** — verify each task with `bunx tsc --noEmit` (0 errors) and `bun run lint` (no NEW warnings beyond the two pre-existing in `app/admin/schedule/page.tsx`).
- Server actions are `"use server"`, admin-gated with `await requireRole(["admin"])`.
- Migrations sequential in `supabase/migrations/`; next is `0014_`. Apply with `bunx supabase db reset`; regenerate types with `bunx supabase gen types typescript --local > lib/supabase/database.types.ts 2>/dev/null` (redirect stderr — CLI warnings otherwise corrupt the file).
- Branch: `feat/season-scoring` (already checked out), stacked on `feat/season-reset` (PR #80).
- Spec: `docs/superpowers/specs/2026-08-27-season-scoring-and-playoffs-design.md`.
- Tie-break keys: `wins`, `diff`, `gf`, `ga`, `h2h`. Point systems: `2-1-0`, `3-2-1`.

---

### Task 1: Migration + regenerated types

**Files:**
- Create: `supabase/migrations/0014_season_scoring.sql`
- Modify (generated): `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `seasons.point_system text` (default `'3-2-1'`, CHECK in `2-1-0`/`3-2-1`) and `seasons.tiebreakers text[]` (default `'{wins,diff,gf}'`), both NOT NULL.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0014_season_scoring.sql`:

```sql
-- Per-season scoring config: point system + ordered tie-breakers (after points).
alter table seasons
  add column point_system text not null default '3-2-1'
    check (point_system in ('2-1-0', '3-2-1')),
  add column tiebreakers text[] not null default '{wins,diff,gf}';

-- Existing rows already pick up the defaults above (3-2-1). No backfill needed.
```

- [ ] **Step 2: Apply + regenerate types**

```bash
bunx supabase db reset
bunx supabase gen types typescript --local > lib/supabase/database.types.ts 2>/dev/null
```
Confirm `point_system` and `tiebreakers` appear in the `seasons` Row type.

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_season_scoring.sql lib/supabase/database.types.ts
git commit -m "feat(seasons): add point_system + tiebreakers columns"
```

---

### Task 2: `getStandings` — point systems + configurable tie-breakers

**Files:**
- Modify: `lib/queries.ts` (`getStandings`, ~lines 75–139)

**Interfaces:**
- Consumes: `seasons.point_system`, `seasons.tiebreakers` (Task 1).
- Produces: `getStandings(seasonId)` unchanged signature; ordering now reflects the season's config. Exports helper `computeGamePoints(system, won, otOrSo)` for reuse in Task 4.

- [ ] **Step 1: Add the points helper + tie-break machinery**

At the top of `lib/queries.ts` (after imports), add:

```ts
export type PointSystem = "2-1-0" | "3-2-1";
export type TieKey = "wins" | "diff" | "gf" | "ga" | "h2h";
const VALID_TIE_KEYS: TieKey[] = ["wins", "diff", "gf", "ga", "h2h"];

/** Points a team earns for one decided game under the season's point system. */
export function computeGamePoints(
  system: PointSystem,
  won: boolean,
  otOrSo: boolean,
): number {
  if (won) return system === "3-2-1" ? (otOrSo ? 2 : 3) : 2;
  return otOrSo ? 1 : 0;
}
```

- [ ] **Step 2: Rewrite `getStandings` to honor the config**

Replace the whole `getStandings` function body with:

```ts
export async function getStandings(seasonId: string): Promise<StandingsRow[]> {
  const supabase = await createSupabaseServerClient();
  const [
    { data: season },
    { data: teams, error: tErr },
    { data: games, error: gErr },
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select("point_system, tiebreakers")
      .eq("id", seasonId)
      .maybeSingle(),
    supabase.from("teams").select("id, name, slug, color").eq("season_id", seasonId),
    supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score, status, decided_in")
      .eq("season_id", seasonId)
      .eq("status", "final")
      .eq("kind", "regular"),
  ]);
  if (tErr) throw tErr;
  if (gErr) throw gErr;

  const system: PointSystem = season?.point_system === "2-1-0" ? "2-1-0" : "3-2-1";
  const tieKeys: TieKey[] = (season?.tiebreakers ?? ["wins", "diff", "gf"]).filter(
    (k): k is TieKey => VALID_TIE_KEYS.includes(k as TieKey),
  );

  const rows: Record<string, StandingsRow> = {};
  for (const t of teams ?? []) {
    rows[t.id] = {
      team_id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0,
    };
  }

  for (const g of games ?? []) {
    if (!g.home_team_id || !g.away_team_id) continue;
    const home = rows[g.home_team_id];
    const away = rows[g.away_team_id];
    if (!home || !away) continue;
    home.gp++; away.gp++;
    home.gf += g.home_score; home.ga += g.away_score;
    away.gf += g.away_score; away.ga += g.home_score;

    const homeWon = g.home_score > g.away_score;
    const otOrSo = g.decided_in === "ot" || g.decided_in === "shootout";
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    winner.w++;
    winner.pts += computeGamePoints(system, true, otOrSo);
    loser.pts += computeGamePoints(system, false, otOrSo);
    if (otOrSo) loser.otl++;
    else loser.l++;
  }

  const result = Object.values(rows).map((r) => ({ ...r, diff: r.gf - r.ga }));

  const num = (key: Exclude<TieKey, "h2h">, a: StandingsRow, b: StandingsRow): number => {
    switch (key) {
      case "wins": return b.w - a.w;
      case "diff": return b.diff - a.diff;
      case "gf": return b.gf - a.gf;
      case "ga": return a.ga - b.ga;
    }
  };
  const chain =
    (keys: Exclude<TieKey, "h2h">[]) =>
    (a: StandingsRow, b: StandingsRow): number => {
      for (const k of keys) {
        const c = num(k, a, b);
        if (c) return c;
      }
      return 0;
    };
  const byName = (a: StandingsRow, b: StandingsRow) => a.name.localeCompare(b.name);

  const hIdx = tieKeys.indexOf("h2h");
  const before = (hIdx === -1 ? tieKeys : tieKeys.slice(0, hIdx)).filter(
    (k) => k !== "h2h",
  ) as Exclude<TieKey, "h2h">[];
  const after = (hIdx === -1 ? [] : tieKeys.slice(hIdx + 1)).filter(
    (k) => k !== "h2h",
  ) as Exclude<TieKey, "h2h">[];

  if (hIdx === -1) {
    result.sort((a, b) => b.pts - a.pts || chain(before)(a, b) || byName(a, b));
    return result;
  }

  // Head-to-head: sort by points + pre-h2h criteria, group ties, resolve each
  // group by head-to-head points, then post-h2h criteria, then name.
  const cmpBefore = chain(before);
  result.sort((a, b) => b.pts - a.pts || cmpBefore(a, b));

  const groups: StandingsRow[][] = [];
  for (const row of result) {
    const g = groups[groups.length - 1];
    if (g && g[0].pts === row.pts && cmpBefore(g[0], row) === 0) g.push(row);
    else groups.push([row]);
  }

  const ordered: StandingsRow[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      ordered.push(g[0]);
      continue;
    }
    const set = new Set(g.map((r) => r.team_id));
    const hp = new Map<string, number>(g.map((r) => [r.team_id, 0]));
    for (const gm of games ?? []) {
      if (!gm.home_team_id || !gm.away_team_id) continue;
      if (!set.has(gm.home_team_id) || !set.has(gm.away_team_id)) continue;
      const homeWon = gm.home_score > gm.away_score;
      const otOrSo = gm.decided_in === "ot" || gm.decided_in === "shootout";
      const winId = homeWon ? gm.home_team_id : gm.away_team_id;
      const loseId = homeWon ? gm.away_team_id : gm.home_team_id;
      hp.set(winId, (hp.get(winId) ?? 0) + computeGamePoints(system, true, otOrSo));
      hp.set(loseId, (hp.get(loseId) ?? 0) + computeGamePoints(system, false, otOrSo));
    }
    g.sort(
      (a, b) =>
        (hp.get(b.team_id) ?? 0) - (hp.get(a.team_id) ?? 0) ||
        chain(after)(a, b) ||
        byName(a, b),
    );
    ordered.push(...g);
  }
  return ordered;
}
```

- [ ] **Step 3: Verify + commit**

Run: `bunx tsc --noEmit && bun run lint`. Then:

```bash
git add lib/queries.ts
git commit -m "feat(standings): configurable point system + tie-breakers"
```

---

### Task 3: Standings-rules config UI (action + client editor + page)

**Files:**
- Modify: `app/admin/seasons/actions.ts` (add `updateStandingsRules`)
- Create: `app/admin/seasons/StandingsRulesEditor.tsx`
- Modify: `app/admin/seasons/page.tsx` (flash + a "Standings rules" section per season)

**Interfaces:**
- Produces: server action `updateStandingsRules(formData)` reading `id`, `point_system`, and repeated `tiebreakers`.

- [ ] **Step 1: Add the action** (append to `app/admin/seasons/actions.ts`; `back`, `requireRole`, `createSupabaseServerClient`, `revalidatePublicSeasonPaths`, `redirect` are in scope):

```ts
export async function updateStandingsRules(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const pointSystem = String(formData.get("point_system") ?? "").trim();
  const tiebreakers = formData
    .getAll("tiebreakers")
    .map(String)
    .filter((k) => ["wins", "diff", "gf", "ga", "h2h"].includes(k));

  if (!id || (pointSystem !== "2-1-0" && pointSystem !== "3-2-1")) {
    back("error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seasons")
    .update({ point_system: pointSystem, tiebreakers })
    .eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePublicSeasonPaths();
  redirect("/admin/seasons?saved=rules");
}
```

- [ ] **Step 2: Create the client editor** `app/admin/seasons/StandingsRulesEditor.tsx`:

```tsx
"use client";

import { useState } from "react";

const TIE_LABELS: Record<string, string> = {
  wins: "Wins",
  diff: "Goal differential",
  gf: "Goals for",
  ga: "Goals against (fewest)",
  h2h: "Head-to-head",
};
const ALL_KEYS = ["wins", "diff", "gf", "ga", "h2h"];

export function StandingsRulesEditor({
  action,
  seasonId,
  pointSystem,
  tiebreakers,
}: {
  action: (formData: FormData) => void | Promise<void>;
  seasonId: string;
  pointSystem: string;
  tiebreakers: string[];
}) {
  const [ps, setPs] = useState(pointSystem === "2-1-0" ? "2-1-0" : "3-2-1");
  const [order, setOrder] = useState<string[]>(
    tiebreakers.filter((k) => ALL_KEYS.includes(k)),
  );
  const available = ALL_KEYS.filter((k) => !order.includes(k));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const rowBtn =
    "px-2 min-h-8 border border-rule rounded text-ink-dim hover:text-ink hover:border-rule-strong transition-colors disabled:opacity-30 disabled:hover:text-ink-dim";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={seasonId} />
      {order.map((k) => (
        <input key={k} type="hidden" name="tiebreakers" value={k} />
      ))}

      <fieldset className="space-y-1.5">
        <legend className="eyebrow text-ink-dim mb-1">Point system</legend>
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input
            type="radio"
            name="point_system"
            value="3-2-1"
            checked={ps === "3-2-1"}
            onChange={() => setPs("3-2-1")}
            className="mt-0.5 size-4 accent-ice"
          />
          <span>
            <strong>3-2-1</strong>
            <span className="text-ink-faint"> — reg win 3 · OT win 2 · OT loss 1</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input
            type="radio"
            name="point_system"
            value="2-1-0"
            checked={ps === "2-1-0"}
            onChange={() => setPs("2-1-0")}
            className="mt-0.5 size-4 accent-ice"
          />
          <span>
            <strong>2-1-0</strong>
            <span className="text-ink-faint"> — win 2 · OT loss 1</span>
          </span>
        </label>
      </fieldset>

      <div className="space-y-1.5">
        <span className="eyebrow text-ink-dim">Tie-breakers (applied after points)</span>
        <ol className="space-y-1">
          <li className="text-[12px] text-ink-faint font-mono px-2 py-1">
            1. Points (fixed)
          </li>
          {order.map((k, i) => (
            <li
              key={k}
              className="flex items-center gap-2 panel-bare rounded px-2 py-1"
            >
              <span className="font-mono text-[12px] text-ink w-32">
                {i + 2}. {TIE_LABELS[k]}
              </span>
              <button type="button" className={rowBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                ↑
              </button>
              <button type="button" className={rowBtn} onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Move down">
                ↓
              </button>
              <button type="button" className={rowBtn} onClick={() => setOrder(order.filter((x) => x !== k))} aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ol>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {available.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrder([...order, k])}
                className="eyebrow px-2 py-1 min-h-8 border border-rule rounded text-ink-dim hover:text-ice hover:border-ice/50 transition-colors"
              >
                + {TIE_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
      >
        SAVE RULES
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Wire into the page.** In `app/admin/seasons/page.tsx`: import `updateStandingsRules` (from `./actions`) and `StandingsRulesEditor` (from `./StandingsRulesEditor`); add `point_system` + `tiebreakers` to the `SeasonRow` type and the seasons `.select(...)`; add a flash entry `params.saved === "rules" ? "Standings rules updated." : ...`; and render a section inside the expanded card (after Dates), e.g.:

```tsx
<FieldGroup label="Standings rules">
  <StandingsRulesEditor
    action={updateStandingsRules}
    seasonId={season.id}
    pointSystem={season.point_system}
    tiebreakers={season.tiebreakers}
  />
</FieldGroup>
```

Update `SeasonRow`:
```ts
type SeasonRow = {
  id: string;
  season_type: "spring" | "summer" | "fall" | "winter";
  year: number;
  name: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  period_length_minutes: number;
  point_system: string;
  tiebreakers: string[];
};
```
and the select string to include `point_system, tiebreakers`.

- [ ] **Step 4: Verify + commit**

`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/seasons/actions.ts app/admin/seasons/StandingsRulesEditor.tsx app/admin/seasons/page.tsx
git commit -m "feat(seasons): standings-rules config UI (point system + tie-breakers)"
```

---

### Task 4: Playoff actions — drop `with_playoffs`, drop `seedPlayoffs`, add `generatePlayoffs`

**Files:**
- Modify: `app/admin/seasons/actions.ts`

**Interfaces:**
- Consumes: `getStandings` (Task 2), `buildPlayoffSlots`, `computeGamePoints`.
- Produces: `generatePlayoffs(formData)` reading `season_id`. Removes `seedPlayoffs` and the `with_playoffs` branch of `generateSchedule`.

- [ ] **Step 1: Strip playoff stubs from `generateSchedule`.** In `generateSchedule`, remove the `withPlayoffs` variable (the `const withPlayoffs = ...` line) and the entire `if (withPlayoffs) { ... }` block that pushes the sf1/sf2/final rows. Regular-game insertion and the redirect stay.

- [ ] **Step 2: Delete `seedPlayoffs`.** Remove the whole `export async function seedPlayoffs(...) { ... }` function.

- [ ] **Step 3: Add imports + `generatePlayoffs`.** Ensure `getStandings` and `computeGamePoints` are imported from `@/lib/queries` (getStandings likely already is; add computeGamePoints). Then add:

```ts
export async function generatePlayoffs(formData: FormData) {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  if (!seasonId) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, start_date")
    .eq("id", seasonId)
    .single();
  if (!season) back("error=invalid_input");

  const { data: regGames } = await supabase
    .from("games")
    .select("scheduled_at, status")
    .eq("season_id", seasonId)
    .eq("kind", "regular")
    .order("scheduled_at");
  const regular = regGames ?? [];

  const { data: existingPlayoffs } = await supabase
    .from("games")
    .select("id, playoff_round, status, home_team_id, away_team_id, home_score, away_score")
    .eq("season_id", seasonId)
    .eq("kind", "playoff");
  const playoffs = existingPlayoffs ?? [];

  // Can't start playoffs until the regular season is complete.
  if (
    playoffs.length === 0 &&
    (regular.length === 0 || regular.some((g) => g.status !== "final"))
  ) {
    back("error=regular_incomplete");
  }

  const standings = await getStandings(seasonId);
  if (standings.length < 4) back("error=playoffs_need_four");
  const top4 = standings.slice(0, 4);

  // Create the 3 stubs the first time, dated after the regular season.
  let sf1 = playoffs.find((p) => p.playoff_round === "sf1") ?? null;
  let sf2 = playoffs.find((p) => p.playoff_round === "sf2") ?? null;
  let finalRow = playoffs.find((p) => p.playoff_round === "final") ?? null;

  if (!sf1 || !sf2 || !finalRow) {
    const hhmm = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const times = Array.from(new Set(regular.map((g) => hhmm(g.scheduled_at)))).sort();
    const weekday = new Date(regular[0].scheduled_at).getDay() as WeekdayIdx;
    const ps = buildPlayoffSlots(season.start_date, weekday, times, regular.length);
    const toMake: Array<{ round: "sf1" | "sf2" | "final"; at: string }> = [];
    if (!sf1) toMake.push({ round: "sf1", at: ps.sf1 });
    if (!sf2) toMake.push({ round: "sf2", at: ps.sf2 });
    if (!finalRow) toMake.push({ round: "final", at: ps.final });
    const { data: inserted, error: insErr } = await supabase
      .from("games")
      .insert(
        toMake.map((m) => ({
          season_id: seasonId,
          home_team_id: null,
          away_team_id: null,
          scheduled_at: m.at,
          kind: "playoff" as const,
          playoff_round: m.round,
        })),
      )
      .select("id, playoff_round, status, home_team_id, away_team_id, home_score, away_score");
    if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);
    for (const r of inserted ?? []) {
      if (r.playoff_round === "sf1") sf1 = r;
      else if (r.playoff_round === "sf2") sf2 = r;
      else if (r.playoff_round === "final") finalRow = r;
    }
  }

  const updates: Array<{ id: string; home_team_id: string; away_team_id: string }> = [];
  if (sf1 && sf1.status !== "final") {
    updates.push({ id: sf1.id, home_team_id: top4[0].team_id, away_team_id: top4[3].team_id });
  }
  if (sf2 && sf2.status !== "final") {
    updates.push({ id: sf2.id, home_team_id: top4[1].team_id, away_team_id: top4[2].team_id });
  }
  if (
    finalRow && finalRow.status !== "final" &&
    sf1 && sf2 && sf1.status === "final" && sf2.status === "final"
  ) {
    const sf1Winner = sf1.home_score > sf1.away_score ? sf1.home_team_id : sf1.away_team_id;
    const sf2Winner = sf2.home_score > sf2.away_score ? sf2.home_team_id : sf2.away_team_id;
    if (sf1Winner && sf2Winner) {
      updates.push({ id: finalRow.id, home_team_id: sf1Winner, away_team_id: sf2Winner });
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("games")
      .update({ home_team_id: u.home_team_id, away_team_id: u.away_team_id })
      .eq("id", u.id);
    if (error) back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect(`/admin/seasons?saved=playoffs`);
}
```

- [ ] **Step 4: Verify + commit**

`bunx tsc --noEmit && bun run lint` (there may be a transient "unused" until Task 5 wires the button — if lint flags `generatePlayoffs`/removed `seedPlayoffs` imports, that's resolved in Task 5; tsc must still be 0 errors). Then:
```bash
git add app/admin/seasons/actions.ts
git commit -m "feat(playoffs): generatePlayoffs action; remove stubs + seedPlayoffs"
```

---

### Task 5: Seasons page — Generate Playoffs button, remove checkbox, flashes

**Files:**
- Modify: `app/admin/seasons/page.tsx`

**Interfaces:**
- Consumes: `generatePlayoffs` (Task 4).

- [ ] **Step 1: Imports + flashes + errors.** In `app/admin/seasons/page.tsx`: change the actions import to drop `seedPlayoffs` and add `generatePlayoffs`. Add flash `params.saved === "playoffs" ? "Playoffs generated / advanced." : ...`. Add to `ERROR_MESSAGES`:

```ts
  regular_incomplete: "Finish all regular-season games before generating playoffs.",
  playoffs_need_four: "Need at least 4 teams with standings to seed playoffs.",
```

- [ ] **Step 2: Remove the `with_playoffs` checkbox** from the Generate Schedule form (the `<label>` wrapping `<input type="checkbox" name="with_playoffs" ... />` and its text) and update the neighboring help text so it no longer mentions "Playoffs add … stubs" (playoffs are now separate).

- [ ] **Step 3: Replace the Playoffs section.** Change the playoffs block so the bracket always offers generation. Replace the existing `seedPlayoffs` form/button with a `generatePlayoffs` one, and show the bracket only when stubs exist:

```tsx
<FieldGroup label="Playoffs" accent="ice">
  {hasPlayoffStubs && (
    <div className="space-y-1.5 mb-3">
      <BracketRow label="SF1 (#1 v #4)" slot={sf1} />
      <BracketRow label="SF2 (#2 v #3)" slot={sf2} />
      <BracketRow label="Final" slot={finalSlot} />
    </div>
  )}
  <form action={generatePlayoffs} className="flex flex-wrap items-center gap-3">
    <input type="hidden" name="season_id" value={season.id} />
    <button type="submit" className={primaryBtn}>
      {hasPlayoffStubs ? "ADVANCE / RE-SEED PLAYOFFS" : "GENERATE PLAYOFFS"}
    </button>
    <p className="text-ink-faint text-[11px] flex-1 min-w-[220px]">
      Seeds #1 v #4 and #2 v #3 from the standings once every regular-season game
      is final. Re-run after the semifinals to advance the Final.
    </p>
  </form>
</FieldGroup>
```

Note: `hasPlayoffStubs`, `sf1`, `sf2`, `finalSlot`, `primaryBtn`, `FieldGroup`, `BracketRow` already exist in the file. The Playoffs `FieldGroup` should now render whenever there are teams (drop the `hasPlayoffStubs &&` guard around the whole section so the Generate button is reachable before any stubs exist) — keep the bracket rows themselves behind `hasPlayoffStubs`.

- [ ] **Step 4: Verify + manual check + commit**

`bunx tsc --noEmit && bun run lint` (0 errors; only the two pre-existing warnings). Manual (local stack, admin): on `/admin/seasons` open a season → Standings rules toggles points/tiebreakers; Generate Playoffs errors before all regular games are final, seeds after; re-run advances the Final. Then:
```bash
git add app/admin/seasons/page.tsx
git commit -m "feat(playoffs): Generate Playoffs button; drop reserve-playoffs checkbox"
```

---

## Self-Review

- **Spec coverage:** point_system + tiebreakers columns (T1) ✅; getStandings honors both incl. group-wise h2h (T2) ✅; per-season config UI (T3) ✅; remove with_playoffs + seedPlayoffs, add idempotent generatePlayoffs with regular-complete guard + ≥4 teams + advance-Final (T4) ✅; button + checkbox removal + errors (T5) ✅.
- **Placeholder scan:** none — full code for migration, getStandings, action, editor; T5 gives concrete JSX + exact removals.
- **Type consistency:** `PointSystem`/`TieKey`/`computeGamePoints` defined in T2 and reused in T4; `SeasonRow` extended in T3 matches the T1 columns; `generatePlayoffs`/`updateStandingsRules` field names match the editor/forms.
- **Note:** default 3-2-1 changes existing seasons' standings (spec-documented; overridable per season).

