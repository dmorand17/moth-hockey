-- M.O.T.H Hockey — initial schema
-- Mirrors docs/PLAN.md. Phase 1 schema with photo_url / logo_url columns
-- already in place (unused until Phase 2).

-- =============================================================================
-- ENUMS
-- =============================================================================

create type season_type as enum ('spring', 'fall', 'winter');
create type player_position as enum ('forward', 'defense', 'goalie');
create type game_status as enum ('scheduled', 'live', 'final');
create type game_decided_in as enum ('regulation', 'ot', 'shootout');
create type game_event_type as enum ('goal', 'penalty');
create type penalty_shot_result as enum ('goal', 'saved');
create type content_section as enum ('rules', 'faq', 'league');
create type account_request_status as enum ('pending', 'approved', 'denied');
create type user_role as enum ('admin', 'scorer');

-- =============================================================================
-- CORE TABLES
-- =============================================================================

create table seasons (
  id           uuid primary key default gen_random_uuid(),
  season_type  season_type not null,
  year         int not null,
  name         text not null,         -- e.g. "Spring 2026"
  start_date   date not null,
  end_date     date not null,
  is_current   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (season_type, year)
);

create unique index seasons_one_current_idx
  on seasons (is_current) where is_current;

create table teams (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null,
  slug       text not null,
  logo_url   text,
  color      text not null,
  created_at timestamptz not null default now(),
  unique (season_id, slug),
  unique (season_id, name)
);

create index teams_season_idx on teams (season_id);

create table players (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  photo_url  text,
  created_at timestamptz not null default now()
);

create index players_name_idx on players (last_name, first_name);

create table team_players (
  team_id        uuid not null references teams(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  season_id      uuid not null references seasons(id) on delete cascade,
  jersey_number  int,
  position       player_position not null default 'forward',
  primary key (team_id, player_id)
);

create index team_players_player_idx on team_players (player_id);
create index team_players_season_idx on team_players (season_id);

-- =============================================================================
-- GAMES & EVENTS
-- =============================================================================

create table games (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid not null references seasons(id) on delete cascade,
  home_team_id        uuid not null references teams(id),
  away_team_id        uuid not null references teams(id),
  scheduled_at        timestamptz not null,
  location            text,
  status              game_status not null default 'scheduled',
  home_score          int not null default 0,
  away_score          int not null default 0,
  period              int not null default 1,
  clock_seconds       int not null default 1020,  -- 17:00 default per period
  decided_in          game_decided_in,             -- null until status='final'
  shootout_home_goals int,
  shootout_away_goals int,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create index games_season_idx on games (season_id);
create index games_scheduled_idx on games (scheduled_at);
create index games_home_team_idx on games (home_team_id);
create index games_away_team_idx on games (away_team_id);

create table game_appearances (
  game_id   uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id   uuid not null references teams(id),
  is_sub    boolean not null default false,
  primary key (game_id, player_id)
);

create index game_appearances_player_idx on game_appearances (player_id);
create index game_appearances_team_idx on game_appearances (team_id);

create table game_events (
  id                       uuid primary key default gen_random_uuid(),
  game_id                  uuid not null references games(id) on delete cascade,
  period                   int not null,
  clock_seconds            int not null,
  type                     game_event_type not null,
  team_id                  uuid not null references teams(id),
  player_id                uuid references players(id),
  assist1_player_id        uuid references players(id),
  assist2_player_id        uuid references players(id),
  -- penalty-specific fields:
  penalty_type             text,                -- e.g. 'tripping', 'hooking', 'other'
  penalty_type_other       text,                -- free-text when penalty_type = 'other'
  penalty_shot_result      penalty_shot_result, -- goal | saved
  penalty_shot_taker_id    uuid references players(id),
  notes                    text,
  created_at               timestamptz not null default now(),

  -- structural constraints per event type
  check (
    (type = 'goal' and player_id is not null
       and penalty_type is null
       and penalty_shot_result is null
       and penalty_shot_taker_id is null)
    or
    (type = 'penalty' and player_id is not null
       and penalty_type is not null
       and penalty_shot_result is not null
       and penalty_shot_taker_id is not null
       and assist1_player_id is null
       and assist2_player_id is null)
  )
);

create index game_events_game_idx on game_events (game_id);
create index game_events_player_idx on game_events (player_id);
create index game_events_team_idx on game_events (team_id);
create index game_events_assist1_idx on game_events (assist1_player_id);
create index game_events_assist2_idx on game_events (assist2_player_id);

-- =============================================================================
-- CONTENT (rules / faq / league details)
-- =============================================================================

-- Pre-aggregated per-season stats for historical seasons imported via CSV.
-- Current/live seasons derive stats from game_events; historical seasons
-- without underlying events live here. The player profile page unions both.
create table season_player_stats (
  season_id            uuid not null references seasons(id) on delete cascade,
  player_id            uuid not null references players(id) on delete cascade,
  team_id              uuid references teams(id),
  position             player_position not null default 'forward',
  games_played         int not null default 0,
  goals                int not null default 0,
  assists              int not null default 0,
  penalties            int not null default 0,
  penalty_shots_taken  int not null default 0,
  penalty_shots_made   int not null default 0,
  -- goalie-only (nullable for skaters)
  goals_against        int,
  penalty_shots_faced  int,
  penalty_shots_saved  int,
  primary key (season_id, player_id)
);

create index season_player_stats_player_idx on season_player_stats (player_id);

-- End-of-season awards for individual players. Repeatable across seasons —
-- e.g. a player can have multiple "Champion" rows (one per championship season).
-- Display style: "Champion ×3", "Top Scorer ×2", etc.
create table player_awards (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  season_id   uuid references seasons(id) on delete set null,
  award_type  text not null,                -- e.g. 'champion', 'top_scorer', 'top_goalie', 'most_penalties', 'mvp'
  notes       text,
  created_at  timestamptz not null default now()
);

create index player_awards_player_idx on player_awards (player_id);
create index player_awards_type_idx on player_awards (award_type);

create table content_pages (
  id         uuid primary key default gen_random_uuid(),
  section    content_section not null,
  slug       text not null,
  title      text not null,
  body_md    text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (section, slug)
);

create index content_pages_section_idx on content_pages (section, sort_order);

-- =============================================================================
-- AUTH SUPPORT (account requests + role mapping)
-- =============================================================================

-- Maps a Supabase auth user to a role. RLS policies key off this.
create table user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       user_role not null,
  created_at timestamptz not null default now()
);

create table account_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  full_name   text not null,
  reason      text,
  status      account_request_status not null default 'pending',
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index account_requests_status_idx on account_requests (status, created_at);

-- =============================================================================
-- HELPER FUNCTIONS for RLS
-- =============================================================================

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.user_roles where user_id = auth.uid()), false);
$$;

