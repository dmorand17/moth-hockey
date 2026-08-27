# Edit or Undo a Scoring Event — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scorekeeper tap a live goal/penalty event and choose to **Edit** its details or **Undo** it, instead of only undoing.

**Architecture:** Extend the event data reaching the client with player IDs, add an `editEvent` server action that updates a `game_events` row (reconciling the score only when a penalty's shot result flips), and add an event action menu + field-list edit sheet to the existing `LiveScoring` client component.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres). Package manager `bun`.

## Global Constraints

- **No test runner is configured.** Verification per task = `bunx tsc --noEmit` (clean, exit 0) and `bun run lint` (0 errors). The final task adds manual local verification.
- **Live games only** — all edit/undo paths run behind the existing `ensureLiveAccess` gate (`admin` or `scorekeeper`, game `status === "live"`).
- **Team side is never editable.** A goal's team and a penalty's committing/shooting teams are fixed.
- **Next.js 16 / React 19** conventions; server mutations live in colocated `actions.ts` (`"use server"`) and call `requireRole`/`ensureLiveAccess` before writing.
- **Mobile-first:** design at ≤390px, tap targets ≥44px.
- Commit with conventional-commit messages (`feat(score): …`). Do not push.
- Work on branch `feat/edit-undo-scoring-event` (already created off `staging`).

---

### Task 1: Expose event player IDs to the client

**Files:**
- Modify: `app/score/[gameId]/page.tsx` (the `LiveView` `EventRow` type + `events` mapping)
- Modify: `components/LiveScoring.tsx:24-37` (the `EventRow` type)

**Interfaces:**
- Produces: the client `EventRow` type gains `scorer_id`, `assist1_id`, `assist2_id`, `shooter_id` (all `string | null`). Consumed by Tasks 3 & 4.

- [ ] **Step 1: Add ID fields to the mapped events in `page.tsx`**

In `app/score/[gameId]/page.tsx`, the `LiveView` function builds `const events = evRows.map(...)`. Replace that map with one that also carries IDs (the query already selects `scorer:player_id(id, …)` etc., so the ids are present):

```tsx
  const events = evRows.map((e) => ({
    id: e.id,
    type: e.type,
    team_id: e.team_id,
    period: e.period,
    clock_seconds: e.clock_seconds,
    scorer_id: e.scorer?.id ?? null,
    scorer_name: e.scorer ? `${e.scorer.first_name} ${e.scorer.last_name}` : null,
    assist1_id: e.assist1?.id ?? null,
    assist1_name: e.assist1 ? `${e.assist1.first_name} ${e.assist1.last_name}` : null,
    assist2_id: e.assist2?.id ?? null,
    assist2_name: e.assist2 ? `${e.assist2.first_name} ${e.assist2.last_name}` : null,
    penalty_type: e.penalty_type,
    penalty_type_other: e.penalty_type_other,
    penalty_shot_result: e.penalty_shot_result,
    shooter_id: e.shooter?.id ?? null,
    shooter_name: e.shooter ? `${e.shooter.first_name} ${e.shooter.last_name}` : null,
  }));
```

- [ ] **Step 2: Add the ID fields to the `EventRow` type in `components/LiveScoring.tsx`**

Replace the `EventRow` type (lines 24-37) with:

```tsx
type EventRow = {
  id: string;
  type: "goal" | "penalty";
  team_id: string;
  period: number;
  clock_seconds: number;
  scorer_id: string | null;
  scorer_name: string | null;
  assist1_id: string | null;
  assist1_name: string | null;
  assist2_id: string | null;
  assist2_name: string | null;
  penalty_type: string | null;
  penalty_type_other: string | null;
  penalty_shot_result: "goal" | "saved" | null;
  shooter_id: string | null;
  shooter_name: string | null;
};
```

- [ ] **Step 3: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors (2 pre-existing warnings in `app/admin/schedule/page.tsx` are acceptable).

- [ ] **Step 4: Commit**

```bash
git add app/score/[gameId]/page.tsx components/LiveScoring.tsx
git commit -m "feat(score): carry event player IDs to the live scoring client"
```

---

### Task 2: `editEvent` server action

**Files:**
- Modify: `app/score/[gameId]/actions.ts` (append the action + exported `EditPayload` type)

**Interfaces:**
- Consumes: `ensureLiveAccess` (existing), `PENALTY_TYPES`/`PenaltyType` (existing import), `ActionResult` (existing).
- Produces:
  - `export type EditPayload` (discriminated union, below) — consumed by Task 4.
  - `export async function editEvent(input: { gameId: string; eventId: string } & EditPayload): Promise<ActionResult>` — consumed by Task 4.

- [ ] **Step 1: Append the `EditPayload` type and `editEvent` action to `actions.ts`**

Add at the end of `app/score/[gameId]/actions.ts`:

```ts
export type EditPayload =
  | {
      type: "goal";
      scorerId: string;
      assist1Id: string | null;
      assist2Id: string | null;
      period: number;
      clockSeconds: number;
    }
  | {
      type: "penalty";
      offenderId: string;
      penaltyType: PenaltyType;
      penaltyTypeOther: string | null;
      shotTakerId: string;
      shotResult: "goal" | "saved";
      period: number;
      clockSeconds: number;
    };

// Edit an existing goal/penalty event in place (live only). Goal edits are
// stats-only. A penalty edit only changes the score when its shot result flips
// goal<->saved; the scoring (shooting) team is the side opposite the committing
// team (ev.team_id), which is never editable.
export async function editEvent(
  input: { gameId: string; eventId: string } & EditPayload,
): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  const { data: ev, error: fetchErr } = await supabase
    .from("game_events")
    .select("id, type, team_id, penalty_shot_result")
    .eq("id", input.eventId)
    .eq("game_id", input.gameId)
    .single();
  if (fetchErr || !ev) return { ok: false, error: fetchErr?.message ?? "Event not found." };
  if (ev.type !== input.type) {
    return { ok: false, error: "Event type can't be changed." };
  }

  const period = Math.max(1, Math.min(5, Math.floor(input.period)));
  const clock = Math.max(0, Math.min(60 * 99, Math.floor(input.clockSeconds)));

  if (input.type === "goal") {
    if (!input.scorerId) return { ok: false, error: "Scorer required." };
    const { error: updErr } = await supabase
      .from("game_events")
      .update({
        period,
        clock_seconds: clock,
        player_id: input.scorerId,
        assist1_player_id: input.assist1Id ?? null,
        assist2_player_id: input.assist2Id ?? null,
      })
      .eq("id", input.eventId);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    if (!input.offenderId) return { ok: false, error: "Offender required." };
    if (!PENALTY_TYPES.includes(input.penaltyType)) {
      return { ok: false, error: "Invalid penalty type." };
    }
    if (input.penaltyType === "other" && !input.penaltyTypeOther?.trim()) {
      return { ok: false, error: "Describe the penalty in the notes." };
    }
    if (!input.shotTakerId) return { ok: false, error: "Shot taker required." };

    const oldWasGoal = ev.penalty_shot_result === "goal";
    const newIsGoal = input.shotResult === "goal";

    const { error: updErr } = await supabase
      .from("game_events")
      .update({
        period,
        clock_seconds: clock,
        player_id: input.offenderId,
        penalty_type: input.penaltyType,
        penalty_type_other:
          input.penaltyType === "other" ? (input.penaltyTypeOther ?? "").trim() : null,
        penalty_shot_result: input.shotResult,
        penalty_shot_taker_id: input.shotTakerId,
      })
      .eq("id", input.eventId);
    if (updErr) return { ok: false, error: updErr.message };

    if (oldWasGoal !== newIsGoal) {
      // Shooting team = opposite of committing team (ev.team_id).
      const shootingTeamIsHome = ev.team_id !== game.home_team_id;
      const cur = shootingTeamIsHome ? game.home_score : game.away_score;
      const next = Math.max(0, cur + (newIsGoal ? 1 : -1));
      const update = shootingTeamIsHome ? { home_score: next } : { away_score: next };
      const { error: scoreErr } = await supabase
        .from("games")
        .update(update)
        .eq("id", input.gameId);
      if (scoreErr) return { ok: false, error: scoreErr.message };
    }
  }

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/score/[gameId]/actions.ts
git commit -m "feat(score): add editEvent action for live goal/penalty edits"
```

---

### Task 3: `EditEventSheet` field-list edit UI

**Files:**
- Modify: `components/LiveScoring.tsx` (add the `EditEventSheet` component + a `formatClock` import is already present; the new sheet lives alongside `GoalSheet`/`PenaltySheet`)

> **Decision (deviates from spec):** the spec proposed a separate file, but all
> scoring sheets (`GoalSheet`, `PenaltySheet`, `AdvanceSheet`, `FinalizeSheet`)
> and their shared helpers (`Sheet`, `PlayerGrid`, `prettyPenalty`) already live
> in `LiveScoring.tsx`. Putting `EditEventSheet` there follows the established
> co-location pattern and avoids a circular import (or a broader refactor to
> extract the shared primitives). Keep it here.

**Interfaces:**
- Consumes: `EventRow` (Task 1), `EditPayload` (Task 2), and in-file helpers
  `Sheet`, `PlayerGrid`, `prettyPenalty`, `formatClock`, `formatPeriod`,
  `PENALTY_TYPES`/`PenaltyType`, and the `Game`/`RosterPlayer` types.
- Produces: `EditEventSheet` component with props
  `{ game: Game; event: EventRow; homeRoster: RosterPlayer[]; awayRoster: RosterPlayer[]; onCancel: () => void; onSubmit: (payload: EditPayload) => void }`.
  Consumed by Task 4.

- [ ] **Step 1: Import `EditPayload` in `components/LiveScoring.tsx`**

Change the actions import (currently ends with `undoEvent,`) to also import `editEvent` and the type. The import block becomes:

```tsx
import {
  adjustShootoutTally,
  advancePeriod,
  editEvent,
  finalizeGame,
  recordGoal,
  recordPenalty,
  revertPeriod,
  setClock,
  undoEvent,
  type EditPayload,
} from "@/app/score/[gameId]/actions";
```

- [ ] **Step 2: Add the `EditEventSheet` component**

Add this component in `components/LiveScoring.tsx`, immediately after the `FinalizeSheet` function (before `PlayerGrid`). It reuses `Sheet`, `PlayerGrid`, `prettyPenalty`, `formatClock`, `formatPeriod`, `PENALTY_TYPES`:

```tsx
const CLOCK_RE = /^(\d{1,2}):([0-5]?\d)$/;

function FieldRow({
  label,
  value,
  onTap,
}: {
  label: string;
  value: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full min-h-[48px] px-3 py-2 flex items-center gap-3 text-left rounded-[2px] border border-rule hover:border-rule-strong hover:text-ink"
    >
      <span className="eyebrow text-[10px] text-ink-faint w-20 shrink-0">{label}</span>
      <span className="text-[14px] text-ink flex-1 truncate">{value}</span>
      <span className="eyebrow text-[10px] text-ink-faint shrink-0" aria-hidden>▸</span>
    </button>
  );
}

function EditEventSheet({
  game,
  event,
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
  event: EventRow;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  onCancel: () => void;
  onSubmit: (payload: EditPayload) => void;
}) {
  const isGoal = event.type === "goal";
  const eventTeamRoster = event.team_id === game.homeTeam.id ? homeRoster : awayRoster;
  const opposingRoster = event.team_id === game.homeTeam.id ? awayRoster : homeRoster;
  const teamLabel = event.team_id === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name;

  // Shared field state, seeded from the event.
  const [scorerId, setScorerId] = useState<string | null>(event.scorer_id);
  const [a1, setA1] = useState<string | null>(event.assist1_id);
  const [a2, setA2] = useState<string | null>(event.assist2_id);
  const [penaltyType, setPenaltyType] = useState<PenaltyType | null>(
    (event.penalty_type as PenaltyType | null) ?? null,
  );
  const [otherText, setOtherText] = useState(event.penalty_type_other ?? "");
  const [shotTakerId, setShotTakerId] = useState<string | null>(event.shooter_id);
  const [shotResult, setShotResult] = useState<"goal" | "saved" | null>(
    event.penalty_shot_result,
  );
  const [period, setPeriod] = useState<number>(event.period);
  const [clock, setClock] = useState<number>(event.clock_seconds);

  // Which field's picker is open; null = the field list.
  const [field, setField] = useState<
    null | "scorer" | "a1" | "a2" | "offender" | "type" | "shotTaker" | "period" | "time"
  >(null);
  const [clockText, setClockText] = useState(formatClock(event.clock_seconds));
  const [localError, setLocalError] = useState<string | null>(null);

  const nameOf = (roster: RosterPlayer[], id: string | null) =>
    (id && roster.find((p) => p.id === id)?.name) || "—";

  const canSave = isGoal
    ? !!scorerId
    : !!scorerId &&
      !!penaltyType &&
      (penaltyType !== "other" || otherText.trim().length > 0) &&
      !!shotTakerId &&
      !!shotResult;
  // Note: for a penalty the offender is stored/edited via `scorerId`.

  const commit = () => {
    if (isGoal) {
      onSubmit({
        type: "goal",
        scorerId: scorerId!,
        assist1Id: a1,
        assist2Id: a2,
        period,
        clockSeconds: clock,
      });
    } else {
      onSubmit({
        type: "penalty",
        offenderId: scorerId!,
        penaltyType: penaltyType!,
        penaltyTypeOther: penaltyType === "other" ? otherText.trim() : null,
        shotTakerId: shotTakerId!,
        shotResult: shotResult!,
        period,
        clockSeconds: clock,
      });
    }
  };

  const title = `Edit ${isGoal ? "Goal" : "Penalty"} · ${teamLabel}`;

  // Picker sub-views ---------------------------------------------------------
  if (field === "scorer" || field === "offender") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">{isGoal ? "Scorer" : "Offender"}</p>
        <PlayerGrid
          roster={eventTeamRoster}
          selectedId={scorerId}
          onPick={(id) => {
            setScorerId(id);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "a1" || field === "a2") {
    const isA1 = field === "a1";
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">{isA1 ? "Assist 1" : "Assist 2"}</p>
        <PlayerGrid
          roster={eventTeamRoster.filter(
            (p) => p.id !== scorerId && p.id !== (isA1 ? a2 : a1),
          )}
          selectedId={isA1 ? a1 : a2}
          allowDeselect
          onPick={(id) => {
            const cur = isA1 ? a1 : a2;
            const next = cur === id ? null : id;
            if (isA1) setA1(next);
            else setA2(next);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "shotTaker") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Shot taker</p>
        <PlayerGrid
          roster={opposingRoster}
          selectedId={shotTakerId}
          onPick={(id) => {
            setShotTakerId(id);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "type") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Penalty</p>
        <div className="grid grid-cols-2 gap-2">
          {PENALTY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPenaltyType(t);
                setField(null);
              }}
              aria-pressed={penaltyType === t}
              className={`min-h-[48px] eyebrow text-[11px] border rounded-[2px] ${
                penaltyType === t
                  ? "bg-board-3 border-ice text-ink"
                  : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
              }`}
            >
              {prettyPenalty(t)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (field === "period") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Period</p>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: game.period }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setField(null);
              }}
              aria-pressed={period === p}
              className={`min-h-[48px] font-display text-[13px] tracking-[0.12em] border rounded-[2px] ${
                period === p
                  ? "bg-board-3 border-ice text-ink"
                  : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
              }`}
            >
              {formatPeriod(p)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (field === "time") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Time (MM:SS)</p>
        <input
          type="text"
          autoFocus
          inputMode="numeric"
          value={clockText}
          onChange={(e) => setClockText(e.target.value)}
          className="w-full min-h-[44px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[16px] text-ink tabular-nums"
        />
        {localError && <p className="text-goal text-[12px]">{localError}</p>}
        <button
          type="button"
          onClick={() => {
            const m = clockText.match(CLOCK_RE);
            if (!m) {
              setLocalError("Use MM:SS format, e.g. 14:30");
              return;
            }
            const secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
            if (secs > 99 * 60) {
              setLocalError("Clock must be between 0:00 and 99:00");
              return;
            }
            setLocalError(null);
            setClock(secs);
            setField(null);
          }}
          className="w-full min-h-[48px] font-display text-[14px] tracking-[0.12em] rounded-[2px] bg-board-3 text-ink border border-rule-strong hover:border-ice"
        >
          Set time
        </button>
      </Sheet>
    );
  }

  // Field list ---------------------------------------------------------------
  return (
    <Sheet title={title} onCancel={onCancel}>
      <div className="space-y-1.5">
        {isGoal ? (
          <>
            <FieldRow label="Scorer" value={nameOf(eventTeamRoster, scorerId)} onTap={() => setField("scorer")} />
            <FieldRow label="Assist 1" value={nameOf(eventTeamRoster, a1)} onTap={() => setField("a1")} />
            <FieldRow label="Assist 2" value={nameOf(eventTeamRoster, a2)} onTap={() => setField("a2")} />
          </>
        ) : (
          <>
            <FieldRow label="Offender" value={nameOf(eventTeamRoster, scorerId)} onTap={() => setField("offender")} />
            <FieldRow
              label="Penalty"
              value={penaltyType ? (penaltyType === "other" ? otherText || "Other" : prettyPenalty(penaltyType)) : "—"}
              onTap={() => setField("type")}
            />
            {penaltyType === "other" && (
              <input
                type="text"
                placeholder="Describe penalty"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className="w-full min-h-[44px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
              />
            )}
            <FieldRow label="Shot taker" value={nameOf(opposingRoster, shotTakerId)} onTap={() => setField("shotTaker")} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShotResult("goal")}
                aria-pressed={shotResult === "goal"}
                className={`min-h-[48px] font-display text-[14px] tracking-[0.14em] rounded-[2px] border ${
                  shotResult === "goal" ? "bg-goal text-board border-goal" : "border-rule text-ink-dim"
                }`}
              >
                GOAL
              </button>
              <button
                type="button"
                onClick={() => setShotResult("saved")}
                aria-pressed={shotResult === "saved"}
                className={`min-h-[48px] font-display text-[14px] tracking-[0.14em] rounded-[2px] border ${
                  shotResult === "saved" ? "bg-ice text-board border-ice" : "border-rule text-ink-dim"
                }`}
              >
                SAVED
              </button>
            </div>
          </>
        )}
        <FieldRow label="Period" value={formatPeriod(period)} onTap={() => setField("period")} />
        <FieldRow label="Time" value={formatClock(clock)} onTap={() => { setClockText(formatClock(clock)); setLocalError(null); setField("time"); }} />
      </div>
      <button
        type="button"
        disabled={!canSave}
        onClick={commit}
        className={`w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] border ${
          canSave ? "bg-ice text-board border-ice" : "bg-board-3 text-ink-faint border-rule cursor-not-allowed"
        }`}
      >
        SAVE CHANGES
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 3: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors. (`EditEventSheet` is defined but not yet used — it is wired in Task 4. If lint flags it as unused, proceed to Task 4 in the same commit rather than committing a dead component; see Step 4.)

- [ ] **Step 4: Commit**

```bash
git add components/LiveScoring.tsx
git commit -m "feat(score): add EditEventSheet field-list editor"
```

If `bun run lint` errors on `EditEventSheet` being unused, skip this commit and fold it into Task 4's commit instead.

---

### Task 4: Wire up the event action menu (Edit / Undo)

**Files:**
- Modify: `components/LiveScoring.tsx` (sheet state union, `EventsList` prop, event menu + edit sheet rendering, hint text)

**Interfaces:**
- Consumes: `editEvent`, `EditPayload` (Task 2), `EditEventSheet` (Task 3), existing `onUndoSpecific`, `Sheet`.
- Produces: full user-facing feature. Terminal task.

- [ ] **Step 1: Extend the `sheet` state union**

In `LiveScoring`, the `useState` for `sheet` currently allows goal/penalty/advance/finalize. Replace its type with:

```tsx
  const [sheet, setSheet] = useState<
    | null
    | { kind: "goal"; teamId: string }
    | { kind: "penalty"; teamId: string }
    | { kind: "advance" }
    | { kind: "finalize" }
    | { kind: "eventMenu"; event: EventRow }
    | { kind: "editEvent"; event: EventRow }
  >(null);
