-- M.O.T.H Hockey seed data
-- 1 current season, 4 teams, 36 players (8 skaters + 1 goalie each),
-- a mix of scheduled and completed games with realistic events
-- (regulation, OT, and shootout coverage).

-- ---------- dev auth users ----------
-- Deterministic local accounts recreated on every `supabase db reset`, so the
-- same logins always work. Magic-link only: email is pre-confirmed and password
-- is null — sign in at /login, then click the link in Mailpit (:54324).
--   admin@moth.test       → admin
--   scorekeeper@moth.test → scorekeeper
--   player@moth.test      → player (normal user)
-- The on_auth_user_created trigger (migration 0004) auto-creates each user's
-- user_profiles row + a default 'player' user_roles row; the explicit upsert
-- below overrides the role. Token columns are '' (not null) to avoid gotrue
-- scan errors on login. seed.sql never runs against prod — local only.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '7d01ac6b-7077-45c2-8b1c-41e7b15e7f41',
   'authenticated', 'authenticated', 'admin@moth.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Test Admin"}', now(), now(),
   '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'scorekeeper@moth.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Test Scorekeeper"}', now(), now(),
   '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'player@moth.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Test Player"}', now(), now(),
   '', '', '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (gen_random_uuid(), '7d01ac6b-7077-45c2-8b1c-41e7b15e7f41', '7d01ac6b-7077-45c2-8b1c-41e7b15e7f41',
   '{"sub":"7d01ac6b-7077-45c2-8b1c-41e7b15e7f41","email":"admin@moth.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002',
   '{"sub":"f0000000-0000-0000-0000-000000000002","email":"scorekeeper@moth.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), 'f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003',
   '{"sub":"f0000000-0000-0000-0000-000000000003","email":"player@moth.test"}', 'email', now(), now(), now())
on conflict do nothing;

insert into public.user_roles (user_id, role) values
  ('7d01ac6b-7077-45c2-8b1c-41e7b15e7f41', 'admin'),
  ('f0000000-0000-0000-0000-000000000002', 'scorekeeper'),
  ('f0000000-0000-0000-0000-000000000003', 'player')
on conflict (user_id) do update set role = excluded.role;

-- ---------- seasons ----------
-- Past seasons exist only as aggregated season_player_stats rows (no games / events).
-- Current season has live games + events; stats derive from those.
insert into seasons (id, season_type, year, name, start_date, end_date, is_current) values
  ('00000000-0000-0000-0000-000000000aaa', 'fall',   2025, 'Fall 2025',         '2025-09-01', '2025-12-15', false),
  ('00000000-0000-0000-0000-000000000bbb', 'winter', 2026, 'Winter 2025-26',    '2025-12-20', '2026-02-28', false),
  ('00000000-0000-0000-0000-000000000001', 'spring', 2026, 'Spring 2026',       '2026-03-01', '2026-06-30', true);

-- ---------- teams ----------
insert into teams (id, season_id, name, slug, color) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ice Holes',     'ice-holes',     '#ef4444'),  -- red
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Puck Dynasty',  'puck-dynasty',  '#3b82f6'),  -- blue
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Slap Happy',    'slap-happy',    '#22c55e'),  -- green
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Net Results',   'net-results',   '#a855f7');  -- purple

-- ---------- players ----------
-- Ice Holes (team 1)
insert into players (id, first_name, last_name) values
  ('20000000-0000-0000-0000-000000000101', 'Doug',    'Morand'),
  ('20000000-0000-0000-0000-000000000102', 'Wayne',   'Gretzky'),
  ('20000000-0000-0000-0000-000000000103', 'Mark',    'Messier'),
  ('20000000-0000-0000-0000-000000000104', 'Paul',    'Coffey'),
  ('20000000-0000-0000-0000-000000000105', 'Jari',    'Kurri'),
  ('20000000-0000-0000-0000-000000000106', 'Glenn',   'Anderson'),
  ('20000000-0000-0000-0000-000000000107', 'Esa',     'Tikkanen'),
  ('20000000-0000-0000-0000-000000000108', 'Kevin',   'Lowe'),
  ('20000000-0000-0000-0000-000000000109', 'Grant',   'Fuhr');         -- goalie

