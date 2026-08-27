---
name: staging-to-prod
description: Open the "Staging to Prod" release PR that promotes staging to main for moth-hockey. Use when the user wants to promote/ship/release staging to production, cut a prod release, or create the staging-to-prod PR.
---

# Staging to Prod

This repo ships on a `feature → staging → main` flow: feature PRs merge into
`staging`, then a single **"Staging to Prod"** PR promotes `staging` to `main`
(prod deploys from `main` via Vercel). This skill creates that promotion PR
following the repo convention.

## Convention

- **Title:** `Staging to Prod` (exactly — every prior release PR uses this)
- **Base:** `main`  **Head:** `staging`
- **Body:** a bulleted list of the feature PRs being promoted (`- #N — <title>`)
  plus a short post-merge checklist. Historically the body was empty; include
  the summary so the release is self-documenting.

## Quick start

Run the helper — it fetches, lists the PRs on `staging` not yet in `main`,
builds the body, and creates the PR:

```bash
.claude/skills/staging-to-prod/scripts/create-pr.sh
```

Then relay the printed PR URL to the user. If it reports "nothing to promote"
or an already-open PR, relay that instead of creating a duplicate.

## What the script does

1. `git fetch origin`, then checks `origin/main..origin/staging` — exits early
   if `staging` is not ahead of `main`.
2. If a `staging → main` PR is already open, prints its URL and exits.
3. Parses the merged feature PRs from `staging`'s first-parent merge commits and
   looks up each title via `gh` to build the **Included** list.
4. Creates the PR with the conventional title/base/head and the generated body.

## Manual fallback

If the script can't run, do it by hand:

```bash
git fetch origin
git log --first-parent --oneline origin/main..origin/staging   # what's being promoted
gh pr create --base main --head staging --title "Staging to Prod" --body "<summary + checklist>"
```

## Notes

- Don't merge the PR as part of this skill — creating it is the deliverable;
  merging is the user's call.
- `git-c` is only needed for pushing; PR creation uses `gh` directly.
