#!/usr/bin/env bash
# Create the "Staging to Prod" release PR (staging -> main) for moth-hockey.
# Lists the feature PRs being promoted + any new Supabase migrations to apply,
# builds the body, and opens the PR.
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

# New Supabase migrations on staging not yet in main. Vercel does NOT run these,
# so the release PR must call them out for manual application to prod.
migrations=$(git diff --name-only --diff-filter=A \
  "origin/${BASE}..origin/${HEAD}" -- supabase/migrations/ 2>/dev/null || true)

mig_section=""
mig_checklist=""
if [[ -n "${migrations}" ]]; then
  mig_list=""
  while IFS= read -r f; do
    [[ -n "${f}" ]] && mig_list+="- \`${f}\`"$'\n'
  done <<< "${migrations}"
  mig_section="## Migrations to apply to prod ⚠️

Vercel deploys the app but does **not** run Supabase migrations. Apply these to
the prod project (see \`docs/initial-build/DEPLOY.md\`) when releasing:

${mig_list}
\`\`\`bash
bunx supabase db push   # with the prod project linked
\`\`\`

"
  mig_checklist="- [ ] Apply the migrations above (\`supabase db push\` to prod)
"
fi

body="Promotes the current \`${HEAD}\` to production.

## Included

${included}
${mig_section}## Post-merge

${mig_checklist}- [ ] Confirm the Vercel production deploy succeeds
- [ ] Spot-check the changed areas in prod
- [ ] Tag the release: use the \`/create-release\` skill (or run \`.claude/skills/create-release/scripts/create-release.sh\`)"

gh pr create --base "${BASE}" --head "${HEAD}" --title "${TITLE}" --body "${body}"
