#!/usr/bin/env bash
# Reseed the local current season with a sample team set + schedule.
#   scripts/local/seed-sample.sh 5   # 5 teams (odd → byes)
#   scripts/local/seed-sample.sh 4   # 4 teams (even → no byes)
# Local only — targets the local Supabase Postgres.
set -euo pipefail

COUNT="${1:-5}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

bun run "$DIR/seed-sample.ts" "$COUNT" \
  | psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

echo "Seeded ${COUNT}-team setup into the local current season."