create or replace function public.is_scorer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'scorer') from public.user_roles where user_id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table seasons          enable row level security;
alter table teams            enable row level security;
alter table players          enable row level security;
alter table team_players     enable row level security;
alter table games            enable row level security;
alter table game_appearances enable row level security;
alter table game_events      enable row level security;
alter table content_pages    enable row level security;
alter table season_player_stats enable row level security;
alter table player_awards    enable row level security;
alter table user_roles       enable row level security;
alter table account_requests enable row level security;

-- Public read for everything that powers the public site
create policy "public read seasons"          on seasons          for select using (true);
create policy "public read teams"            on teams            for select using (true);
create policy "public read players"          on players          for select using (true);
create policy "public read team_players"     on team_players     for select using (true);
create policy "public read games"            on games            for select using (true);
create policy "public read game_appearances" on game_appearances for select using (true);
create policy "public read game_events"      on game_events      for select using (true);
create policy "public read content_pages"    on content_pages    for select using (true);
create policy "public read season_player_stats" on season_player_stats for select using (true);
create policy "public read player_awards"   on player_awards    for select using (true);

-- user_roles: only the user can see their own row; admins see all
create policy "users see own role" on user_roles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "admins manage roles" on user_roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- account_requests: anonymous can INSERT (request access); only admins read/update
create policy "anyone can request access" on account_requests for insert
  with check (true);

create policy "admins read account_requests" on account_requests for select
  using (public.is_admin());

create policy "admins update account_requests" on account_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- Admin write everywhere
create policy "admins write seasons"       on seasons       for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write teams"         on teams         for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write players"       on players       for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write team_players"  on team_players  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write games"         on games         for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write content_pages" on content_pages for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write season_player_stats" on season_player_stats for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write player_awards"   on player_awards   for all using (public.is_admin()) with check (public.is_admin());

-- Scorers can manage live games:
--   - INSERT/UPDATE/DELETE game_appearances and game_events for any 'live' game
--   - UPDATE games (clock, score, period) for any 'live' game
--   - Scorers can also create on-the-fly sub players (INSERT into players)
--   - Once a game is 'final', only admins can edit.

create policy "scorers insert players" on players for insert
  with check (public.is_scorer_or_admin());

create policy "scorers update live games" on games for update
  using (public.is_scorer_or_admin() and (status = 'live' or public.is_admin()))
  with check (public.is_scorer_or_admin());

create policy "scorers manage appearances on live games" on game_appearances for all
  using (
    public.is_scorer_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_appearances.game_id and g.status = 'live'
    ))
  )
  with check (
    public.is_scorer_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_appearances.game_id and g.status = 'live'
    ))
  );

create policy "scorers manage events on live games" on game_events for all
  using (
    public.is_scorer_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_events.game_id and g.status = 'live'
    ))
  )
  with check (
    public.is_scorer_or_admin()
    and (public.is_admin() or exists (
      select 1 from games g where g.id = game_events.game_id and g.status = 'live'
    ))
  );

-- =============================================================================
-- TRIGGERS
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_touch_updated_at
  before update on games
  for each row execute function public.touch_updated_at();

create or replace function public.touch_content_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_pages_touch_updated_at
  before update on content_pages
  for each row execute function public.touch_content_pages_updated_at();
