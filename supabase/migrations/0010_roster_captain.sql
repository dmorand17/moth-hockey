-- Roster captain label.
--
-- Captaincy has two facets:
--   * a label — who the captain is — which any rostered player can hold,
--     stored per roster row on team_players.is_captain (no account needed);
--   * an optional login role — when that player has a linked auth account,
--     a team_captains row grants the 'team_captain' role (existing trigger).
--
-- One captain per team per season is enforced in the app layer (assigning a
-- new captain clears the previous one), consistent with team_captains' PK.

alter table team_players
  add column if not exists is_captain boolean not null default false;

-- Backfill: mark the roster row of each current captain so existing captains
-- keep their label. Matches the captain's linked player to their roster row.
update team_players tp
set is_captain = true
from team_captains tc
join players p on p.user_id = tc.user_id
where tp.team_id = tc.team_id
  and tp.season_id = tc.season_id
  and tp.player_id = p.id;

-- Derive team_captains (the login-role linkage) from the is_captain label.
-- For a given team+season there is at most one captain; if that captain's
-- player has a linked auth account, team_captains carries it, otherwise the
-- team has no login-captain. team_captains' own trigger then syncs the role.
create or replace function public.reconcile_team_captain(p_team uuid, p_season uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select p.user_id
    into v_user
  from team_players tp
  join players p on p.id = tp.player_id
  where tp.team_id = p_team
    and tp.season_id = p_season
    and tp.is_captain
  limit 1;

  delete from team_captains
  where team_id = p_team and season_id = p_season;

  if v_user is not null then
    -- A user can only captain one team per season (unique index); if they
    -- already captain another team, leave that alone.
    insert into team_captains (team_id, season_id, user_id)
    values (p_team, p_season, v_user)
    on conflict do nothing;
  end if;
end;
$$;

-- Fire when the captain label (or the rostered player) changes.
create or replace function public.tg_team_players_captain_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.reconcile_team_captain(old.team_id, old.season_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.is_captain = new.is_captain
     and old.player_id = new.player_id
     and old.team_id = new.team_id
     and old.season_id = new.season_id then
    return new; -- nothing captain-relevant changed
  end if;

  perform public.reconcile_team_captain(new.team_id, new.season_id);
  if tg_op = 'UPDATE'
     and (old.team_id, old.season_id) is distinct from (new.team_id, new.season_id) then
    perform public.reconcile_team_captain(old.team_id, old.season_id);
  end if;
  return new;
end;
$$;

drop trigger if exists team_players_captain_sync on team_players;
create trigger team_players_captain_sync
  after insert or update or delete on team_players
  for each row execute function public.tg_team_players_captain_sync();

-- Fire when a player's account is linked/unlinked after the fact, so a
-- captain who signs up later is granted (or loses) the role automatically.
create or replace function public.tg_players_userid_captain_sync()
returns trigger
language plpgsql
as $$
begin
  if old.user_id is distinct from new.user_id then
    perform public.reconcile_team_captain(tp.team_id, tp.season_id)
    from team_players tp
    where tp.player_id = new.id and tp.is_captain;
  end if;
  return new;
end;
$$;

drop trigger if exists players_userid_captain_sync on players;
create trigger players_userid_captain_sync
  after update of user_id on players
  for each row execute function public.tg_players_userid_captain_sync();
