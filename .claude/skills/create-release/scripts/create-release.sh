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

# Determine the previous release tag and compute all three version candidates.
prev_tag=$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
if [[ -z "${prev_tag}" ]]; then
  patch_bump="v1.0.0"
  minor_bump="v1.0.0"
  major_bump="v1.0.0"
else
  IFS='.' read -r major minor patch <<< "${prev_tag#v}"
  patch_bump="v${major}.${minor}.$((patch + 1))"
  minor_bump="v${major}.$((minor + 1)).0"
  major_bump="v$((major + 1)).0.0"
fi

# If an explicit version was passed as the first argument, skip the prompt.
if [[ -n "${1:-}" ]]; then
  tag="$1"
else
  echo "Previous release : ${prev_tag:-none}"
  echo ""
  echo "What kind of release is this?"
  echo "  1) Patch  — bug fixes / minor tweaks  (${patch_bump})"
  echo "  2) Minor  — new features, no breaking changes  (${minor_bump})"
  echo "  3) Major  — significant new features or breaking changes  (${major_bump})"
  echo "  4) Custom — I'll type the version myself"
  echo ""
  read -rp "Choice [1-4]: " choice
  case "${choice}" in
    1) tag="${patch_bump}" ;;
    2) tag="${minor_bump}" ;;
    3) tag="${major_bump}" ;;
    4)
      read -rp "Version (e.g. v2.1.0): " tag
      ;;
    *)
      echo "Invalid choice. Exiting."
      exit 1
      ;;
  esac
fi

echo ""
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
git-c push origin "${tag}"

# Create the GitHub release.
gh release create "${tag}" \
  --title "Release ${tag}" \
  --notes "${release_notes}" \
  --target "${BASE}"

echo ""
echo "Released ${tag}:"
gh release view "${tag}" --json url --jq .url
