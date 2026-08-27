-- Enforce one team per player per season.
--
-- The team admin UI already filters the available-player list to players not
-- rostered anywhere this season, but nothing at the DB level prevented a stale
-- page, a concurrent admin, or a direct write from rostering a player on two
-- teams in the same season. The stats engine assumes one team per player per
-- season, so make that a hard guarantee.

-- Fail early with a clear message if existing data already violates the rule,
-- rather than a cryptic unique-index build error.
do $$
declare
  dup_count int;
begin
  select count(*) into dup_count
  from (
    select player_id, season_id
    from team_players
    group by player_id, season_id
    having count(*) > 1
  ) dups;

  if dup_count > 0 then
    raise exception
      'Cannot enforce one-team-per-season: % player(s) are rostered on multiple teams in the same season. Resolve the duplicates before applying this migration.',
      dup_count;
  end if;
end $$;

create unique index if not exists team_players_player_season_uniq
  on team_players (player_id, season_id);
