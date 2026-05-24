-- =============================================================================
-- Auth + roles refresh (continues 0003_user_role_enum.sql).
--
-- 1. Add players.user_id (nullable FK to auth.users) so an admin can link a
--    signed-up user to a roster player
-- 2. Create user_profiles (private contact info) with RLS
-- 3. Replace is_scorer_or_admin with is_scorekeeper_or_admin everywhere
-- 4. Trigger: when an auth.users row is inserted, create the matching
--    user_profiles row and a user_roles row defaulting to 'player'
-- =============================================================================

-- 1. Link signed-up users to roster players (admin-set).
alter table players add column user_id uuid references auth.users(id) on delete set null;
create unique index players_user_id_key on players (user_id) where user_id is not null;

-- 2. user_profiles: private contact info. Email mirrors auth.users.email,
-- phone is optional. Never exposed on public pages.
create table user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  phone      text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- 3. Drop policies that referenced is_scorer_or_admin so we can drop the function.
drop policy if exists "scorers insert players"                  on players;
drop policy if exists "scorers update live games"               on games;
drop policy if exists "scorers manage appearances on live games" on game_appearances;
drop policy if exists "scorers manage events on live games"     on game_events;

drop function if exists public.is_scorer_or_admin();

create or replace function public.is_scorekeeper_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'scorekeeper') from public.user_roles where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.is_team_captain_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'team_captain') from public.user_roles where user_id = auth.uid()),
    false
  );
$$;

-- Recreate the scorekeeper policies under the new name.
create policy "scorekeepers insert players" on players for insert
  with check (public.is_scorekeeper_or_admin());

create policy "scorekeepers update live games" on games for update
  using (public.is_scorekeeper_or_admin() and (status = 'live' or public.is_admin()))
  with check (public.is_scorekeeper_or_admin());

create policy "scorekeepers manage appearances on live games" on game_appearances for all
  using (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_appearances.game_id and g.status = 'live'
    ))
  )
  with check (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_appearances.game_id and g.status = 'live'
    ))
  );

create policy "scorekeepers manage events on live games" on game_events for all
  using (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_events.game_id and g.status = 'live'
    ))
  )
  with check (
    public.is_scorekeeper_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_events.game_id and g.status = 'live'
    ))
  );

-- user_profiles RLS:
--   self  → read + update own row
--   admin → read + write any row
--   team_captain → read any row (for the contacts directory)
-- Anonymous: no select (no policy granted).
create policy "users read own profile" on user_profiles for select
  using (user_id = auth.uid() or public.is_team_captain_or_admin());

create policy "users update own profile" on user_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins write profiles" on user_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Trigger: on every new auth.users row, seed user_profiles + user_roles.
-- Runs as security definer so it can write to the public schema even though
-- the inserting role is supabase_auth_admin.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_full_name text := nullif(new.raw_user_meta_data->>'full_name', '');
  meta_phone     text := nullif(new.raw_user_meta_data->>'phone', '');
begin
  insert into public.user_profiles (user_id, email, phone, full_name)
  values (new.id, new.email, meta_phone, meta_full_name)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'player')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep user_profiles.updated_at fresh on edits.
create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on user_profiles;
create trigger user_profiles_set_updated_at
  before update on user_profiles
  for each row execute function public.touch_user_profiles_updated_at();
