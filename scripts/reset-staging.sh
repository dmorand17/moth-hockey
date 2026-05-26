#!/usr/bin/env bash
#
# Recreate staging's seed data while PRESERVING real auth users.
#
# Wipes the league tables (seasons/teams/players/games/stats/awards/…) and
# reloads supabase/seed.sql, leaving auth.users / user_profiles / user_roles
# intact so you can re-link players to users afterward.
#
# Usage:
#   export STAGING_DB_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#   ./scripts/reset-staging.sh
#
# Use the Supabase Session pooler string (port 5432) — the seed needs
# multi-statement transactions, which the transaction pooler (6543) rejects.
set -euo pipefail

: "${STAGING_DB_URL:?set STAGING_DB_URL to the Supabase Session-pooler connection string}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Wiping league data (auth users preserved)…"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$repo_root/supabase/reset-staging.sql"

echo "==> Reloading seed data…"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$repo_root/supabase/seed.sql"

echo "==> Done. League data reseeded; users left in place (re-link players as needed)."
