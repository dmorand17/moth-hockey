-- Track regular-season vs. playoff games for stats filtering.
create type game_kind as enum ('regular', 'playoff');

alter table games
  add column kind game_kind not null default 'regular';

create index games_kind_idx on games (kind);
