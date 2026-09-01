#!/usr/bin/env bash
# Run this AFTER the staging → main PR is merged.
# Tags the new main HEAD and creates a GitHub release, using the same
# included-PR list that the staging-to-prod PR body contained.
set -euo pipefail

BASE="main"
HEAD="staging"

git fetch --quiet origin

# Confirm main was actually updated (staging PR merged)
if ! git merge-base --is-ancestor "origin/${HEAD}" "origin/${BASE}" 2>/dev/null; then
  echo "Error: origin/${HEAD} has not been merged into origin/${BASE} yet."
  echo "Merge the staging-to-prod PR first, then run this script."
  exit 1
fi

# Determine the previous release tag and propose the next patch version.
prev_tag=$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
if [[ -z "${prev_tag}" ]]; then
  suggested="v1.0.0"
else
  IFS='.' read -r major minor patch <<< "${prev_tag#v}"
  suggested="v${major}.${minor}.$((patch + 1))"
fi

# Allow override via first argument.
tag="${1:-${suggested}}"

echo "Previous tag : ${prev_tag:-none}"
echo "New tag      : ${tag}"

# Verify the tag doesn't already exist.
if git rev-parse "${tag}" &>/dev/null; then
  echo "Error: tag '${tag}' already exists. Pass a different version as the first argument."
  exit 1
fi

# Build the included-PR list from commits on main since the previous tag.
since_ref="${prev_tag:-$(git rev-list --max-parents=0 origin/${BASE})}"
included=""
while read -r num; do
  [[ -z "${num}" ]] && continue
  title=$(gh pr view "${num}" --json title --jq .title 2>/dev/null || echo "")
  if [[ -n "${title}" ]]; then
    included+="- #${num} — ${title}"$'\n'
  else
    included+="- #${num}"$'\n'
  fi
done < <(git log --first-parent --pretty=%s "${since_ref}..origin/${BASE}" \
  | sed -n 's/^Merge pull request #\([0-9]\{1,\}\).*/\1/p')

[[ -z "${included}" ]] && included="- (no feature PRs detected since ${since_ref})"$'\n'

release_notes="## What's included

${included}"

# Create an annotated tag on origin/main HEAD.
git tag -a "${tag}" "origin/${BASE}" -m "Release ${tag}"
git push origin "${tag}"

# Create the GitHub release.
gh release create "${tag}" \
  --title "Release ${tag}" \
  --notes "${release_notes}" \
  --target "${BASE}"

echo ""
echo "Released ${tag}:"
gh release view "${tag}" --json url --jq .url
