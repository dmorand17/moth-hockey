-- =============================================================================
-- team_captains: per-team / per-season captain assignment.
--
-- Decisions (see PLAN.md §3 Wave 4):
--   - One captain per team per season — PK (team_id, season_id).
--   - Assignment IS the captain role: a trigger keeps user_roles.role in sync.
--     Inserting a row promotes a 'player' to 'team_captain'. Removing the last
--     row demotes back to 'player'. Admin / scorekeeper roles are NEVER
--     downgraded by this trigger — they outrank captain anyway.
--   - Public read on the table so /teams/[slug] can show "Captain: ..."
--     anonymously.
-- =============================================================================

create table team_captains (
  team_id    uuid not null references teams(id)      on delete cascade,
  season_id  uuid not null references seasons(id)    on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, season_id)
);

-- A user can captain different teams in different seasons, but not two teams
-- in the same season.
create unique index team_captains_user_season_uniq
  on team_captains (user_id, season_id);

create index team_captains_user_idx on team_captains (user_id);

alter table team_captains enable row level security;

create policy "public read team_captains" on team_captains for select
  using (true);

create policy "admins write team_captains" on team_captains for all
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- Role sync trigger.
--
-- Promote: when a row is inserted, if the user is currently 'player', set
-- them to 'team_captain'. (Don't touch admin / scorekeeper — they're already
-- privileged.)
--
-- Demote: when a row is deleted, if the user has no remaining team_captains
-- rows AND their current role is 'team_captain', revert to 'player'.
-- =============================================================================

create or replace function public.sync_captain_role_on_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_roles
     set role = 'team_captain'
   where user_id = new.user_id
     and role = 'player';
  return new;
end;
$$;

create or replace function public.sync_captain_role_on_unassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_count integer;
begin
  select count(*) into remaining_count
  from public.team_captains
  where user_id = old.user_id;

  if remaining_count = 0 then
    update public.user_roles
       set role = 'player'
     where user_id = old.user_id
       and role = 'team_captain';
  end if;

  return old;
end;
$$;

create trigger team_captains_sync_assign
  after insert on team_captains
  for each row execute function public.sync_captain_role_on_assign();

create trigger team_captains_sync_unassign
  after delete on team_captains
  for each row execute function public.sync_captain_role_on_unassign();
