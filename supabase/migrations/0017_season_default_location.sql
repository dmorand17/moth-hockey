-- Optional default rink/location for a season. Games inherit it (schedule
-- generator + New Game pre-fill) and fall back to it for display when a game
-- has no explicit location of its own.
alter table seasons add column if not exists default_location text;
