-- Pre-game subs. Captains (for their own team) and admins line up subs for a
-- scheduled game; the scorekeeper's check-in starts with them pre-checked,
-- and startGame turns them into ordinary is_sub game_appearances.
--
-- Distinct from game_availability, which only covers rostered players.

create table game_subs (
  game_id    uuid not null references games(id) on delete cascade,
  team_id    uuid not null references teams(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  -- Stored because a sub goalie matters: startGame needs a goalie per team.
  position   player_position not null default 'forward',
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- One team per sub per game, mirroring game_appearances' primary key.
  primary key (game_id, player_id)
);

alter table game_subs enable row level security;

create policy "public read game subs" on game_subs for select
  using (true);

create policy "admin manages game subs" on game_subs for all
  using (public.is_admin())
  with check (public.is_admin());

-- A captain manages subs for their own team, in a game their team plays, in
-- the season they captain, and only before the game starts. Once it's live,
-- the scorekeeper's lineup editor owns the roster.
create policy "captain manages own team subs" on game_subs for all
  using (
    exists (
      select 1
      from team_captains tc
      join games g on g.id = game_subs.game_id
      where tc.user_id = auth.uid()
        and tc.team_id = game_subs.team_id
        and tc.season_id = g.season_id
        and game_subs.team_id in (g.home_team_id, g.away_team_id)
        and g.status = 'scheduled'
    )
  )
  with check (
    exists (
      select 1
      from team_captains tc
      join games g on g.id = game_subs.game_id
      where tc.user_id = auth.uid()
        and tc.team_id = game_subs.team_id
        and tc.season_id = g.season_id
        and game_subs.team_id in (g.home_team_id, g.away_team_id)
        and g.status = 'scheduled'
    )
  );

-- Create a brand-new player and line them up as a sub in one step.
--
-- Captains have no INSERT rights on players (only scorekeepers/admins do), and
-- granting them broadly would let any captain create arbitrary players. This
-- function performs the same authorization as the policy above, then inserts
-- both rows atomically — so an abandoned add can't leave an orphan player.
create or replace function public.add_new_game_sub(
  p_game_id    uuid,
  p_team_id    uuid,
  p_first_name text,
  p_last_name  text,
  p_position   player_position
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  if not exists (
    select 1 from games g
    where g.id = p_game_id
      and g.status = 'scheduled'
      and p_team_id in (g.home_team_id, g.away_team_id)
      and (
        public.is_admin()
        or exists (
          select 1 from team_captains tc
          where tc.user_id = auth.uid()
            and tc.team_id = p_team_id
            and tc.season_id = g.season_id
        )
      )
  ) then
    raise exception 'Not allowed to add subs for this team in this game.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_first_name), '') = '' or coalesce(btrim(p_last_name), '') = '' then
    raise exception 'First and last name are required.' using errcode = '22023';
  end if;

  insert into players (first_name, last_name)
  values (btrim(p_first_name), btrim(p_last_name))
  returning id into v_player_id;

  insert into game_subs (game_id, team_id, player_id, position, added_by)
  values (p_game_id, p_team_id, v_player_id, p_position, auth.uid());

  return v_player_id;
end;
$$;

revoke all on function public.add_new_game_sub(uuid, uuid, text, text, player_position) from public;
grant execute on function public.add_new_game_sub(uuid, uuid, text, text, player_position) to authenticated;

-- Tighten 0020's captain availability policy: it never tied the captain's
-- season to the game's season, so a captain's roster from one season could
-- satisfy the check for a game in another. The app layer already filtered by
-- season; this makes the database agree.
drop policy "captain manages team availability" on game_availability;

create policy "captain manages team availability" on game_availability for all
  using (
    exists (
      select 1
      from team_captains tc
      join games g on (g.home_team_id = tc.team_id or g.away_team_id = tc.team_id)
      join team_players tp on (tp.team_id = tc.team_id and tp.season_id = tc.season_id)
      where tc.user_id = auth.uid()
        and g.id = game_availability.game_id
        and tc.season_id = g.season_id
        and tp.player_id = game_availability.player_id
    )
  )
  with check (
    exists (
      select 1
      from team_captains tc
      join games g on (g.home_team_id = tc.team_id or g.away_team_id = tc.team_id)
      join team_players tp on (tp.team_id = tc.team_id and tp.season_id = tc.season_id)
      where tc.user_id = auth.uid()
        and g.id = game_availability.game_id
        and tc.season_id = g.season_id
        and tp.player_id = game_availability.player_id
    )
  );
