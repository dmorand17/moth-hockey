#!/usr/bin/env bash
#
# Recreate staging's seed data while PRESERVING real auth users.
#
# Wipes the league tables (seasons/teams/players/games/stats/awards/…) and
# reloads supabase/seed.sql, leaving auth.users / user_profiles / user_roles
# intact so you can re-link players to users afterward.
#
# Usage:
#   set -a; source .env.staging; set +a     # provides SUPABASE_DB_URL
#   ./scripts/reset-staging.sh
#
# Use the Supabase Session pooler string (port 5432) — the seed needs
# multi-statement transactions, which the transaction pooler (6543) rejects.
set -euo pipefail

# Prefer the generic SUPABASE_DB_URL (per-env files); fall back to the older
# STAGING_DB_URL for back-compat.
db_url="${SUPABASE_DB_URL:-${STAGING_DB_URL:-}}"
: "${db_url:?set SUPABASE_DB_URL to the Supabase Session-pooler connection string (see .env.staging.example)}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Wiping league data (auth users preserved)…"
psql "$db_url" -v ON_ERROR_STOP=1 -f "$repo_root/supabase/reset-staging.sql"

echo "==> Reloading seed data…"
psql "$db_url" -v ON_ERROR_STOP=1 -f "$repo_root/supabase/seed.sql"

echo "==> Done. League data reseeded; users left in place (re-link players as needed)."
