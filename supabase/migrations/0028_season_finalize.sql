-- Season finalize: an admin rolls a finished season's game events up into
-- season_player_stats (so it reads like any past season once another season
-- is activated) and assigns awards. finalized_at marks when that happened.

alter table seasons add column finalized_at timestamptz;

-- Goalie record, now that live seasons are rolled up. Null for skaters and
-- for imported seasons that never tracked game results.
alter table season_player_stats
  add column wins int,
  add column losses int,
  add column ot_losses int;
