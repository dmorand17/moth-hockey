-- Fix: deleting an auth user 500s with "relation team_players does not exist".
--
-- players.user_id references auth.users(id) ON DELETE SET NULL (0004), so
-- deleting an auth user issues UPDATE players SET user_id = NULL, which fires
-- players_userid_captain_sync. That trigger's function ran without
-- SECURITY DEFINER and without a search_path, so it inherited the deleting
-- role's context — auth.users deletes run as supabase_auth_admin, whose
-- search_path excludes public. The bare `team_players` reference then failed
-- to resolve.
--
-- Recreate both captain-sync trigger functions as SECURITY DEFINER with a
-- pinned search_path (matching reconcile_team_captain in 0010), and
-- schema-qualify the table reference. CREATE OR REPLACE keeps the existing
-- triggers attached.

create or replace function public.tg_players_userid_captain_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is distinct from new.user_id then
    perform public.reconcile_team_captain(tp.team_id, tp.season_id)
    from public.team_players tp
    where tp.player_id = new.id and tp.is_captain;
  end if;
  return new;
end;
$$;

create or replace function public.tg_team_players_captain_sync()
returns trigger
language plpgsql
security definer
set search_path = public
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