```

- [ ] **Step 2: Point the events list at a menu instead of undo**

`EventsList` currently takes `onUndo: (id: string) => void` and calls it on row tap. Change the prop to `onSelect: (event: EventRow) => void`, update the row `onClick` to `() => onSelect(e)`, and change both "tap to undo" hint spans to `tap to edit or undo`.

In the `EventsList` signature, rename the prop:

```tsx
function EventsList({
  events,
  homeTeam,
  awayTeam,
  onSelect,
  disabled,
}: {
  events: EventRow[];
  homeTeam: Team;
  awayTeam: Team;
  onSelect: (event: EventRow) => void;
  disabled: boolean;
}) {
```

Update the row button handler inside the `events.map`:

```tsx
                onClick={() => onSelect(e)}
```

Update both hint spans (the empty-state one and the populated one) from `tap to undo` to `tap to edit or undo`.

- [ ] **Step 3: Update the `<EventsList>` usage in `LiveScoring`**

Replace the `onUndo={onUndoSpecific}` prop with:

```tsx
      <EventsList
        events={events}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        onSelect={(event) => setSheet({ kind: "eventMenu", event })}
        disabled={pending}
      />
```

- [ ] **Step 4: Render the event action menu + edit sheet**

Add these two blocks alongside the other `sheet?.kind === …` blocks (e.g. right after the `finalize` block, before the closing `</div>`):

```tsx
      {sheet?.kind === "eventMenu" && (
        <Sheet
          title={`${sheet.event.type === "goal" ? "Goal" : "Penalty"} · ${sheet.event.scorer_name ?? ""}`}
          onCancel={() => setSheet(null)}
        >
          <button
            type="button"
            onClick={() => setSheet({ kind: "editEvent", event: sheet.event })}
            className="w-full min-h-[52px] font-display text-[16px] tracking-[0.12em] rounded-[2px] border bg-board-3 text-ice border-ice/40 hover:border-ice"
          >
            EDIT
          </button>
          <button
            type="button"
            onClick={() => {
              const id = sheet.event.id;
              setSheet(null);
              onUndoSpecific(id);
            }}
            className="w-full min-h-[52px] font-display text-[16px] tracking-[0.12em] rounded-[2px] border bg-board-3 text-goal border-goal/40 hover:border-goal"
          >
            UNDO
          </button>
        </Sheet>
      )}

      {sheet?.kind === "editEvent" && (
        <EditEventSheet
          game={game}
          event={sheet.event}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            const eventId = sheet.event.id;
            setSheet(null);
            run(() => editEvent({ gameId: game.id, eventId, ...payload }));
          }}
        />
      )}
