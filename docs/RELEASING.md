# Releasing M.O.T.H Hockey

Day-to-day release process: how features get from a branch into production,
how migrations are applied, and how releases are tagged.

For the *initial* Vercel + Supabase setup, see
[`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md).

## Branch model

```
feature/fix branch  →  staging  →  main (prod)
```

| Branch | Vercel environment | Supabase project |
|---|---|---|
| `staging` | Preview (staging) | staging project |
| `main` | Production | prod project |

- **Always branch off `staging`**, not `main`. Every feature and bug fix lives
  on its own short-lived branch cut from `staging`.
- Feature PRs target `staging`. Merging there triggers a staging Vercel deploy
  and lets you QA against real-ish cloud data.
- `main` is only ever updated via a `staging → main` promotion PR (see below).
  Direct commits to `main` are not allowed.

## Day-to-day: feature / fix workflow

```bash
# 1. Start from a fresh staging
git checkout staging && git pull origin staging

# 2. Cut a feature branch
git checkout -b feat/my-thing      # or fix/my-bug

# 3. Work, commit, push
git add ...
git commit -m "feat(scope): what and why"
git-c push -u origin feat/my-thing

# 4. Open a PR targeting staging
gh pr create --base staging --title "feat(scope): ..." --body "..."

# 5. Merge when approved — staging deploys automatically
```

### Migrations

If your branch adds a Supabase migration:

1. Write the migration file (`supabase/migrations/NNNN_name.sql`).
2. Test it locally with `supabase migration up` (or `supabase db reset`).
3. After the feature PR merges to `staging`, push the migration to the staging
   Supabase project:

   ```bash
   supabase link --project-ref <staging-ref>   # one-time per machine
   supabase db push
   ```

4. Vercel does **not** run migrations — you must push them manually to each
   environment.

## Promoting staging to production

When staging is stable and ready to ship, use the `/staging-to-prod` Claude
skill (or run the script directly):

```bash
.claude/skills/staging-to-prod/scripts/create-pr.sh
```

This creates a `staging → main` PR titled **"Staging to Prod"** with:
- A list of every feature PR being promoted
- A **Migrations to apply to prod** section (if any new migrations exist)
- A post-merge checklist

**Review and merge the PR on GitHub.** Claude does not merge it — that's your
call.

### Post-merge checklist

After merging the `staging → main` PR:

1. **Apply migrations to prod** (if the PR body lists any):

   ```bash
   supabase link --project-ref <prod-ref>
   supabase db push
   ```

   Verify in the Supabase dashboard that the migration shows as applied.

2. **Confirm the Vercel production deploy** succeeded (check the Vercel
   dashboard or wait for the GitHub status check).

3. **Spot-check the changed areas in prod.**

4. **Tag the release** — use the `/create-release` skill, or run directly:

   ```bash
   .claude/skills/create-release/scripts/create-release.sh
   ```

   The script prompts you to choose the release type:

   ```
   What kind of release is this?
     1) Patch  — bug fixes / minor tweaks     (v2.0.1)
     2) Minor  — new features, no breaking changes  (v2.1.0)
     3) Major  — significant new features or breaking changes  (v3.0.0)
     4) Custom — I'll type the version myself
   ```

   Pass an explicit version to skip the prompt:
   ```bash
   .claude/skills/staging-to-prod/scripts/create-release.sh v2.1.0
   ```

   The script creates an annotated git tag on `main` and a GitHub release with
   the included-PR list as release notes. It refuses to run if `staging` hasn't
   been merged into `main` yet.

## Versioning

Releases use **semver** (`vMAJOR.MINOR.PATCH`). The release script auto-proposes
the next patch version. Bump `MINOR` for significant new features, `MAJOR` for
breaking changes.

```
v1.0.0  ← initial release
v1.0.1  ← patch (bug fixes, minor features)
v1.1.0  ← minor (notable new feature set)
v2.0.0  ← major (breaking change / significant rework)
```

Pass the version as the first argument to override the suggestion:

```bash
.claude/skills/staging-to-prod/scripts/create-release.sh v1.1.0
```

## Quick reference

| Task | Command |
|---|---|
| Cut a feature branch | `git checkout staging && git pull && git checkout -b feat/name` |
| Push migrations to staging | `supabase link --project-ref <staging-ref> && supabase db push` |
| Create staging → main PR | `.claude/skills/staging-to-prod/scripts/create-pr.sh` |
| Push migrations to prod | `supabase link --project-ref <prod-ref> && supabase db push` |
| Tag + create GitHub release | `.claude/skills/create-release/scripts/create-release.sh` |
