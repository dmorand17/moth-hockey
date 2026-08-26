# Edit or Undo a Scoring Event — Design

**Date:** 2026-08-26
**Status:** Approved, pending implementation

## Problem

During live scoring, the events log (`components/LiveScoring.tsx` → `EventsList`)
renders each goal/penalty as a single button whose only action is **undo**
(delete the event and reverse any score change) behind a confirm dialog. A
scorekeeper who picks the wrong player, penalty type, shot result, or time has
no way to correct it except deleting the event and re-entering it from scratch.

## Goal

Tapping an event offers a choice: **Edit** it or **Undo** it. Editing lets the
scorekeeper fix the details of an existing event in place.

## Scope

**In scope**
- Editable fields:
  - **Goal:** scorer, assist 1, assist 2, period, clock time.
  - **Penalty:** offender, penalty type (+ "other" text), penalty-shot taker,
    shot result (goal/saved), period, clock time.
- **Live games only** — same gate as undo today. Editing events on a finalized
  game is out of scope (would require recomputing final score, `decided_in`,
  standings, and stats).

**Out of scope**
- Changing an event's **team side** (moving a goal/penalty to the other team).
  Excluded by decision; this keeps score reconciliation simple.
- Editing final/scheduled games.
- Adding new event types.

## Design

### 1. Interaction — event action menu

In `EventsList`, tapping an event row no longer calls undo directly. It opens a
small action sheet (reusing the existing `Sheet` component) titled with the
event summary, offering:

- **Edit** → opens the edit sheet.
- **Undo** (destructive styling) → the current behavior: confirm → `undoEvent`.
- **Cancel**.

The list hint text changes from "tap to undo" to "tap to edit or undo".

New sheet states in `LiveScoring`:
- `{ kind: "eventMenu"; event: EventRow }`
- `{ kind: "editEvent"; event: EventRow }`

### 2. Edit sheet — `components/EditEventSheet.tsx` (new file)

A field-list sheet. Each editable field is a tappable row showing its current
value; tapping a row swaps the sheet body to the relevant picker, then returns
to the field list. A **SAVE CHANGES** button submits.

Rows by event type:

| Goal            | Penalty                              |
| --------------- | ------------------------------------ |
| Scorer          | Offender                             |
| Assist 1        | Penalty type (+ "Other" text row)    |
| Assist 2        | Shot taker                           |
| Period          | Result (GOAL / SAVED)                |
| Time (MM:SS)    | Period                               |
|                 | Time (MM:SS)                         |

- Player pickers reuse `PlayerGrid`; the penalty-type grid and GOAL/SAVED toggle
  reuse the markup from `PenaltySheet`.
- **Team side is fixed**, so rosters are derived from the event's `team_id`:
  - Goal: scorer + assists come from the scoring team's roster.
  - Penalty: offender from the committing team; shot taker from the opposing team.
- **Period**: selector limited to `1…current period`.
- **Time**: `MM:SS` input reusing the existing clock regex/validation
  (`/^(\d{1,2}):([0-5]?\d)$/`, clamped `0–99:00`).

Kept in its own file rather than growing the already-1279-line
`LiveScoring.tsx`. The small `eventMenu` sheet stays inline in `LiveScoring`.

### 3. Server action — `editEvent` (`app/score/[gameId]/actions.ts`)

Mirrors `recordGoal` / `recordPenalty` validation behind `ensureLiveAccess`
(live-only; `admin` or `scorekeeper`). Accepts a discriminated payload plus the
event id:

```ts
editEvent(input:
  | { gameId; eventId; type: "goal";
      scorerId; assist1Id?; assist2Id?; period; clockSeconds }
  | { gameId; eventId; type: "penalty";
      offenderId; penaltyType; penaltyTypeOther?;
      shotTakerId; shotResult; period; clockSeconds }
): Promise<ActionResult>
```

Steps:
1. `ensureLiveAccess(gameId)`.
2. Fetch the existing event (need `type`, `team_id`, `penalty_shot_result`).
   Reject if not found or `game_id` mismatch. Reject if the payload `type`
   differs from the stored event type (event type is not editable).
3. Validate the same way as the record actions: scorer/offender required,
   penalty type in `PENALTY_TYPES`, "other" requires text, clock/period clamped.
4. Update the `game_events` row with the new field values.
5. **Score reconciliation:**
   - **Goal:** no score change (team fixed; scorer/assist are stats-only).
   - **Penalty:** `delta = (newResult === "goal" ? 1 : 0) − (oldResult === "goal" ? 1 : 0)`,
     applied to the **shooting team** (the team opposite the unchanged
     committing `team_id`), clamped `≥ 0`.
6. `revalidatePath` for `/score/[gameId]` and `/games/[gameId]`.

### 4. Data plumbing — expose event IDs to the client

Events currently reach the client as names only (`scorer_name`, `assist1_name`,
…). The edit sheet needs current IDs to pre-select pickers. Extend the event
mapping in `app/score/[gameId]/page.tsx` (`LiveView`) and the `EventRow` type in
`LiveScoring.tsx` to also carry:

- `scorer_id` (goal scorer / penalty offender — the `player_id` column)
- `assist1_id`, `assist2_id`
- `shooter_id` (penalty-shot taker)

`penalty_type`, `penalty_type_other`, `penalty_shot_result`, `team_id`,
`period`, and `clock_seconds` are already present.

## Error handling

- All server validation returns `{ ok: false, error }`, surfaced by the existing
  `run()` error banner in `LiveScoring`.
- Non-live game → "Game is {status}; not editable." (existing `ensureLiveAccess`).
- Event not found / type mismatch → explicit error.
- Invalid time format → inline "Use MM:SS format" message (client), plus server
  clamp as defence in depth.

## Testing

No test runner is configured in this repo. Verification is manual on the local
scorekeeper flow (`/score/[gameId]` as `admin@moth.test`), plus `bunx tsc
--noEmit` and `bun run lint`:

1. Record a goal → tap it → **Edit** → change scorer → SAVE → event + boxscore
   reflect the new scorer; score unchanged.
2. Record a penalty with shot result **GOAL** → Edit → change result to
   **SAVED** → SAVE → shooting team's score drops by 1.
3. Edit a penalty **SAVED → GOAL** → shooting team's score rises by 1.
4. Edit an event's period/time → reflected in the log; no score change.
5. Tap an event → **Undo** → behaves exactly as today (delete + score reversal).
6. Confirm the flow works at mobile width (≤390px, tap targets ≥44px).

## Files touched

- `components/LiveScoring.tsx` — event action menu, hint text, wire up
  `editEvent`, extend `EventRow` with IDs.
- `components/EditEventSheet.tsx` — **new** field-list edit sheet.
- `app/score/[gameId]/actions.ts` — **new** `editEvent` server action.
- `app/score/[gameId]/page.tsx` — include event player IDs in the mapped events.
