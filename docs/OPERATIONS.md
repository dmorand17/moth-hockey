# M.O.T.H Hockey — Operations

Runbook for recurring operational tasks against the deployed environments
(staging / prod). One-time deploy setup lives in
[`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md).

## Refreshing staging seed data (keep users)

Use this when you want to **blow away the league data and reload the seed**, but
keep the real accounts people have signed up with (so you can re-link players to
them afterward). Unlike `supabase db reset --linked`, this never touches
`auth.users`, `user_profiles`, or `user_roles`.

```bash
set -a; source .env.staging; set +a   # provides SUPABASE_DB_URL (see .env.example)
./scripts/reset-staging.sh
```

The script reads `SUPABASE_DB_URL`, falling back to the older `STAGING_DB_URL`.

The wrapper runs two steps (you can also run them by hand, or paste the SQL into
the dashboard SQL Editor):

```bash
psql "$SUPABASE_DB_URL" -f supabase/reset-staging.sql   # wipe league data, keep users
psql "$SUPABASE_DB_URL" -f supabase/seed.sql            # reload seed data
```

- `supabase/reset-staging.sql` truncates the league tables
  (seasons/teams/players/games/stats/awards/rosters/captains/content) and
  **preserves** `auth.users`, `auth.identities`, `user_profiles`, `user_roles`,
  and `account_requests`. It uses `TRUNCATE` (not `DELETE`) so the team-captain
  role-sync trigger doesn't fire — admins/scorekeepers keep their roles.
- `TRUNCATE … CASCADE` also wipes every table with a foreign key into those:
  `game_availability`, `game_subs`, `game_write_ups`, `schedule_skips`, and
  **all** `posts` (site board included, not just game threads).
- Use the **Session pooler** string (port 5432), not the transaction pooler
  (6543) — the seed needs multi-statement transactions.
- After reloading: **player↔user links are cleared** (players are recreated), so
  re-link them in the admin UI. Captain assignments are cleared too — re-assign
  as needed. `content_pages` is reset to the seed content.
- This is safe to run on a schedule/CI: both files are re-runnable.

## Loading a single season into an existing DB

To add one season's data to an already-seeded database without re-running the
whole seed (which would collide on existing rows), use a scoped, idempotent
loader. `supabase/seed-spring-2025.sql` is the worked example — it's
self-contained (creates the players it references with `on conflict do nothing`)
and safe to re-run:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed-spring-2025.sql
```