-- Puck Dynasty (team 2)
insert into players (id, first_name, last_name) values
  ('20000000-0000-0000-0000-000000000201', 'Mario',   'Lemieux'),
  ('20000000-0000-0000-0000-000000000202', 'Jaromir', 'Jagr'),
  ('20000000-0000-0000-0000-000000000203', 'Ron',     'Francis'),
  ('20000000-0000-0000-0000-000000000204', 'Larry',   'Murphy'),
  ('20000000-0000-0000-0000-000000000205', 'Kevin',   'Stevens'),
  ('20000000-0000-0000-0000-000000000206', 'Joe',     'Mullen'),
  ('20000000-0000-0000-0000-000000000207', 'Ulf',     'Samuelsson'),
  ('20000000-0000-0000-0000-000000000208', 'Bryan',   'Trottier'),
  ('20000000-0000-0000-0000-000000000209', 'Tom',     'Barrasso');     -- goalie

-- Slap Happy (team 3)
insert into players (id, first_name, last_name) values
  ('20000000-0000-0000-0000-000000000301', 'Steve',   'Yzerman'),
  ('20000000-0000-0000-0000-000000000302', 'Sergei',  'Fedorov'),
  ('20000000-0000-0000-0000-000000000303', 'Brendan', 'Shanahan'),
  ('20000000-0000-0000-0000-000000000304', 'Nicklas', 'Lidstrom'),
  ('20000000-0000-0000-0000-000000000305', 'Igor',    'Larionov'),
  ('20000000-0000-0000-0000-000000000306', 'Slava',   'Kozlov'),
  ('20000000-0000-0000-0000-000000000307', 'Kris',    'Draper'),
  ('20000000-0000-0000-0000-000000000308', 'Darren',  'McCarty'),
  ('20000000-0000-0000-0000-000000000309', 'Chris',   'Osgood');       -- goalie

-- Net Results (team 4)
insert into players (id, first_name, last_name) values
  ('20000000-0000-0000-0000-000000000401', 'Joe',     'Sakic'),
  ('20000000-0000-0000-0000-000000000402', 'Peter',   'Forsberg'),
  ('20000000-0000-0000-0000-000000000403', 'Milan',   'Hejduk'),
  ('20000000-0000-0000-0000-000000000404', 'Rob',     'Blake'),
  ('20000000-0000-0000-0000-000000000405', 'Adam',    'Foote'),
  ('20000000-0000-0000-0000-000000000406', 'Alex',    'Tanguay'),
  ('20000000-0000-0000-0000-000000000407', 'Chris',   'Drury'),
  ('20000000-0000-0000-0000-000000000408', 'Ray',     'Bourque'),
  ('20000000-0000-0000-0000-000000000409', 'Patrick', 'Roy'),          -- goalie
  ('20000000-0000-0000-0000-00000000040a', 'Joe',     'Melanson');

-- ---------- team_players (rosters) ----------
-- Helper macro: jersey numbers 7..14 for skaters, 30 for goalie
insert into team_players (team_id, player_id, season_id, jersey_number, position) values
  -- Ice Holes
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001',  7, 'forward'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 99, 'forward'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 11, 'forward'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001',  7, 'defense'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 17, 'forward'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001',  9, 'forward'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', 10, 'defense'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000001',  4, 'defense'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000001', 31, 'goalie'),

  -- Puck Dynasty (Lemieux, Jagr, Francis, Stevens, Mullen forwards; Murphy, Samuelsson, Trottier defense)
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 66, 'forward'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 68, 'forward'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001', 10, 'forward'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000001', 55, 'defense'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000001', 25, 'forward'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000001',  7, 'forward'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000001',  5, 'defense'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000001', 19, 'defense'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000001', 35, 'goalie'),

  -- Slap Happy (Yzerman, Fedorov, Shanahan, Larionov, Kozlov forwards; Lidstrom, Draper, McCarty mixed)
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 19, 'forward'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 91, 'forward'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 14, 'forward'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001',  5, 'defense'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000001',  8, 'forward'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000001', 13, 'forward'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000001', 33, 'defense'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000308', '00000000-0000-0000-0000-000000000001', 25, 'defense'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000309', '00000000-0000-0000-0000-000000000001', 30, 'goalie'),

  -- Net Results (Sakic, Forsberg, Hejduk, Melanson, Drury forwards; Blake, Foote, Bourque defense)
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 19, 'forward'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', 21, 'forward'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', 23, 'forward'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000001',  4, 'defense'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000001', 52, 'defense'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000040a', '00000000-0000-0000-0000-000000000001', 40, 'forward'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000001', 37, 'forward'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000001', 77, 'defense'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000409', '00000000-0000-0000-0000-000000000001', 33, 'goalie');

