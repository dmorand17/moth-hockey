-- Add per-game position to game_appearances so a sub or roster player whose
-- position differs from their season roster can be tracked correctly. Nullable:
-- rows written before this migration have null and callers fall back to
-- game_subs.position, then team_players.position, then "forward".
alter table game_appearances add column position player_position;
comment on column game_appearances.position is
  'Position played in this specific game. NULL for pre-0025 rows; callers should prefer this, then game_subs.position, then team_players.position, then "forward".';
