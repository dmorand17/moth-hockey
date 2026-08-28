# Schedule Skip-a-Week + Bye Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins skip a week (with a reason) so all later scheduled games shift +7 days, record the skip for public display, and show bye-week teams on the schedule.

**Architecture:** A new `schedule_skips` table logs skips (date + reason). A `skipWeek` server action shifts still-`scheduled` games on/after the picked date by 7 days and inserts a skip row. Bye teams are *derived* (not stored) from the games per game-night and rendered on both schedules. The already-implemented "Weeks" rename of the generator ships in the same branch.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase (Postgres + RLS), supabase-js, Tailwind v4, bun.

## Global Constraints

- Package manager is **bun**; run binaries with **bunx** (e.g. `bunx supabase`, `bunx tsc`).
- **No test runner is configured.** Verification per task is `bunx tsc --noEmit` (0 errors), `bun run lint` (no new errors beyond the two pre-existing warnings in `app/admin/schedule/page.tsx`), plus manual checks on the local stack for UI. Do **not** add a test framework.
- Server actions live in `"use server"` modules; gate every mutation with `await requireRole(["admin"])`.
- Migrations are sequential SQL files in `supabase/migrations/`; next is `0012_`. Use `gen_random_uuid()` and `public.is_admin()` to match existing conventions.
- After any schema change, regenerate types: `bunx supabase gen types typescript --local > lib/supabase/database.types.ts`.
- Branch: `feat/schedule-enhancements` (already checked out). One PR to `staging`.
- Spec: `docs/superpowers/specs/2026-08-27-schedule-skip-week-and-byes-design.md`.

---

### Task 1: Commit the already-implemented "Weeks" rename

The generator rename (Rounds→Weeks, `roundRobinGames`) is already in the working tree; commit it as the branch's first change.

**Files:**
- Modify (already edited): `lib/season-schedule.ts` (adds `roundRobinGames`)
- Modify (already edited): `app/admin/seasons/actions.ts` (reads `weeks`, uses `roundRobinGames`)
- Modify (already edited): `app/admin/seasons/page.tsx` (field label "Weeks", `name="weeks"`, `defaultValue={10}`, `max={52}`, help text)

- [ ] **Step 1: Verify typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 2: Verify lint**