-- ---------- games ----------
-- Two completed regular-season games (regulation + OT)
-- One completed playoff game (shootout)
-- Two scheduled (future)
insert into games (id, season_id, home_team_id, away_team_id, scheduled_at, location, status,
                   home_score, away_score, period, clock_seconds, decided_in,
                   shootout_home_goals, shootout_away_goals, kind) values
  -- Game 1: Ice Holes 3, Puck Dynasty 2 (regulation)
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
   '2026-03-15 19:30:00-04', 'Rink 1', 'final',
   3, 2, 3, 0, 'regulation', null, null, 'regular'),

  -- Game 2: Slap Happy 4, Net Results 3 (OT)
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
   '2026-03-22 20:00:00-04', 'Rink 1', 'final',
   4, 3, 4, 0, 'ot', null, null, 'regular'),

  -- Game 3: Ice Holes 3, Slap Happy 2 (shootout — playoff)
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
   '2026-04-05 19:30:00-04', 'Rink 2', 'final',
   3, 2, 5, 0, 'shootout', 2, 1, 'playoff'),

  -- Game 4: scheduled
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004',
   '2026-05-28 20:00:00-04', 'Rink 1', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),

  -- Game 5: scheduled
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '2026-06-04 19:30:00-04', 'Rink 2', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),

  -- Games 6-11: extra scheduled games to exercise the scorekeeper UI.
  -- Cover all 6 unique team matchups so any pairing can be tested.
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
   '2026-06-11 19:30:00-04', 'Rink 1', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
   '2026-06-11 21:00:00-04', 'Rink 2', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '2026-06-18 19:30:00-04', 'Rink 1', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004',
   '2026-06-18 21:00:00-04', 'Rink 2', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
   '2026-06-25 19:30:00-04', 'Rink 1', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
   '2026-06-25 21:00:00-04', 'Rink 2', 'scheduled',
   0, 0, 1, 1020, null, null, null, 'regular'),

  -- Game 12: pre-flipped to LIVE so we can jump straight into live scoring.
  -- P1, 14:32 on the clock. Appearances seeded below.
  ('30000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004',
   '2026-05-24 19:30:00-04', 'Rink 1', 'live',
   0, 0, 1, 872, null, null, null, 'regular');

-- ---------- game_appearances ----------
-- Game 1 (Ice Holes vs Puck Dynasty) — full rosters played, no subs
insert into game_appearances (game_id, player_id, team_id, is_sub)
select '30000000-0000-0000-0000-000000000001', tp.player_id, tp.team_id, false
from team_players tp
where tp.team_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

-- Game 2 (Slap Happy vs Net Results)
insert into game_appearances (game_id, player_id, team_id, is_sub)
select '30000000-0000-0000-0000-000000000002', tp.player_id, tp.team_id, false
from team_players tp
where tp.team_id in ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');

-- Game 3 (Ice Holes vs Slap Happy)
insert into game_appearances (game_id, player_id, team_id, is_sub)
select '30000000-0000-0000-0000-000000000003', tp.player_id, tp.team_id, false
from team_players tp
where tp.team_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');

-- Game 12 (Ice Holes vs Net Results) — LIVE testbed game.
-- Full season rosters checked in, no events yet.
insert into game_appearances (game_id, player_id, team_id, is_sub)
select '30000000-0000-0000-0000-00000000000c', tp.player_id, tp.team_id, false
from team_players tp
where tp.team_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004');

-- ---------- game_events ----------

