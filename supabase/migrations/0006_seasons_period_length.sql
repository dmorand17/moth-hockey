-- Per-season regulation period length in minutes.
-- League default is 17:00 running time. Stored on seasons so different
-- season formats (e.g. tournament) can override later.

alter table seasons
  add column if not exists period_length_minutes int not null default 17;

comment on column seasons.period_length_minutes is
  'Regulation period length in minutes. Used by the scorekeeper to seed games.clock_seconds.';
