-- Playoffs: per-game round label + allow TBD-vs-TBD stubs at schedule generation.
--
-- The `games.kind` enum (regular | playoff) already exists from 0002. This
-- migration adds the playoff bracket round and lets stub rows exist with
-- null team IDs until the bracket is seeded from standings.

create type playoff_round as enum ('sf1', 'sf2', 'final');

alter table games
  add column playoff_round playoff_round;

alter table games
  alter column home_team_id drop not null,
  alter column away_team_id drop not null;

-- Regular games still require both team IDs. Playoff stubs may be null until
-- bracket seeding fills them in. The home<>away check from 0001 is preserved
-- by Postgres because <> on null is null (constraint not violated by stubs).
alter table games
  add constraint games_teams_required_unless_playoff
  check (
    kind = 'playoff'
    or (home_team_id is not null and away_team_id is not null)
  );

-- Each season has at most one game per playoff round (sf1, sf2, final).
create unique index games_playoff_round_unique
  on games (season_id, playoff_round)
  where kind = 'playoff' and playoff_round is not null;

create index games_playoff_round_idx on games (playoff_round);
