#!/usr/bin/env bash
# Create the "Staging to Prod" release PR (staging -> main) for moth-hockey.
# Lists the feature PRs being promoted, builds the body, and opens the PR.
set -euo pipefail

BASE="main"
HEAD="staging"
TITLE="Staging to Prod"

git fetch --quiet origin

# Nothing to promote?
ahead=$(git rev-list --count "origin/${BASE}..origin/${HEAD}")
if [[ "${ahead}" -eq 0 ]]; then
  echo "Nothing to promote — origin/${HEAD} is not ahead of origin/${BASE}."
  exit 0
fi

# Already have an open promotion PR?
existing=$(gh pr list --base "${BASE}" --head "${HEAD}" --state open \
  --json url --jq '.[0].url // empty')
if [[ -n "${existing}" ]]; then
  echo "A ${HEAD} -> ${BASE} PR is already open: ${existing}"
  exit 0
fi

# Build the "Included" list from merged feature PRs on staging (first-parent
# merge commits like "Merge pull request #NN from ...").
included=""
while read -r num; do
  [[ -z "${num}" ]] && continue
  title=$(gh pr view "${num}" --json title --jq .title 2>/dev/null || echo "")
  if [[ -n "${title}" ]]; then
    included+="- #${num} — ${title}"$'\n'
  else
    included+="- #${num}"$'\n'
  fi
done < <(git log --first-parent --pretty=%s "origin/${BASE}..origin/${HEAD}" \
  | sed -n 's/^Merge pull request #\([0-9]\{1,\}\).*/\1/p')

[[ -z "${included}" ]] && included="- (no feature PRs detected on ${HEAD})"$'\n'

body="Promotes the current \`${HEAD}\` to production.

## Included

${included}
## Post-merge

- [ ] Confirm the Vercel production deploy succeeds
- [ ] Spot-check the changed areas in prod"

gh pr create --base "${BASE}" --head "${HEAD}" --title "${TITLE}" --body "${body}"
