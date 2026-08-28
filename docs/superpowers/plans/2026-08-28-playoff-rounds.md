# Configurable Playoff Rounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Configurable playoff rounds (0/1/2/3, default 2) up to a top-8 bracket, replacing the fixed top-4 SF+Final.

**Architecture:** Extend the `playoff_round` enum with `qf1–qf4`; add shared bracket helpers; generalize stub creation, seeding/advancement, and the bracket display.

**Tech Stack:** Next.js 16 (RSC + server actions), Supabase, bun.

## Global Constraints

- bun (`bunx`). **No test runner** — verify each task with `bunx tsc --noEmit` (0 errors) + `bun run lint` (only the two pre-existing warnings in `app/admin/schedule/page.tsx`).
- Every task leaves the build green.
- Migrations sequential; next is `0015_`. Apply with `bunx supabase db reset`; regen types `bunx supabase gen types typescript --local > lib/supabase/database.types.ts 2>/dev/null` (redirect stderr).
- Branch `feat/playoff-rounds` (off staging). Spec: `docs/superpowers/specs/2026-08-28-playoff-rounds-design.md`.
- Round formats: 1→`[final]` (top2), 2→`[sf1,sf2,final]` (top4), 3→`[qf1,qf2,qf3,qf4,sf1,sf2,final]` (top8). Round-1 seeds: 1→`[[1,2]]`, 2→`[[1,4],[2,3]]`, 3→`[[1,8],[4,5],[3,6],[2,7]]`. Feeders: 2→`{final:[sf1,sf2]}`, 3→`{sf1:[qf1,qf2],sf2:[qf3,qf4],final:[sf1,sf2]}`.

---

### Task 1: Migration + types + widen unions

**Files:** create `supabase/migrations/0015_playoff_quarterfinals.sql`; regen `lib/supabase/database.types.ts`; widen `playoff_round` unions across the app.

- [ ] **Step 1: Migration**
```sql
-- Extend the playoff bracket to top-8 (quarterfinals).
alter type playoff_round add value if not exists 'qf1' before 'sf1';
alter type playoff_round add value if not exists 'qf2' before 'sf1';
alter type playoff_round add value if not exists 'qf3' before 'sf1';
alter type playoff_round add value if not exists 'qf4' before 'sf1';
```

- [ ] **Step 2: Apply + regen types**
```bash
bunx supabase db reset
bunx supabase gen types typescript --local > lib/supabase/database.types.ts 2>/dev/null
```
Confirm the `playoff_round` enum in the types now lists qf1–qf4 + sf1/sf2/final.

- [ ] **Step 3: Widen the narrow unions.** Run `bunx tsc --noEmit` — it will error on every file whose local type hardcodes `"sf1" | "sf2" | "final"` (the DB now yields a wider union). In each, change that union to `"qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final"`. Expected files: `app/schedule/page.tsx`, `app/players/[id]/page.tsx`, `app/admin/schedule/page.tsx`, `app/admin/seasons/page.tsx`, `app/admin/seasons/actions.ts`, `app/score/page.tsx`, `app/teams/[slug]/page.tsx`, `components/GameRow.tsx`, `components/GameLogSection.tsx` (and any others tsc flags). Do NOT change label rendering — the existing `x === "final" ? "FINAL" : x.toUpperCase()` covers QF/SF.

- [ ] **Step 4: Verify + commit**
`bunx tsc --noEmit` (0 errors) + `bun run lint`. Then:
```bash
git add supabase/migrations/0015_playoff_quarterfinals.sql lib/supabase/database.types.ts app lib components
git commit -m "feat(playoffs): add qf1-qf4 to playoff_round enum; widen unions"
```

---

### Task 2: Shared bracket helpers

**Files:** `lib/season-schedule.ts`

**Interfaces (produces):** `PlayoffRound`, `playoffRoundsFor`, `firstRoundSeeds`, `playoffFeeders`, `playoffLabel`, and a generalized `buildPlayoffSlots(start, weekday, times, regularCount, playoffCount): string[]`.

