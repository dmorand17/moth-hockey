# App-wide save-without-refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every server-action `<form>` in the app saves in place (no navigation, accordions stay open, scroll preserved) with a sonner toast for success/failure.

**Architecture:** A shared client `ActionForm` submits through React 19 `useActionState` (a transition), so `revalidatePath` in the action refreshes the RSC tree in place instead of navigating. Actions return an `ActionResult` (`{ok, message?}` / `{ok:false, error}`) instead of `redirect`/`back()`. A `SubmitButton` shows pending via `useFormStatus`. One `<Toaster/>` in the root layout. Auth flows keep redirecting.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), React 19, sonner, bun.

## Global Constraints

- Package manager **bun** (`bunx`, `bun add`). **No test runner** — verify each task with `bunx tsc --noEmit` (0 errors) and `bun run lint` (no NEW warnings beyond the two pre-existing in `app/admin/schedule/page.tsx`).
- **Every task leaves the build green.**
- Server actions gate mutations with `requireRole([...])` / auth checks exactly as today — do not change authorization.
- **Auth actions keep `redirect`** and are OUT OF SCOPE: `app/login/actions.ts` (`requestLoginLink`), `app/signup/actions.ts` (`requestSignupLink`), `app/account/actions.ts#signOut`, and the route handlers `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`. Their pages (`login`, `signup`) keep their current `?error=`/`?sent=` handling.
- Do NOT change what any action *does* — only how its result is delivered (return value vs redirect) and keep every existing `revalidatePath(...)`.
- Spec: `docs/superpowers/specs/2026-08-28-no-refresh-saves-design.md`.
- Branch `feat/no-refresh-saves` (rebased on `staging` after #92).

## Conversion Recipe (referenced by Tasks 2–6)

Each page-group task applies this mechanical recipe. Read it once; each task lists its exact files, actions, and message strings.

**A. Actions module (`actions.ts`)** — for each in-scope action currently typed `(...)=>Promise<void>`/`never` that ends in `redirect`/`back`:
1. Change return type to `Promise<ActionResult>`; add `import { ok, fail, type ActionResult } from "@/lib/action-result";`.
2. Replace the local `function back(qs): never { redirect(...) }` helper's call sites: every `back("error=CODE")` → `return fail("<the human text CODE maps to in the page's current ERROR_MESSAGES>")`; every terminal `redirect("...?saved=KEY")` → `return ok("<the page's current flash text for KEY>")`. Keep all `revalidatePath(...)` lines immediately before the `return ok(...)`. Delete the now-unused `back` helper and the `redirect` import **iff** no in-scope path still uses them (auth-style `redirect("/login")` guards may remain — keep the import then).
3. Guard clauses that were `if (!x) back("error=…")` become `if (!x) return fail("…")` (early return, not throw).

**B. Page (`page.tsx`)** — for each converted `<form>`:
1. `import { ActionForm } from "@/components/ActionForm";` and `import { SubmitButton } from "@/components/SubmitButton";`.
2. `<form action={someAction} className=...>` → `<ActionForm action={someAction} className=...>` (same className/children). Add `resetOnSuccess` to **create** forms (so inputs clear after add, matching the old post-redirect fresh form).
3. Replace the raw submit `<button type="submit" ...>Label</button>` with `<SubmitButton className={...}>Label</SubmitButton>` (SubmitButton renders a `type="submit"` button; pass the same className and any `disabled` expression via the `disabled` prop — SubmitButton ORs it with pending).
4. Remove the URL-flash plumbing: delete the `searchParams` read for `saved`/`error`, the `ERROR_MESSAGES` const, and the flash `<p>`/banner JSX. Leave unrelated `searchParams` usage (e.g. filters) intact.

**C. Object-input actions already returning `{ok,error}`** (called from client editors via `useTransition`, not `<form action>`): only change is that their client callers fire a toast on the result (see Task 6). The action bodies are unchanged except adopting the shared `ActionResult` type where they declare a local one.

---

### Task 1: Foundation — result type, ActionForm, SubmitButton, Toaster

**Files:** create `lib/action-result.ts`, `components/ActionForm.tsx`, `components/SubmitButton.tsx`; modify `app/layout.tsx`, `app/score/[gameId]/actions.ts`; add `sonner`.

**Interfaces (produces):**
- `lib/action-result.ts`: `type ActionResult = {ok:true;message?:string} | {ok:false;error:string}`, `ok(message?)`, `fail(error)`.
- `components/ActionForm.tsx`: `<ActionForm action={(fd:FormData)=>Promise<ActionResult>} resetOnSuccess?={boolean} successToast?={string} {...formProps}>`.
- `components/SubmitButton.tsx`: `<SubmitButton disabled?={boolean} pendingLabel?={string} {...buttonProps}>`.

- [ ] **Step 1: Add sonner**
```bash
bun add sonner
```
Confirm it lands in `dependencies` and does not disturb the `trustedDependencies`/`ignoreScripts` arrangement in `package.json`.

- [ ] **Step 2: `lib/action-result.ts`**
```ts
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export const ok = (message?: string): ActionResult => ({ ok: true, message });
export const fail = (error: string): ActionResult => ({ ok: false, error });
```

- [ ] **Step 3: `components/SubmitButton.tsx`**
```tsx
"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  disabled,
  pendingLabel,
  className,
  ...rest
}: {
  children: ReactNode;
  disabled?: boolean;
  pendingLabel?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={className}
      {...rest}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
```

- [ ] **Step 4: `components/ActionForm.tsx`**
```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  resetOnSuccess?: boolean;
  successToast?: string; // overrides result.message on success
  children: React.ReactNode;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">;

export function ActionForm({
  action,
  resetOnSuccess,
  successToast,
  children,
  ...formProps
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  // useActionState needs (prevState, formData); adapt our (formData) action.
  const [result, formAction] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => action(fd),
    null,
  );

  useEffect(() => {
    if (!result) return; // skip initial
    if (result.ok) {
      toast.success(successToast ?? result.message ?? "Saved");
      if (resetOnSuccess) formRef.current?.reset();
    } else {
      toast.error(result.error);
    }
  }, [result, resetOnSuccess, successToast]);

  return (
    <form ref={formRef} action={formAction} {...formProps}>
      {children}
    </form>
  );
}
```
Note: `result` is a fresh object per submit, so the effect fires on every completion (identical consecutive messages still re-toast).

- [ ] **Step 5: Mount `<Toaster/>` in `app/layout.tsx`.** Add `import { Toaster } from "sonner";` and render `<Toaster richColors position="top-right" theme="dark" />` just before `</body>` (inside the existing body, after `{children}`). Do not otherwise restructure the layout.

- [ ] **Step 6: Unify the score `ActionResult`.** In `app/score/[gameId]/actions.ts`, delete the local `export type ActionResult = ...` (line ~10) and instead `import { type ActionResult } from "@/lib/action-result";`. Its existing `{ ok: true }` and `{ ok: false, error }` returns remain valid. Update any file that imported `ActionResult` **from** the score actions module to import from `@/lib/action-result` (grep `from "@/app/score` / relative imports of that type; `bunx tsc` will flag any).

- [ ] **Step 7: Verify + commit**
`bunx tsc --noEmit && bun run lint`, then:
```bash
git add package.json bun.lock lib/action-result.ts components/ActionForm.tsx components/SubmitButton.tsx app/layout.tsx "app/score/[gameId]/actions.ts"
git commit -m "feat(ui): ActionForm + SubmitButton + sonner Toaster; shared ActionResult"
```

---

### Task 2: Convert `app/admin/seasons` (the accordion page)

**Files:** `app/admin/seasons/actions.ts`, `app/admin/seasons/page.tsx`.

Apply the Conversion Recipe. In-scope actions (all currently `back`/`redirect`): `createSeason` (resetOnSuccess form), `copyTeamsInto`, `updateSeasonDates`, `activateSeason`, `deleteSeason`, `resetSeason`, `generateSchedule`, `generatePlayoffs`, `updateStandingsRules`, `createTeam` (resetOnSuccess), `updateTeam`, `assignTeamCaptain`. Use the exact human strings from the page's current `ERROR_MESSAGES` map (e.g. `not_enough_teams` → "Need at least 2 teams in this season to generate a schedule.", `need_end` → "Set the number of regular season weeks.", `cannot_delete_current`, `has_games`, `regular_incomplete`, `not_enough_seeds`, `invalid_color`, `already_rostered`, `no_source_teams`, `teams_exist`) and the current flash strings for each `saved=` key (e.g. `generated` → `Generated {n} games.` — for the generated count, return `ok(\`Generated ${rows.length} games.\`)` from the action; `activated` → "Season activated.", `dates` → "Dates updated.", `rules` → "Standings rules updated.", `created` → "Season created.", `deleted` → "Season deleted.", `reset` → "Season reset — all games and results cleared.", `playoffs` → "Playoffs generated / advanced.", team keys → "Team created."/"Team updated."/"Captain updated.", roster keys → "Added."/"Roster updated.").

- [ ] **Step 1:** Convert `actions.ts` per Recipe A. `generateSchedule` returns `ok(\`Generated ${rows.length} games.\`)`. Keep every `revalidatePath`/`revalidatePublicSeasonPaths()`. Note `ResetSeasonButton.tsx` and `StandingsRulesEditor.tsx` are client components that call `resetSeason`/`updateStandingsRules` — update them in Step 3.
- [ ] **Step 2:** Convert `page.tsx` per Recipe B for every `<form action={...}>` in the season card and the create form. Delete the `saved`/`error`/`n` `searchParams` read, the whole `flash`/`ERROR_MESSAGES` blocks, and their JSX banners. Keep the `params` type only if still needed for something else (it isn't — remove `SearchParams` usage).
- [ ] **Step 3:** `app/admin/seasons/ResetSeasonButton.tsx` and `StandingsRulesEditor.tsx`: these already call actions from a client component — if they use `<form action>`, switch to `ActionForm`; if they call the action imperatively in a transition, toast the returned `ActionResult` (`res.ok ? toast.success(res.message ?? "Saved") : toast.error(res.error)`), importing `toast` from sonner. Match whichever pattern each file uses.
- [ ] **Step 4: Verify + manual check + commit.** `bunx tsc --noEmit && bun run lint`. Manual (local, stack running): edit dates / standings rules / a roster / generate a schedule → no reload, the section stays expanded, a toast appears, data updates; force an error (duplicate team name) → error toast, inputs preserved.
```bash
git add app/admin/seasons
git commit -m "feat(seasons): no-refresh saves with toasts"
```

---

### Task 3: Convert `app/admin/schedule`

**Files:** `app/admin/schedule/actions.ts`, `app/admin/schedule/page.tsx`.

Apply the Conversion Recipe. In-scope actions: `createGame` (resetOnSuccess), `updateGame`, `deleteGame`, `skipWeek` (resetOnSuccess), plus any generate/unskip actions in the module (convert all that `back`/`redirect`). Use the page's existing `ERROR_MESSAGES` strings (`no_season`, `invalid_input`, `same_team`, `already_skipped`, …) and `saved=` flash strings (`created`/`updated`/`deleted`/skip messages).

- [ ] **Step 1:** Convert `actions.ts` per Recipe A.
- [ ] **Step 2:** Convert `page.tsx` per Recipe B; remove its flash plumbing. Preserve the two pre-existing lint warnings' code as-is (don't touch unrelated unused vars).
- [ ] **Step 3: Verify + commit.** `bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/schedule
git commit -m "feat(schedule): no-refresh saves with toasts"
```

---

### Task 4: Convert `app/admin/players` + `app/admin/rosters`

**Files:** `app/admin/players/actions.ts`, `app/admin/players/page.tsx`, `app/admin/players/PlayerFilters.tsx`, `app/admin/players/NeedsLinkingEditor.tsx`, `app/admin/rosters/actions.ts`.

- [ ] **Step 1:** `players/actions.ts` — convert the FormData actions `createPlayer` (resetOnSuccess) and `updatePlayer` per Recipe A (strings from the players page `ERROR_MESSAGES`/flash: `created` → "Player created.", `updated` → "Player updated."). Leave the object-input actions `linkAccounts`/`deletePlayer` (already `{ok,error}`) as-is except aligning to the shared `ActionResult` type import.
- [ ] **Step 2:** `players/page.tsx` — convert its `<form action>` create/update forms per Recipe B; remove flash plumbing.
- [ ] **Step 3:** `PlayerFilters.tsx` and `NeedsLinkingEditor.tsx` (client, `useTransition`) — on each action result, toast (`res.ok ? toast.success(res.message ?? "Saved") : toast.error(res.error)`). Keep their inline behavior otherwise.
- [ ] **Step 4:** `rosters/actions.ts` — convert `addToRoster` (resetOnSuccess where used as a form) and `updateRosterEntry` per Recipe A (they `redirect("/admin/seasons?...")`; return `ok("Added.")`/`ok("Roster updated.")` and keep the `revalidatePath` calls). `saveRosterChanges` (object-input, already `{ok,error}`) — align type import; its client caller `RosterEditor` gets toasts in Task 6. **Note:** these forms render inside the seasons page / RosterEditor; ensure Task 2's page edits and this task don't both edit the same `<form>` (rosters forms live in `RosterEditor.tsx`, handled Task 6).
- [ ] **Step 5: Verify + commit.** `bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/players app/admin/rosters
git commit -m "feat(players/rosters): no-refresh saves with toasts"
```

---

### Task 5: Convert `app/admin/users` + `app/admin/content`

**Files:** `app/admin/users/actions.ts`, `app/admin/users/page.tsx`, `app/admin/content/actions.ts`, `app/admin/content/page.tsx`.

Apply the Conversion Recipe.
- [ ] **Step 1:** `users/actions.ts` — `updateUserRole` → `ActionResult` (`saved=role` → "Role updated."; `invalid_input` → the page's text). `users/page.tsx` — convert the role `<form action={updateUserRole}>` and remove flash plumbing.
- [ ] **Step 2:** `content/actions.ts` — `createContentPage` (resetOnSuccess), `updateContentPage`, `deleteContentPage` per Recipe A (`created`/`updated`/`deleted` flash text; `invalid_input`). `content/page.tsx` — convert forms, remove flash plumbing.
- [ ] **Step 3: Verify + commit.** `bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/users app/admin/content
git commit -m "feat(users/content): no-refresh saves with toasts"
```

---

### Task 6: Convert `app/account` profile + align live/check-in editors

**Files:** `app/account/actions.ts`, `app/account/page.tsx`, `components/LiveScoring.tsx`, `components/CheckInToggle.tsx`, `components/RosterCheckIn.tsx`, `app/admin/seasons/RosterEditor.tsx`.

- [ ] **Step 1:** `account/actions.ts` — convert `updateProfile` per Recipe A: keep the `if (!userData.user) redirect("/login")` guard (auth), but replace `redirect("/account?error=…")` → `return fail(error.message)` and `redirect("/account?saved=1")` → `return ok("Profile updated.")`, keeping `revalidatePath("/account")`. **Do not touch `signOut`** (keeps `redirect`). `setAvailability` is already `{ok,error}` — align type import only.
- [ ] **Step 2:** `account/page.tsx` — convert the profile `<form action={updateProfile}>` to `ActionForm` + `SubmitButton`; remove its `?saved=1`/`?error=` flash reading. Leave sign-out (navigational) as a plain form/button.
- [ ] **Step 3:** Client editors that call object-input actions in a `useTransition` and currently surface errors via local state — add sonner toasts on the result and, where it improves feedback, keep or remove the inline error text (prefer toast, but do not rip out inline validation that guides the user mid-flow). Files: `LiveScoring.tsx` (score actions), `CheckInToggle.tsx` + `RosterCheckIn.tsx` (`setAvailability`/check-in), `RosterEditor.tsx` (`saveRosterChanges`). Import `toast` from sonner; on `res.ok` → `toast.success(res.message ?? "Saved")`, else `toast.error(res.error)`. Keep their existing pending/optimistic UI.
- [ ] **Step 4: Verify + manual check + commit.** `bunx tsc --noEmit && bun run lint`. Manual: update profile → toast, no reload; toggle check-in and score a game → toasts on success/error; sign out still navigates. Then:
```bash
git add app/account components/LiveScoring.tsx components/CheckInToggle.tsx components/RosterCheckIn.tsx app/admin/seasons/RosterEditor.tsx
git commit -m "feat(account/live): no-refresh profile save; unified toasts"
```

---

## Self-Review

- **Spec coverage:** shared primitives + Toaster + unified `ActionResult` (T1) ✅; actions return results & keep `revalidatePath`, pages drop URL-flash (T2–T6) ✅; create/delete/activate stay put + toast (T2, T4, T5) ✅; auth keeps redirect (excluded in Global Constraints, T6 keeps `signOut`/guards) ✅; already-inline editors get consistent toasts (T4, T6) ✅; non-optimistic (SubmitButton pending; no optimistic added) ✅.
- **Build-green ordering:** T1 lands the primitives + type unification first; each later task converts one page-group and commits green. `score/[gameId]/actions.ts` type unification is in T1 so its many consumers compile before T6 touches `LiveScoring`.
- **Type consistency:** `ActionResult`/`ok`/`fail` defined in T1 and imported everywhere; failure field is `error` (matches existing code), success adds optional `message`. `ActionForm`/`SubmitButton` prop names match usage in the recipe.
- **Placeholder scan:** the per-action human strings are specified as "the exact strings already in each page's current `ERROR_MESSAGES`/flash map" — those strings live in the files the implementer edits; key ones are enumerated inline in T2/T3. No invented copy.
- **Out-of-scope guarded:** login/signup/callback/confirm and `signOut` explicitly excluded so no auth flow loses its redirect.