```

- [ ] **Step 5: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors. If `onUndoSpecific` is now flagged unused, it is not — it is called from the menu's UNDO button.

- [ ] **Step 6: Manual verification (local)**

Start the stack + dev server (see `docs/LOCAL-TESTING.md`), sign in as `admin@moth.test`, open a **live** game under `/score`. Verify:

1. Tap a goal → menu shows **EDIT** / **UNDO**. **EDIT** → change scorer → **SAVE CHANGES** → the event row and `/games/[id]` boxscore show the new scorer; the score is unchanged.
2. Record a penalty with shot result **GOAL** → tap → EDIT → set result **SAVED** → SAVE → the shooting team's score drops by 1.
3. Edit that penalty **SAVED → GOAL** → shooting team's score rises by 1.
4. Edit an event's **Period** and **Time** → reflected in the log; no score change.
5. Tap an event → **UNDO** → deletes it and reverses score exactly as before.
6. Check at ≤390px width: rows and buttons are ≥44px and there's no horizontal scroll.

- [ ] **Step 7: Commit**

```bash
git add components/LiveScoring.tsx
git commit -m "feat(score): tap an event to edit or undo it"
```

---

## Self-Review

**Spec coverage:**
- Interaction menu (Edit/Undo) → Task 4. ✅
- Field-list edit sheet (goal + penalty fields) → Task 3. ✅
- `editEvent` action + score reconciliation (penalty shot-result flip only) → Task 2. ✅
- Event IDs plumbed to client → Task 1. ✅
- Live-only gate → `ensureLiveAccess` in Task 2. ✅
- Team side not editable → rosters derived from `event.team_id`; no team picker. ✅
- Period `1…current` + `MM:SS` clock validation → Task 3 (`period` picker bounded by `game.period`; `CLOCK_RE`) and Task 2 (server clamp). ✅
- Manual testing → Task 4 Step 6. ✅

**Placeholder scan:** none — all steps contain full code.

**Type consistency:** `EditPayload` (Task 2) is imported and produced by `EditEventSheet.onSubmit` (Task 3) and spread into `editEvent` (Task 4). `EventRow` id fields (Task 1) are read by `EditEventSheet` (Task 3). `onSelect`/`eventMenu`/`editEvent` sheet kinds are consistent across Task 4. Penalty offender is intentionally stored/edited via `scorer_id`/`scorerId`, matching the existing `scorer:player_id` query alias and `recordPenalty`'s `player_id = offender` convention.
