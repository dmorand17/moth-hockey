-- =============================================================================
-- Reset staging league data — PRESERVES real auth users.
--
-- Wipes every league/app table so the seed can be reloaded fresh, while leaving
-- the accounts (and their roles) untouched:
--   KEPT:  auth.users, auth.identities, public.user_profiles,
--          public.user_roles, public.account_requests
--   WIPED: seasons, teams, players, team_players, games, game_appearances,
--          game_events, season_player_stats, player_awards, team_captains,
--          content_pages
--
-- Run this, then reload the seed:
--   psql "<staging-session-pooler-url>" -f supabase/reset-staging.sql
--   psql "<staging-session-pooler-url>" -f supabase/seed.sql
-- (or use scripts/reset-staging.sh, which does both.)
--
-- Why TRUNCATE and not DELETE: TRUNCATE does not fire the team_captains
-- row-delete trigger, so user_roles is left exactly as-is — admins stay admins,
-- scorekeepers stay scorekeepers. A user who was a team_captain keeps that role
-- even though the assignment is cleared; re-assign captains via the admin UI.
--
-- Notes:
--   * player↔user links (players.user_id) are cleared because players are
--     recreated by the seed — re-link via the admin UI afterward.
--   * content_pages is reset to the seed content, discarding any admin edits.
--   * Re-running seed.sql also (idempotently) recreates the dev @moth.test test
--     accounts; real users are never touched here.
-- =============================================================================

truncate table
  game_events,
  game_appearances,
  games,
  team_players,
  season_player_stats,
  player_awards,
  team_captains,
  teams,
  players,
  seasons,
  content_pages
cascade;