Run: `bun run lint`
Expected: only the two pre-existing warnings in `app/admin/schedule/page.tsx` (`COMMON_GAME_TIMES`, `formatLocalTime`), 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/season-schedule.ts app/admin/seasons/actions.ts app/admin/seasons/page.tsx
git commit -m "feat(schedule): generate by weeks instead of round-robin rounds"
```

---

### Task 2: `schedule_skips` migration + regenerated types

**Files:**
- Create: `supabase/migrations/0012_schedule_skips.sql`
- Modify (generated): `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: table `public.schedule_skips (id uuid, season_id uuid, skip_date date, reason text, created_at timestamptz)`, readable by all, writable by admins. Later tasks query/insert/delete it via supabase-js.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_schedule_skips.sql`:

```sql
-- Weeks skipped mid-season (weather, etc.). The skipWeek action shifts the
-- affected games; this table is the human-facing log shown on the schedule.
create table schedule_skips (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  skip_date  date not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- One skip per (season, date).
create unique index schedule_skips_season_date_key
  on schedule_skips (season_id, skip_date);

alter table schedule_skips enable row level security;

-- Public read so the note shows on the public schedule; admins write.
create policy "public read schedule_skips" on schedule_skips
  for select using (true);
create policy "admins write schedule_skips" on schedule_skips
  for all using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Apply locally + reseed**

Run: `bunx supabase db reset`
Expected: all migrations apply through `0012`, seed runs, no errors.

- [ ] **Step 3: Regenerate types**

Run: `bunx supabase gen types typescript --local > lib/supabase/database.types.ts`
Expected: file now contains a `schedule_skips` entry under `Tables`.

- [ ] **Step 4: Verify typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_schedule_skips.sql lib/supabase/database.types.ts
git commit -m "feat(schedule): add schedule_skips table + RLS"
```

---

### Task 3: Bye-derivation helpers in `lib/season-schedule.ts`

**Files:**
- Modify: `lib/season-schedule.ts`

**Interfaces:**
- Produces:
  - `localDateKey(iso: string): string` → `"YYYY-MM-DD"` in local time.
  - `byeTeamNamesByDate(teams: { id: string; name: string }[], regularGames: { localDate: string; homeTeamId: string | null; awayTeamId: string | null }[]): Record<string, string[]>` → map of local date → bye team names (only dates that actually have byes).

- [ ] **Step 1: Add the helpers**

Append to `lib/season-schedule.ts`:

```ts
/** "YYYY-MM-DD" in local time — a stable per-game-night key. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bye teams per game night: for each date that has regular-season games, the
 * teams NOT playing that night. Derived, so it stays correct as weeks shift.
 * Returns only dates that have at least one bye (even team counts → empty).
 */
export function byeTeamNamesByDate(
  teams: { id: string; name: string }[],
  regularGames: { localDate: string; homeTeamId: string | null; awayTeamId: string | null }[],
): Record<string, string[]> {
  const playingByDate = new Map<string, Set<string>>();
  for (const g of regularGames) {
    const set = playingByDate.get(g.localDate) ?? new Set<string>();
    if (g.homeTeamId) set.add(g.homeTeamId);
    if (g.awayTeamId) set.add(g.awayTeamId);
    playingByDate.set(g.localDate, set);
  }

  const out: Record<string, string[]> = {};
  for (const [date, playing] of playingByDate) {
    const byes = teams.filter((t) => !playing.has(t.id)).map((t) => t.name);
    if (byes.length > 0) out[date] = byes;
  }
  return out;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Sanity-check the logic manually**

Reason through it: 5 teams (A–E), one date with games A–B and C–D → E is the bye. With 4 teams and games A–B, C–D → no date key emitted (empty). Confirm the code matches. No code change expected.

- [ ] **Step 4: Commit**

```bash
git add lib/season-schedule.ts
git commit -m "feat(schedule): derive bye teams per game night"
```

---

### Task 4: `skipWeek` + `removeScheduleSkip` server actions

**Files:**
- Modify: `app/admin/schedule/actions.ts`

**Interfaces:**
- Consumes: `getCurrentSeason()`, `createSupabaseServerClient()`, `requireRole` (already imported), `schedule_skips` table (Task 2).
- Produces: server actions `skipWeek(formData)` and `removeScheduleSkip(formData)`. `skipWeek` reads `skip_date` (`YYYY-MM-DD`) + `reason`; `removeScheduleSkip` reads `id`.

- [ ] **Step 1: Add the actions**

Append to `app/admin/schedule/actions.ts` (the file already has `back`, `requireRole`, `createSupabaseServerClient`, `getCurrentSeason`, `revalidatePath`, `redirect` in scope):

```ts
export async function skipWeek(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) back("error=no_season");

  const skipDate = String(formData.get("skip_date") ?? "").trim(); // YYYY-MM-DD
  const reason = String(formData.get("reason") ?? "").trim();
  if (!skipDate || !reason) back("error=invalid_input");

  // Local start-of-day for the picked date, as an ISO instant for comparison.
  const [y, m, d] = skipDate.split("-").map(Number);
  const fromIso = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString();

  // Push every still-scheduled game on/after that date out by 7 days.
  const { data: games, error: fetchErr } = await supabase
    .from("games")
    .select("id, scheduled_at")
    .eq("season_id", season.id)
    .eq("status", "scheduled")
    .gte("scheduled_at", fromIso);
  if (fetchErr) back(`error=${encodeURIComponent(fetchErr.message)}`);

  for (const g of games ?? []) {
    const next = new Date(
      new Date(g.scheduled_at).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error: updErr } = await supabase
      .from("games")
      .update({ scheduled_at: next, updated_at: new Date().toISOString() })
      .eq("id", g.id);
    if (updErr) back(`error=${encodeURIComponent(updErr.message)}`);
  }

  const { error: insErr } = await supabase
    .from("schedule_skips")
    .insert({ season_id: season.id, skip_date: skipDate, reason });
  if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect("/admin/schedule?saved=skipped");
}

export async function removeScheduleSkip(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const { error } = await supabase.from("schedule_skips").delete().eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect("/admin/schedule?saved=skip_removed");
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: 0 errors; only the two pre-existing warnings.

- [ ] **Step 3: Commit**

```bash
git add app/admin/schedule/actions.ts
git commit -m "feat(schedule): skipWeek + removeScheduleSkip actions"
```

---

### Task 5: Admin schedule UI — skip form, skips list, byes

**Files:**
- Modify: `app/admin/schedule/page.tsx`

**Interfaces:**
- Consumes: `skipWeek`, `removeScheduleSkip` (Task 4); `localDateKey`, `byeTeamNamesByDate` (Task 3).

- [ ] **Step 1: Import the actions + helpers and fetch skips**

In `app/admin/schedule/page.tsx`, update the actions import and add the helper import:

```ts
import { createGame, updateGame, deleteGame, skipWeek, removeScheduleSkip } from "./actions";
import { localDateKey, byeTeamNamesByDate } from "@/lib/season-schedule";
```

Add flash entries (merge into the existing `FLASH_MESSAGES`):

```ts
const FLASH_MESSAGES: Record<string, string> = {
  created: "Game created.",
  updated: "Game updated.",
  deleted: "Game deleted.",
  skipped: "Week skipped — later games moved out a week.",
  skip_removed: "Skip note removed.",
};
```

Extend the parallel fetch to also load `schedule_skips` (add to the existing `Promise.all`):

```ts
  const [{ data: teams }, { data: gamesRaw }, { data: skips }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("games")
      .select(
        "id, scheduled_at, location, status, kind, playoff_round, home_score, away_score, decided_in, home_team:home_team_id(id, name, color), away_team:away_team_id(id, name, color)",
      )
      .eq("season_id", season.id)
      .order("scheduled_at"),
    supabase
      .from("schedule_skips")
      .select("id, skip_date, reason")
      .eq("season_id", season.id)
      .order("skip_date"),
  ]);
```

- [ ] **Step 2: Compute byes after `const games = ...`**

```ts
  const byesByDate = byeTeamNamesByDate(
    (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    games
      .filter((g) => g.kind === "regular")
      .map((g) => ({
        localDate: localDateKey(g.scheduled_at),
        homeTeamId: g.home_team?.id ?? null,
        awayTeamId: g.away_team?.id ?? null,
      })),
  );
  const byeEntries = Object.entries(byesByDate).sort(([a], [b]) => a.localeCompare(b));
  const skipList = skips ?? [];
```

- [ ] **Step 3: Add the "Skip a week" section**

Insert this `<section>` immediately after the closing `</section>` of the NEW GAME block (before the game list):

```tsx
      {/* Skip a week */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          SKIP A WEEK
        </h2>
        <form action={skipWeek} className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-full sm:w-auto sm:min-w-[160px]">
              <span className="eyebrow">Week of</span>
              <input type="date" name="skip_date" required className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block flex-1 min-w-[200px]">
              <span className="eyebrow">Reason</span>
              <input
                type="text"
                name="reason"
                required
                placeholder="Weather — rink closed"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <button
              type="submit"
              className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0"
            >
              SKIP
            </button>
          </div>
          <p className="text-ink-faint text-[12px]">
            Pushes every scheduled game on or after that date out by one week.
            Played (live/final) games are left in place.
          </p>
        </form>

        {skipList.length > 0 && (
          <ul className="border border-rule rounded divide-y divide-rule/50">
            {skipList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-[13px] text-ink">
                  <span className="font-mono text-ink-dim">{s.skip_date}</span> — {s.reason}
                </span>
                <form action={removeScheduleSkip}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="px-2.5 py-1 min-h-8 text-goal border border-goal/40 hover:bg-goal/10 font-display tracking-[0.1em] text-[11px] rounded transition-colors"
                  >
                    REMOVE
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 4: Add a byes summary**

Insert directly after the Skip-a-week `</section>` (only renders when there are byes):

```tsx
      {byeEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">BYES</h2>
          <ul className="border border-rule rounded divide-y divide-rule/50">
            {byeEntries.map(([date, teamNames]) => (
              <li key={date} className="px-3 py-2 text-[13px] text-ink">
                <span className="font-mono text-ink-dim">{date}</span> — {teamNames.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: 0 errors; the two pre-existing warnings only.

- [ ] **Step 6: Manual check**

Ensure the local stack is running (`bunx supabase status`, `bun dev`). As `admin@moth.test` (see `docs/LOCAL-TESTING.md`) open http://127.0.0.1:3001/admin/schedule. With an odd-team season generated, confirm: the SKIP A WEEK form and BYES list render; submitting a skip shows the flash, moves later games out a week, and adds a skip row; REMOVE deletes the row without changing dates.

- [ ] **Step 7: Commit**

```bash
git add app/admin/schedule/page.tsx
git commit -m "feat(schedule): admin skip-a-week form, skips list, byes"
```

---

### Task 6: Public schedule UI — byes + postponement notes

**Files:**
- Modify: `app/schedule/page.tsx`

**Interfaces:**
- Consumes: `localDateKey`, `byeTeamNamesByDate` (Task 3); `schedule_skips` table (Task 2).

- [ ] **Step 1: Fetch teams + skips and add team ids to the games select**

In `app/schedule/page.tsx`, add the import:

```ts
import { localDateKey, byeTeamNamesByDate } from "@/lib/season-schedule";
```

Replace the single games query with a parallel fetch that also gets team ids, the season teams, and the skips:

```ts
  const [{ data: gamesRaw }, { data: teams }, { data: skips }] = await Promise.all([
    supabase
      .from("games")
      .select(
        "id, scheduled_at, status, kind, playoff_round, home_score, away_score, decided_in, home_team_id, away_team_id, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
      )
      .eq("season_id", season.id)
      .order("scheduled_at"),
    supabase.from("teams").select("id, name").eq("season_id", season.id),
    supabase
      .from("schedule_skips")
      .select("skip_date, reason")
      .eq("season_id", season.id)
      .order("skip_date"),
  ]);
```

Extend the `ScheduleGame` type with the two scalar id columns:

```ts
type ScheduleGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "sf1" | "sf2" | "final" | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};
```

- [ ] **Step 2: Compute byes + a month→notes map after the `groups` loop**

```ts
  const byesByDate = byeTeamNamesByDate(
    (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    games
      .filter((g) => g.kind === "regular")
      .map((g) => ({
        localDate: localDateKey(g.scheduled_at),
        homeTeamId: g.home_team_id,
        awayTeamId: g.away_team_id,
      })),
  );

  // Group byes + postponements by the same "Month YYYY" key used for games.
  const monthKey = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  const dateLabel = (isoDate: string) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const byesByMonth: Record<string, string[]> = {};
  for (const [date, names] of Object.entries(byesByDate)) {
    const [y, m, d] = date.split("-").map(Number);
    const k = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (byesByMonth[k] ||= []).push(`${dateLabel(date)}: ${names.join(", ")}`);
  }

  const skipsByMonth: Record<string, string[]> = {};
  for (const s of skips ?? []) {
    const [y, m, d] = s.skip_date.split("-").map(Number);
    const k = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (skipsByMonth[k] ||= []).push(`${dateLabel(s.skip_date)}: ${s.reason}`);
  }
```

(`monthKey` is defined for parity with the grouping key; the inline `toLocaleDateString` calls above build the same "Month YYYY" strings.)

- [ ] **Step 3: Render byes + postponements under each month's grid**

Inside the month `.map`, after the closing `</div>` of the games grid and before the section closes, add:

```tsx
            {byesByMonth[month] && (
              <p className="mt-3 text-[12px] text-ink-faint">
                <span className="eyebrow text-ink-dim">Byes</span> — {byesByMonth[month].join(" · ")}
              </p>
            )}
            {skipsByMonth[month] && (
              <p className="mt-1 text-[12px] text-goal/80">
                <span className="eyebrow">Postponed</span> — {skipsByMonth[month].join(" · ")}
              </p>
            )}
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: 0 errors; the two pre-existing warnings only.

- [ ] **Step 5: Manual check**

Open http://127.0.0.1:3001/schedule (public, no login). With an odd-team season, confirm each month shows a "Byes — …" line matching the sit-out team per week. After skipping a week in admin, confirm a "Postponed — …" line appears and the shifted games display on their new dates.

- [ ] **Step 6: Commit**

```bash
git add app/schedule/page.tsx
git commit -m "feat(schedule): public byes + postponement notes"
```

---

## Self-Review

- **Spec coverage:** schedule_skips table + RLS (Task 2) ✓; skipWeek shift of scheduled games incl. playoffs (Task 4, `.eq("status","scheduled")` + `.gte` covers both kinds) ✓; record + public display (Tasks 2, 6) ✓; removeScheduleSkip note-only delete (Task 4) ✓; derived byes shown public + admin (Tasks 3, 5, 6) ✓; even-team → no byes (helper returns empty) ✓; weeks rename ships in branch (Task 1) ✓.
- **Placeholder scan:** none — every code step has complete content.
- **Type consistency:** `localDateKey` / `byeTeamNamesByDate` signatures used identically in Tasks 5 and 6; `skip_date` is `YYYY-MM-DD` text everywhere; games select in Task 6 adds `home_team_id`/`away_team_id` matched by the extended `ScheduleGame` type.
- **Note:** public byes/postponements are rendered as per-month summary lines (not per-day sub-groups) to avoid restructuring the month-grouped layout — an intentional, spec-consistent choice.
