-- Extend game_availability RLS so admin and team captains can manage
-- player availability on behalf of players they oversee.

-- Admin: full access to all availability rows.
create policy "admin manages all availability" on game_availability for all
  using (is_admin())
  with check (is_admin());

-- Captain: manage availability for players on their team(s) in this game.
-- Joins team_captains → games (to confirm the captain's team is in the game)
-- → team_players (to confirm the target player is on that team that season).
create policy "captain manages team availability" on game_availability for all
  using (
    exists (
      select 1
      from team_captains tc
      join games g on (g.home_team_id = tc.team_id or g.away_team_id = tc.team_id)
      join team_players tp on (tp.team_id = tc.team_id and tp.season_id = tc.season_id)
      where tc.user_id = auth.uid()
        and g.id = game_availability.game_id
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
        and tp.player_id = game_availability.player_id
    )
  );