-- Game 1: Ice Holes 3, Puck Dynasty 2 (regulation).
-- IH: 2 regular goals + 1 penalty-shot goal = 3. PD: 2 regular goals.
insert into game_events (game_id, period, clock_seconds, type, team_id, player_id, assist1_player_id, assist2_player_id) values
  -- P1 — Gretzky goal, Kurri assist
  ('30000000-0000-0000-0000-000000000001', 1, 503, 'goal', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000105', null),
  -- P1 — Lemieux goal, Jagr + Francis assists
  ('30000000-0000-0000-0000-000000000001', 1, 270, 'goal', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000203'),
  -- P2 — Messier goal, unassisted
  ('30000000-0000-0000-0000-000000000001', 2, 725, 'goal', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000103', null, null),
  -- P2 — Jagr goal, Lemieux assist
  ('30000000-0000-0000-0000-000000000001', 2, 178, 'goal', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000201', null);

-- Game 1 penalty: Samuelsson (PD) tripping, Gretzky takes the shot, scores.
-- Penalty-shot goals count toward the team total — this is the IH game-winner.
insert into game_events (game_id, period, clock_seconds, type, team_id, player_id, penalty_type, penalty_shot_result, penalty_shot_taker_id) values
  ('30000000-0000-0000-0000-000000000001', 3, 600, 'penalty', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000207', 'tripping', 'goal', '20000000-0000-0000-0000-000000000102');

-- Game 2: Slap Happy 4, Net Results 3 (OT). 3 SH goals, 3 NR goals in regulation, then OT winner.
insert into game_events (game_id, period, clock_seconds, type, team_id, player_id, assist1_player_id, assist2_player_id) values
  -- P1 — Yzerman, Fedorov, Lidstrom assist
  ('30000000-0000-0000-0000-000000000002', 1, 600, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000302', '20000000-0000-0000-0000-000000000304'),
  -- P1 — Sakic
  ('30000000-0000-0000-0000-000000000002', 1, 220, 'goal', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000401', null, null),
  -- P2 — Forsberg, Hejduk assist
  ('30000000-0000-0000-0000-000000000002', 2, 700, 'goal', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000402', '20000000-0000-0000-0000-000000000403', null),
  -- P2 — Shanahan, Yzerman assist
  ('30000000-0000-0000-0000-000000000002', 2, 250, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000303', '20000000-0000-0000-0000-000000000301', null),
  -- P3 — Fedorov, Larionov + Kozlov assists
  ('30000000-0000-0000-0000-000000000002', 3, 800, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000302', '20000000-0000-0000-0000-000000000305', '20000000-0000-0000-0000-000000000306'),
  -- P3 — Drury, Bourque assist
  ('30000000-0000-0000-0000-000000000002', 3, 120, 'goal', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000407', '20000000-0000-0000-0000-000000000408', null),
  -- OT — Lidstrom GWG, Yzerman assist
  ('30000000-0000-0000-0000-000000000002', 4, 200, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000304', '20000000-0000-0000-0000-000000000301', null);

-- Game 3: Ice Holes 3, Slap Happy 2 (shootout — IH wins). Regulation 2-2, no OT goal, SO 2-1.
insert into game_events (game_id, period, clock_seconds, type, team_id, player_id, assist1_player_id, assist2_player_id) values
  -- P1 — Gretzky, Kurri assist
  ('30000000-0000-0000-0000-000000000003', 1, 540, 'goal', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000105', null),
  -- P2 — Yzerman
  ('30000000-0000-0000-0000-000000000003', 2, 700, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000301', null, null),
  -- P2 — Messier, Coffey assist
  ('30000000-0000-0000-0000-000000000003', 2, 240, 'goal', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000104', null),
  -- P3 — Shanahan, Fedorov assist
  ('30000000-0000-0000-0000-000000000003', 3, 360, 'goal', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000303', '20000000-0000-0000-0000-000000000302', null);

-- Game 3 penalty in P2: McCarty (Slap Happy) hooking, Anderson takes shot, saved
insert into game_events (game_id, period, clock_seconds, type, team_id, player_id, penalty_type, penalty_shot_result, penalty_shot_taker_id) values
  ('30000000-0000-0000-0000-000000000003', 2, 480, 'penalty', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000308', 'hooking', 'saved', '20000000-0000-0000-0000-000000000106');

-- ---------- content_pages ----------
insert into content_pages (section, slug, title, body_md, sort_order) values
  ('rules', 'overview', 'Overview', 'Rules content goes here.', 0),
  ('faq', 'overview', 'Frequently Asked Questions', 'FAQ content goes here.', 0),
  ('league', 'overview', 'About M.O.T.H Hockey', 'Mostly Over The Hill hockey — league details go here.', 0);

-- ---------- season_player_stats (historical) ----------
-- Mock previous-season totals. team_id is null because past seasons' team rows
-- don't exist (we'd backfill them via CSV import in real use).
-- Skater stat schema:
--   (season_id, player_id, team_id, position, gp, g, a, pen, ps_taken, ps_made, ga, psf, psv)

-- Wayne Gretzky (forward, Ice Holes lineage) — played both past seasons
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000102', 'forward', 12, 14, 18, 1, 2, 2),
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000102', 'forward', 10,  9, 15, 0, 1, 1);

-- Mark Messier — both past seasons
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000103', 'forward', 12,  8, 11, 4, 0, 0),
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000103', 'forward', 11,  6,  9, 3, 0, 0);

-- Jari Kurri — only Winter (skipped Fall)
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000105', 'forward', 10,  7, 10, 1, 1, 0);

-- Mario Lemieux — both past seasons
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000201', 'forward', 11, 12, 17, 0, 1, 1),
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000201', 'forward', 12, 10, 19, 1, 2, 1);

-- Jaromir Jagr — only Fall
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000202', 'forward', 12, 11, 13, 2, 1, 1);

-- Steve Yzerman — both past seasons
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000301', 'forward', 12, 10, 16, 1, 0, 0),
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000301', 'forward', 11,  9, 14, 0, 1, 1);

-- Joe Sakic — only Winter
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made) values
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000401', 'forward', 11, 11, 13, 1, 1, 1);

-- Goalies — Grant Fuhr (Ice Holes): both past seasons
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000109', 'goalie', 12, 0, 0, 0, 0, 0, 28, 5, 3),
  ('00000000-0000-0000-0000-000000000bbb', '20000000-0000-0000-0000-000000000109', 'goalie', 11, 0, 1, 0, 0, 0, 24, 4, 2);

-- Patrick Roy (Net Results): only Fall
insert into season_player_stats (season_id, player_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved) values
  ('00000000-0000-0000-0000-000000000aaa', '20000000-0000-0000-0000-000000000409', 'goalie', 12, 0, 0, 0, 0, 0, 22, 6, 5);

-- ---------- player_awards ----------
-- Award types: champion (team won), mvp (most points), mvd (most points - defenseman), goon (most penalties)
insert into player_awards (player_id, season_id, award_type) values
  -- Wayne Gretzky: MVP Fall 2025 + MVP Winter 2025-26, Champion Winter
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000aaa', 'mvp'),
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000bbb', 'mvp'),
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000bbb', 'champion'),
  -- Mario Lemieux: Champion Fall 2025
  ('20000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000aaa', 'champion'),
  -- Paul Coffey (Ice Holes defense): MVD Fall 2025
  ('20000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000aaa', 'mvd'),
  -- Nicklas Lidstrom (Slap Happy defense): MVD Winter 2025-26
  ('20000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000bbb', 'mvd'),
  -- Ulf Samuelsson: Goon Fall 2025
  ('20000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000aaa', 'goon'),
  -- Darren McCarty: Goon Winter 2025-26
  ('20000000-0000-0000-0000-000000000308', '00000000-0000-0000-0000-000000000bbb', 'goon'),
  -- Wayne Gretzky: Sniper both past seasons + Most Hat Tricks Fall 2025
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000aaa', 'sniper'),
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000bbb', 'sniper'),
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000aaa', 'most_hat_tricks'),
  -- Mario Lemieux: Playmaker both past seasons
  ('20000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000aaa', 'playmaker'),
  ('20000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000bbb', 'playmaker'),
  -- Grant Fuhr: Vezina + Iron Man Fall 2025; Vezina Winter 2025-26
  ('20000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000aaa', 'vezina'),
  ('20000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000aaa', 'iron_man'),
  ('20000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000bbb', 'vezina'),
  -- Steve Yzerman: Iron Man Winter 2025-26
  ('20000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000bbb', 'iron_man');
