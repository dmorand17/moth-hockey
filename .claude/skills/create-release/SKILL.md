---
name: create-release
description: Tag a new release on main and create a GitHub release with curated notes. Use when the user wants to tag a release, cut a new version, or publish a GitHub release after a staging→main merge.
---

# Create Release

Tags `main` with the next semver version and creates a GitHub release.
Run this **after** the `staging → main` PR has been merged.

## Quick start

```bash
.claude/skills/create-release/scripts/create-release.sh
```

The script prompts for the release type:

```
What kind of release is this?
  1) Patch  — bug fixes / minor tweaks     (vX.Y.Z+1)
  2) Minor  — new features, no breaking changes  (vX.Y+1.0)
  3) Major  — significant new features or breaking changes  (vX+1.0.0)
  4) Custom — I'll type the version myself
```

Pass an explicit version to skip the prompt:

```bash
.claude/skills/create-release/scripts/create-release.sh v2.1.0
```

## What the script does

1. Confirms `staging` has been merged into `main` — exits with an error if not.
2. Reads the latest semver tag and computes the three version candidates.
3. Prompts for release type (patch / minor / major / custom), or uses the
   argument if provided.
4. Builds release notes from merged PRs on `main` since the previous tag.
5. Creates an annotated git tag on `origin/main` and pushes it via `git-c`.
6. Creates a GitHub release via `gh release create`.

## Notes

- The script auto-generates release notes from PR titles. For curated notes
  (major releases, etc.), edit them on GitHub after the release is created.
- `git-c` is required for pushing tags (Code Defender blocks plain `git push`
  to external repos).
- Never run this before the staging→main PR is merged — the guard will catch it.
