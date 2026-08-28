# App-wide save-without-refresh

**Date:** 2026-08-28
**Status:** Approved design
**Branch:** `feat/no-refresh-saves` (off `staging`)

## Context

Every mutation in the app is a `<form action={serverAction}>` whose action ends
in `redirect(...)` (success) or a `back("error=…")` redirect (failure). That
redirect triggers a full-page navigation: the RSC tree is rebuilt from scratch,
so expanded `<details>` accordions collapse, scroll position resets, and there's
a visible reload flash. Feedback is passed through URL query params
(`?saved=…` / `?error=…`) that the page reads on the next render to show a
flash banner.

Goal: mutations save **in place** — no navigation, accordions stay open, scroll
preserved — with a toast for success/failure. Applies **app-wide** (admin +
public), one consistent pattern at every `action={}` site.

## Key insight — why accordions survive

`revalidatePath(...)` called inside a server action does **not** navigate. When
the form submit runs through a React transition (via `useActionState`), the
revalidated RSC payload is reconciled into the existing DOM in place. Native
`<details open>` state is DOM state on elements that are **not remounted** by
that reconciliation, so open sections stay open. A `redirect(...)` rebuilds the
route from scratch and loses it. So the fix is: **stop redirecting, keep
revalidating, submit through a transition.**

## Architecture

### 1. Shared submit primitives (new, in `components/`)

- **`ActionForm.tsx`** (client) — wraps `<form>`. Drives submission through
  React 19 `useActionState(action, initialState)` (which runs the action inside
  a transition). The action returns an `ActionResult`; when a result arrives,
  `ActionForm` fires a sonner toast (`toast.success` / `toast.error`) with the
  result message. Props: same as `<form>` plus `action` (the server action) and
  optional `onResult`/`successToast` overrides. Children render normally
  (inputs, `SubmitButton`).
- **`SubmitButton.tsx`** (client) — a submit `<button>` that reads
  `useFormStatus()` to disable itself and show a pending label
  (e.g. "Saving…") while the action runs. Replaces raw submit buttons inside
  `ActionForm`.
- **`<Toaster />`** (sonner) mounted once in the root layout
  (`app/layout.tsx`), top-right, dark theme to match the app.

### 2. Result contract (`lib/action-result.ts`)

An `ActionResult` type already exists locally in
`app/score/[gameId]/actions.ts` (`{ ok: true } | { ok: false; error: string }`)
and its shape is mirrored by the object-input actions in `account`, `players`,
and `rosters`. To unify rather than fork, the shared type keeps the existing
failure field (`error`) and **adds an optional success `message`** for toasts —
backward-compatible with every existing return:

```ts
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export const ok = (message?: string): ActionResult => ({ ok: true, message });
export const fail = (error: string): ActionResult => ({ ok: false, error });
```

The local definition in `score/[gameId]/actions.ts` is removed and replaced
with an import from `lib/action-result.ts`; existing `{ ok: true }` /
`{ ok: false, error }` returns satisfy it unchanged. The FormData actions being
converted change their return type from `Promise<void>`/`never` to
`Promise<ActionResult>`.

`ActionForm` toasts `result.message` on success (falling back to a generic
"Saved") and `result.error` on failure.

### 3. Server-action refactor

For every **in-place** and **create/delete/activate** action across the app:

- Replace `redirect("/…?saved=…")` → `return ok("Season activated.")`.
- Replace `back("error=code")` / `redirect("…?error=…")` → `return fail("…")`
  with the human-readable message (see §4).
- **Keep** all `revalidatePath(...)` calls — that's what refreshes the data in
  place.
- Guard clauses that used `back(...)` (a `never`-returning throw) become
  `return fail(...)`; adjust control flow accordingly (early `return`, not
  fall-through).

**Auth actions keep `redirect`** — sign in, sign out, and the magic-link
callback must navigate; they are out of scope for the no-refresh treatment.

Create/delete/activate **stay on the page** and toast (per approved scope):
after `createTeam`/`deleteSeason`/`activateSeason`, `revalidatePath` refreshes
the list in place; no navigation to a new URL.

### 4. Messages

Today's per-page maps that translate URL codes to text (e.g.
`ERROR_MESSAGES` in `app/admin/seasons/page.tsx`) move into a shared module so
actions return the human message directly (or a small shared code→message
helper the actions call). The old `?saved=…`/`?error=…` **URL-flash banners
are removed** — the page no longer reads `searchParams` for flashes, and the
inline flash `<p>` blocks are deleted. Toasts replace them entirely.

### 5. Feedback model

Non-optimistic. On submit: `SubmitButton` shows pending + disables; when the
action resolves, the revalidated data appears in place and a toast confirms
(success) or reports the error (failure, form inputs left intact). Optimistic
UI is explicitly **not** in scope; it can be layered onto individual forms
later where instant feedback is worth the per-form code.

### 6. Already-inline components

`RosterEditor`, `LiveScoring`, `CheckInToggle`, and the `PlayerFilters`/
`NeedsLinkingEditor` editors already avoid full reloads via `useTransition` +
direct action calls. Their interaction model stays; they are aligned to fire
the **same sonner toasts** on success/failure so feedback is consistent
app-wide. No behavior change beyond the toast.

## Scope of files (survey)

- ~120 `revalidatePath`/`redirect` call sites across `app/**/actions.ts`.
- Server-action modules to refactor (return `ActionResult`, drop redirects):
  `app/admin/seasons/actions.ts`, `app/admin/schedule/actions.ts`,
  `app/admin/players/actions.ts`, `app/admin/rosters/actions.ts`,
  `app/score/actions.ts` (and any others surfaced by grep), **except** the auth
  actions (`app/(auth)`/login/logout/callback).
- Pages that render server-action `<form>`s adopt `ActionForm` + `SubmitButton`
  and drop their URL-flash reading.
- New: `components/ActionForm.tsx`, `components/SubmitButton.tsx`,
  `lib/action-result.ts`; `sonner` dependency + `<Toaster/>` in `app/layout.tsx`.

## Rollout

Page group by page group (seasons → schedule → players/rosters → score →
public), each step leaving the build green (`bunx tsc --noEmit` clean,
`bun run lint` no new warnings). The shared primitives + `ActionResult` +
`<Toaster/>` land first so later groups just consume them.

## Non-goals

- Optimistic UI (deferred, per-form later).
- Auth navigation flows (sign in/out/callback keep redirecting).
- Changing what any action *does* — only how its result is delivered.
- Real-time/live-scoring behavior beyond adding toasts.

## Dependencies / merge note

- Adds `sonner` (via `bun add sonner`).
- Branch rebased onto `staging` **after** the playoff-rounds PR (#92) merged, so
  it already contains the current seasons files (qf1–qf4 playoffs, weeks-driven
  dates) — no outstanding conflict.

## Testing

No test runner. Manual on the local stack: for each converted form, submit and
confirm (a) no page reload / flash, (b) the relevant accordion stays open,
(c) a success toast appears and the data updates in place, (d) a forced error
(e.g. duplicate team name) shows an error toast with the inputs preserved.
Verify auth sign in/out still navigate.
