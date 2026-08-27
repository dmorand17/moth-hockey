# Supabase Commands

A practical command reference for M.O.T.H Hockey's Supabase work — local dev,
migrations, linking to cloud projects, and pushing schema changes safely.

Uses **bun**, so run the CLI via `bunx supabase …` (or a global
`brew install supabase/tap/supabase`). Related docs:
[`DEVELOPMENT.md`](./DEVELOPMENT.md) (dev loop),
[`LOCAL-TESTING.md`](./LOCAL-TESTING.md) (sign-in),
[`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md) (deploy runbook).

## Projects

| Env | Git branch | Supabase project | Ref |
|-----|-----------|------------------|-----|
| Production | `main` | `moth-hockey-prod` | `fpvqzzkauhifixnzppwh` |
| Staging | `staging` | staging project | `ecvktaljsvrecozmfayj` |

> Always confirm which project you're linked to before any `db push`/`db reset`
> against a remote — see [Linking](#linking-to-a-cloud-project). Refs can also be
> read from the dashboard URL: `app.supabase.com/project/<ref>`.

## Local stack

```bash
bunx supabase start      # boot Postgres, Auth, Studio, Mailpit (Docker)
bunx supabase status     # print URLs, ports, keys
bunx supabase stop       # shut it down (keeps the data volume)
bunx supabase stop --no-backup   # shut down AND wipe the local data volume
```

Local URLs (defaults): app `http://127.0.0.1:3001`, API `:54321`, Studio `:54323`,
Mailpit `:54324`, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Migrations

Migrations live in `supabase/migrations/` as `NNNN_name.sql`, applied in order.

```bash
# Create a new migration file (either style)
bunx supabase migration new add_something      # timestamped file
#   …or hand-create the next-numbered 00NN_name.sql to match the convention

# Apply locally — full reset re-runs every migration, then seed.sql
bunx supabase db reset

# Capture schema changes you made in Studio into a migration file
bunx supabase db diff -f my_change

# List local vs remote applied state (needs a linked project)
bunx supabase migration list
```

> **Enum gotcha:** Postgres rejects using a *new value* of an existing enum in the
> same transaction that adds it. Put `alter type … add value` in its own migration
> before any migration that references it (see `0003_user_role_enum.sql`). Creating
> a brand-new enum type and using it in the same migration is fine (see `0009`).

After any schema change, regenerate the typed client:

```bash
bunx supabase gen types typescript --local > lib/supabase/database.types.ts
```

> Do **not** add `2>&1` — a stray stderr line ("Connecting to db…") lands in the
> file and breaks the types. Commit the regenerated file with the migration.

## Linking to a cloud project

```bash
bunx supabase projects list                     # shows projects; the linked one is marked
bunx supabase link --project-ref <ref>          # link this repo to a project (interactive; needs DB password)
```

Use the ref from the [Projects](#projects) table. Linking is per-machine and
persists in `supabase/.temp/`. **Re-link before pushing** if you're unsure which
project is active — it's easy to be linked to prod when you meant staging.

Or link non-interactively from a per-environment file — refs are baked in and
prod requires confirmation. Copy `.env.staging.example` / `.env.production.example`,
fill in the token + DB password, then:

```bash
set -a; source .env.staging; set +a
./scripts/supabase-link.sh staging

set -a; source .env.production; set +a
./scripts/supabase-link.sh prod        # prompts to confirm (--yes to skip in CI)
```

The script reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and
(optionally) `SUPABASE_PROJECT_REF` from the loaded env, and cross-checks
`SUPABASE_ENV` against the target to catch a wrong sourced file.

## Pushing migrations to a cloud project

`db push` applies any local migrations not yet recorded on the linked remote,
in order. **Confirm the linked project first.**

```bash
bunx supabase link --project-ref <staging-or-prod-ref>   # be deliberate
bunx supabase migration list                             # see what's pending
bunx supabase db push                                    # apply pending migrations
```

- **Do NOT run `supabase/seed.sql` against a cloud DB** — it's local test
  fixtures (and its header block grants privileges only needed locally). Cloud
  projects already have the right default privileges.
- Cloud RLS is live: reads are open, writes require an authenticated user with
  the right role (see [`DATABASE.md`](./DATABASE.md)).

### Fixing "type … already exists" / drifted migration history

If `db push` tries to re-run an old migration and errors (e.g. `type
"playoff_round" already exists`), the remote's `supabase_migrations` table is
behind the actual schema. **First verify the migration's objects are fully
present** (Studio SQL editor), then mark it applied without re-running:

```bash
bunx supabase migration repair --status applied <version>   # e.g. 0007
bunx supabase db push                                       # continues with the rest
```

If the migration is only *partially* applied, don't repair — finish or drop the
leaked objects first. When in doubt, inspect before repairing.

## Deploy model (how DB + code relate)

Deploys are branch-driven via Vercel: `staging` branch → Preview build against the
**staging** project; `main` → Production build against the **prod** project.
Merging to a branch deploys it, so **migrate the target project's DB _before_
merging** — new code that queries a not-yet-created table/column will error in
prod. Migrations here are additive/backward-compatible, so applying them ahead of
the deploy is safe. CI (`.github/workflows/ci.yml`) flags new migrations on `main`
PRs as a reminder.

## Cloud connection string (for `psql`, one-off seeds)

Dashboard → Project Settings → Database → Connection string → **Session pooler**
(port 5432, not the transaction pooler on 6543 — multi-statement SQL needs the
session pooler). Don't use the deprecated direct `db.<ref>.supabase.co` host.