- [ ] **Step 1: Add helpers** (append near the other schedule helpers):
```ts
export type PlayoffRound = "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final";

/** Playoff games in bracket order (round 1 first … Final last) for R rounds. */
export function playoffRoundsFor(rounds: number): PlayoffRound[] {
  if (rounds === 1) return ["final"];
  if (rounds === 2) return ["sf1", "sf2", "final"];
  if (rounds === 3) return ["qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"];
  return [];
}

/** Round-1 seed pairings (1-indexed) for R rounds, in the same order as the
 *  first N entries of playoffRoundsFor(rounds). */
export function firstRoundSeeds(rounds: number): [number, number][] {
  if (rounds === 1) return [[1, 2]];
  if (rounds === 2) return [[1, 4], [2, 3]];
  if (rounds === 3) return [[1, 8], [4, 5], [3, 6], [2, 7]];
  return [];
}

/** Which two earlier games feed each later game. */
export function playoffFeeders(
  rounds: number,
): Partial<Record<PlayoffRound, [PlayoffRound, PlayoffRound]>> {
  if (rounds === 2) return { final: ["sf1", "sf2"] };
  if (rounds === 3)
    return { sf1: ["qf1", "qf2"], sf2: ["qf3", "qf4"], final: ["sf1", "sf2"] };
  return {};
}

export function playoffLabel(r: PlayoffRound): string {
  return r === "final" ? "Final" : r.toUpperCase();
}
```

- [ ] **Step 2: Add a generalized `playoffSlots`** — leave the existing `buildPlayoffSlots` untouched (Task 3 switches the caller to `playoffSlots` and then removes the old one, so the build stays green here):
```ts
/** ISO timestamps for `playoffCount` playoff games, laid into the weekly grid
 *  right after the regular season (bracket order). */
export function playoffSlots(
  startDate: string,
  weekday: WeekdayIdx,
  times: string[],
  regularCount: number,
  playoffCount: number,
): string[] {
  if (times.length === 0 || playoffCount <= 0) return [];
  const slots = buildGameSlots(startDate, weekday, times, regularCount + playoffCount);
  return slots.slice(regularCount);
}
```

- [ ] **Step 3: Verify + commit** — build stays green (old `buildPlayoffSlots` still there and still called). `bunx tsc --noEmit && bun run lint`, then:
```bash
git add lib/season-schedule.ts
git commit -m "feat(playoffs): shared bracket helpers + playoffSlots"
```

---

### Task 3: Generate stubs for N rounds + "Playoff rounds" selector

**Files:** `app/admin/seasons/actions.ts` (`generateSchedule`), `app/admin/seasons/page.tsx` (generate form).

- [ ] **Step 1: `generateSchedule` stub creation.** Replace the `withPlayoffs` boolean + its stub block with a rounds-driven version:
```ts
const playoffRounds = Math.max(0, Math.min(3, parseInt0(String(formData.get("playoff_rounds") ?? "2"), 2)));
```
and where the old `if (withPlayoffs) {…}` was:
```ts
const bracket = playoffRoundsFor(playoffRounds);
if (bracket.length > 0) {
  const ptimes = playoffSlots(season.start_date, weekday, times, pairs.length, bracket.length);
  bracket.forEach((round, i) =>
    rows.push({
      season_id: seasonId,
      home_team_id: null,
      away_team_id: null,
      scheduled_at: ptimes[i],
      location,
      kind: "playoff",
      playoff_round: round,
    }),
  );
}
```
Import `playoffRoundsFor` + `playoffSlots` from `@/lib/season-schedule`, and **remove the now-unused old `buildPlayoffSlots`** from `lib/season-schedule.ts` (generateSchedule was its only caller).

- [ ] **Step 2: Generate form selector.** In `app/admin/seasons/page.tsx`, replace the `with_playoffs` checkbox `<label>` with a Playoff rounds select:
```tsx
<label className="block w-full sm:w-auto sm:min-w-[200px]">
  <span className="eyebrow">Playoff rounds</span>
  <select name="playoff_rounds" defaultValue="2" className={`mt-1 ${inputCls}`}>
    <option value="0">None</option>
    <option value="1">Final only (top 2)</option>
    <option value="2">Semis + Final (top 4)</option>
    <option value="3">Quarters + Semis + Final (top 8)</option>
  </select>
</label>
```
Update the adjacent help text: playoffs add the chosen rounds as TBD stubs after the final week; seed them from the Playoffs section.

- [ ] **Step 3: Verify + commit**
`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/seasons/actions.ts app/admin/seasons/page.tsx
git commit -m "feat(playoffs): Playoff rounds selector; generate N-round stubs"
```

---

### Task 4: Generalized seeding + advancement in `generatePlayoffs`

**Files:** `app/admin/seasons/actions.ts` (`generatePlayoffs`)

