-- Pre-game player availability / check-in (In or Out). Distinct from
-- game_appearances (which records who actually played, set at game start).
-- No row for a (game, player) means "no response".

create type availability_status as enum ('in', 'out');

create table game_availability (
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  status     availability_status not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table game_availability enable row level security;

-- A signed-in user manages availability for the player linked to them.
create policy "players manage own availability" on game_availability for all
  using (player_id in (select id from public.players where user_id = auth.uid()))
  with check (player_id in (select id from public.players where user_id = auth.uid()));

-- Availability is public-readable (matches the app's open-read posture).
create policy "public read availability" on game_availability for select
  using (true);
