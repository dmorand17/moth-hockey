-- Let plain scorekeepers start games (two RLS fixes, one per step of startGame).
--
-- startGame inserts the checked-in lineup while the game is still 'scheduled'
-- and only then flips it to 'live'. The 0004 policy allowed non-admin writes
-- only on live games, so every start by a plain scorekeeper was rejected by
-- RLS; admins were unaffected, which hid the bug. Final games stay admin-only.

drop policy "scorekeepers manage appearances on live games" on game_appearances;

create policy "scorekeepers manage appearances on scheduled or live games" on game_appearances for all
  using (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g
      where g.id = game_appearances.game_id and g.status in ('scheduled', 'live')
    ))
  )
  with check (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g
      where g.id = game_appearances.game_id and g.status in ('scheduled', 'live')
    ))
  );

-- Same bug one step later: startGame then flips the game scheduled -> live,
-- but the 0004 update policy only matched rows already 'live', so the flip
-- touched zero rows (which PostgREST reports as success). Non-admins may now
-- update scheduled games, but only to move them forward to live/final, so this
-- doesn't open up general schedule editing.

drop policy "scorekeepers update live games" on games;

create policy "scorekeepers update scheduled or live games" on games for update
  using (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or status in ('scheduled', 'live'))
  )
  with check (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or status in ('live', 'final'))
  );