- [ ] **Step 1: Rewrite the seed/advance logic.** Read the current `generatePlayoffs`. Keep its shape (admin gate, load season + regular games + playoff games, the `regular_incomplete` guard when no playoffs exist yet, and the stub-creation-if-missing branch — but that branch should now build stubs for the inferred rounds using `playoffRoundsFor`). Replace the hardcoded sf1/sf2/final seeding + Final advancement with:
```ts
// infer rounds from existing playoff games
const roundsOf = (rs: string[]) =>
  rs.some((r) => r.startsWith("qf")) ? 3 : rs.some((r) => r.startsWith("sf")) ? 2 : rs.includes("final") ? 1 : 0;
const rounds = roundsOf(playoffs.map((p) => p.playoff_round ?? ""));
if (rounds === 0) back("error=invalid_input");

const need = 2 ** rounds;
const standings = await getStandings(seasonId);
if (standings.length < need) back("error=not_enough_seeds"); // message: needs `need` teams

const order = playoffRoundsFor(rounds);
const seeds = firstRoundSeeds(rounds); // pairings for the first order.length-… entries
const feeders = playoffFeeders(rounds);
const byRound = new Map(playoffs.map((p) => [p.playoff_round, p]));
const updates: { id: string; home_team_id: string | null; away_team_id: string | null }[] = [];

// Round 1: seed from standings (skip games already final).
seeds.forEach(([hi, ai], i) => {
  const g = byRound.get(order[i]);
  if (g && g.status !== "final")
    updates.push({ id: g.id, home_team_id: standings[hi - 1].team_id, away_team_id: standings[ai - 1].team_id });
});

// Later rounds: fill from feeders once both are final. Higher seed (feeder listed first) is home.
const winner = (g: { home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number }) =>
  g.home_score >= g.away_score ? g.home_team_id : g.away_team_id;
for (const [round, [a, b]] of Object.entries(feeders)) {
  const g = byRound.get(round as PlayoffRound);
  const ga = byRound.get(a), gb = byRound.get(b);
  if (g && g.status !== "final" && ga?.status === "final" && gb?.status === "final") {
    const wa = winner(ga), wb = winner(gb);
    if (wa && wb) updates.push({ id: g.id, home_team_id: wa, away_team_id: wb });
  }
}
```
Then apply `updates` (same per-row update loop as today), revalidate, redirect `?saved=playoffs`. Import `playoffRoundsFor`, `firstRoundSeeds`, `playoffFeeders`, `type PlayoffRound`. Ensure the playoff-games select includes `home_score, away_score, status, playoff_round, home_team_id, away_team_id, id`.

- [ ] **Step 2: Add the error message** `not_enough_seeds` (or reuse `playoffs_need_four` reworded) in `app/admin/seasons/page.tsx` ERROR_MESSAGES: "Not enough teams in the standings for that bracket."

- [ ] **Step 3: Verify + commit**
`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/seasons/actions.ts app/admin/seasons/page.tsx
git commit -m "feat(playoffs): generalized seeding + winner advancement"
```

---

### Task 5: Bracket display renders present rounds

**Files:** `app/admin/seasons/page.tsx` (Playoffs disclosure + `BracketRow`)

- [ ] **Step 1: Render dynamically.** Replace the hardcoded SF1/SF2/Final `BracketRow`s with the season's playoff games sorted by bracket order and labeled via `playoffLabel`. Build from `bracketBySeason.get(season.id)` (already fetched), sort by `playoffRoundsFor(3).indexOf(playoff_round)`, and render a `BracketRow` per game with `label={playoffLabel(g.playoff_round)}`. Optionally group with small "Quarterfinals / Semifinals / Final" subheaders when present. `BracketRow`'s `label` prop already exists; pass the dynamic label. Import `playoffLabel`, `playoffRoundsFor`.

- [ ] **Step 2: Verify + manual check + commit**
`bunx tsc --noEmit && bun run lint`. Manual (local): `scripts/local/seed-sample.sh 5`; on `/admin/seasons` → Schedule Generator, generate with Playoff rounds = 1 and = 2 (5 teams supports up to top-4); confirm stubs + dates; mark round games final and run **Update Playoff Matchups** → next round fills; bracket display shows the right labels. (rounds=3 needs 8 teams.) Then:
```bash
git add app/admin/seasons/page.tsx
git commit -m "feat(playoffs): dynamic bracket display for present rounds"
```

---

## Self-Review

- **Spec coverage:** enum qf1-4 + union widening (T1) ✅; helpers + generalized dates (T2) ✅; rounds selector + N-round stubs (T3) ✅; generalized seeding/advancement (T4) ✅; dynamic bracket UI (T5) ✅.
- **Build-green ordering:** T2 changes `buildPlayoffSlots`'s signature, breaking its caller — folded the caller fix into T2/T3 so no task lands red (call it out in T2 Step 3).
- **Type consistency:** `PlayoffRound` union defined in T2 matches the widened unions from T1; `playoffRoundsFor`/`firstRoundSeeds`/`playoffFeeders` keyed consistently (qf1-4, sf1-2, final).
- **Placeholder scan:** helper code is complete; T4/T5 give the core logic and point at the current functions to adapt.
