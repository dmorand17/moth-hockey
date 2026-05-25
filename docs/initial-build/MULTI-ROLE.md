# Multi-role users — design + migration plan

Captures the design for letting a single user hold multiple app roles at once. Not yet implemented.

Last updated: 2026-05-24

---

## Why

Today `user_roles.role` is a single enum column, so a user has exactly one role. In practice some league members wear multiple hats:

- A regular **player** who also keeps **score** when their team isn't on the ice.
- An **admin** who is also a rostered **player** (and may also keep score).
- A **team_captain** who occasionally fills in as a **scorekeeper**.

The single-role model forces a choice that doesn't reflect reality, and it fights the `team_captains` trigger (which has to remember whether to demote back to `player` vs leave a user as `admin`/`scorekeeper`). Multi-role removes that whole class of edge cases.

Note: `team_captain` is already a *derived* role driven by rows in `team_captains`. The trigger that flips `user_roles.role` only exists because `user_roles` is single-valued. Once roles are multi, the trigger gets simpler — it inserts/deletes a `team_captain` row in `user_roles` with no fallback logic needed.

---

## Design (Option A from the discussion)

`user_roles` becomes a true many-to-many between users and roles:

```sql
-- before
create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'player'
);

-- after
create table user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null,
  primary key (user_id, role)
);
```

A user can hold any combination of `player`, `scorekeeper`, `team_captain`, `admin`. Every signed-up user always has at least the `player` row.

### Helper functions

Replace the single-row helpers with a parameterized lookup:

```sql
create or replace function public.has_role(check_role public.user_role)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;
```

Existing convenience helpers stay, but each becomes a one-liner over `has_role()`:

- `is_admin()` → `select public.has_role('admin')`
- `is_scorekeeper_or_admin()` → `select public.has_role('scorekeeper') or public.has_role('admin')`
- `is_team_captain_or_admin()` → `select public.has_role('team_captain') or public.has_role('admin')`

Drop `current_user_role()` entirely — it has no meaning in a multi-role world. Audit for callers first; if any code uses it for display purposes, replace with an explicit "primary role for display" computation.

### App-side types

`lib/auth.ts`:

```ts
// before
export type AuthSession = { userId: string; email: string; role: Role | null };

// after
export type AuthSession = { userId: string; email: string; roles: Role[] };
```

`requireRole(allowed: Role[])` and `getSessionIfRole(allowed: Role[])` already accept arrays of allowed roles per route — they need to switch from `allowed.includes(session.role)` to `allowed.some((r) => session.roles.includes(r))`. Behavior for callers is unchanged.

Add a small helper:

```ts
export function hasRole(session: AuthSession | null, role: Role): boolean {
  return !!session && session.roles.includes(role);
}
```

### Header / nav

`app/layout.tsx` currently picks one extra link based on `session.role`. Convert to additive checks:

```ts
const authLinks = session
  ? [
      ...(hasRole(session, "admin")        ? [{ href: "/admin/users",       label: "Admin" }]    : []),
      ...(hasRole(session, "team_captain") ? [{ href: "/captains/contacts", label: "Captains" }] : []),
      ...(hasRole(session, "admin") || hasRole(session, "scorekeeper")
        ? [{ href: "/score", label: "Score" }] : []),
      { href: "/account", label: "Account" },
    ]
  : [{ href: "/login", label: "Log in" }];
```

A user who is admin + scorekeeper + team_captain will see Admin, Captains, Score, Account — all four. That's the goal.

### `team_captains` trigger

Today the trigger overwrites `user_roles.role`:

- On insert: set `role = 'team_captain'` (overwriting anything else)
- On delete (last row): set `role = 'player'` *unless* user is `admin` or `scorekeeper`

In multi-role world it's an additive operation:

```sql
-- on insert
insert into user_roles (user_id, role)
values (NEW.user_id, 'team_captain')
on conflict do nothing;

-- on delete of the last team_captains row for the user
delete from user_roles
where user_id = OLD.user_id and role = 'team_captain';
```

No more "demote unless …" logic. Other roles are independent rows — they stay untouched.

### Signup trigger

`on_auth_user_created` currently inserts `role = 'player'`. Change to:

```sql
insert into user_roles (user_id, role)
values (new.id, 'player')
on conflict do nothing;
```

`on conflict do nothing` because if a user already has a row (e.g. in test fixtures) we don't want to error.

### Admin UI (`/admin/users`)

Today the role dropdown lets admins pick exactly one of `player | scorekeeper | admin`. (`team_captain` is hidden because the captain trigger owns it.)

After: render **checkboxes** for `admin`, `scorekeeper`, and `player`. Captain assignment stays in the team-captain section as before — the checkbox for `team_captain` is read-only (or hidden) since rows in `team_captains` drive it.

Saving the form becomes a diff: insert any newly-checked roles, delete any unchecked ones (except `team_captain`). Always preserve a row for `player` so users can never lose all roles — or relax that and let admins fully revoke.

### RLS policies

All existing policies that call `is_admin()`, `is_scorekeeper_or_admin()`, etc. continue to work unchanged — the helper functions are the seam. Only call sites that reference `current_user_role()` directly (if any) need rewriting.

### Backfill

Existing rows are already (user_id, role) pairs with one row per user — they map cleanly to the new shape. The migration is mostly a constraint change:

```sql
alter table user_roles drop constraint user_roles_pkey;
alter table user_roles add primary key (user_id, role);
```

If anything queried for *exactly one role per user*, those queries break — find them with grep before merging.

---

## Migration plan (`0006_multi_role.sql`)

1. **Drop the single-row constraint** on `user_roles`, add composite PK `(user_id, role)`.
2. **Replace helper functions:**
   - Add `public.has_role(check_role public.user_role)` (definition above)
   - Rewrite `is_admin()`, `is_scorekeeper_or_admin()`, `is_team_captain_or_admin()` as one-liners over `has_role()`
   - Drop `current_user_role()` (after confirming no callers — it's not used in any policy file in the current tree, but double-check application code)
3. **Rewrite `team_captains` triggers** to insert/delete a `team_captain` row in `user_roles` instead of overwriting `role`.
4. **Rewrite `on_auth_user_created`** to insert a `player` row with `on conflict do nothing`.
5. **No data backfill needed** — existing rows already conform.

App-side changes (same PR or follow-up):

6. `lib/auth.ts` — `AuthSession.role` → `AuthSession.roles: Role[]`. Update `requireRole` / `getSessionIfRole`. Add `hasRole()` helper.
7. **Header nav** in `app/layout.tsx` — additive role checks (snippet above).
8. **`/admin/users`** — replace role dropdown with checkboxes; save = diff insert/delete.
9. **`/captains/contacts`, `/score`, `/admin/*` route gates** — should already work via existing `requireRole(['admin', …])` calls; verify.
10. **Audit** for any code that reads `session.role` as a single value: `grep -rn "\.role\b" app/ components/ lib/`.

---

## Verification checklist

- [ ] User who is only `player` sees: Account
- [ ] User who is only `scorekeeper` sees: Score, Account
- [ ] User who is only `admin` sees: Admin, Score, Account
- [ ] User who is `admin` + `team_captain` sees: Admin, Captains, Score, Account
- [ ] User who is `scorekeeper` + `team_captain` sees: Captains, Score, Account
- [ ] Assigning a `team_captains` row promotes the user (adds the role); the user keeps any other roles they had
- [ ] Removing the last `team_captains` row drops `team_captain`; other roles unaffected
- [ ] An admin can grant + revoke `scorekeeper` independently of `admin` in `/admin/users`
- [ ] Anonymous queries on `user_profiles` still return `[]` (RLS unaffected)
- [ ] All existing public pages render unchanged for anonymous viewers

---

## Open questions

- **Display "primary role" anywhere?** The `/account` page currently shows `Role: player` as a single label. With multi-role, list all roles or pick a primary? Suggested: list all (`Roles: player, scorekeeper`), since they're all true.
- **Always preserve `player` row?** Probably yes — every signed-up user is at minimum a player. But should the admin UI prevent removing it, or allow it for service accounts? Defer until a use case shows up.
- **Caching impact.** `getAuthSession()` does one extra round-trip to fetch the role. Multi-role is the same query (just returns N rows instead of 1). No measurable difference expected.
