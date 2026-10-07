-- Let scorekeepers write game_availability while a game is scheduled or live
-- (#122). startGame / updateRoster now write the check-in back to
-- availability: rostered players in the lineup become 'in', the rest 'out'.
-- Before this, only players (own row), captains and admins could write it.
-- Same scope as the scorekeeper lineup policy from 0021; admins already have
-- full access via "admin manages all availability".

create policy "scorekeepers sync availability on scheduled or live games" on game_availability for all
  using (
    public.is_scorekeeper_or_admin() and exists (
      select 1 from games g
      where g.id = game_availability.game_id and g.status in ('scheduled', 'live')
    )
  )
  with check (
    public.is_scorekeeper_or_admin() and exists (
      select 1 from games g
      where g.id = game_availability.game_id and g.status in ('scheduled', 'live')
    )
  );
