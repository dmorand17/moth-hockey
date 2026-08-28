-- Weeks skipped mid-season (weather, etc.). The skipWeek action shifts the
-- affected games; this table is the human-facing log shown on the schedule.
create table schedule_skips (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  skip_date  date not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- One skip per (season, date).
create unique index schedule_skips_season_date_key
  on schedule_skips (season_id, skip_date);

alter table schedule_skips enable row level security;

-- Public read so the note shows on the public schedule; admins write.
create policy "public read schedule_skips" on schedule_skips
  for select using (true);
create policy "admins write schedule_skips" on schedule_skips
  for all using (public.is_admin()) with check (public.is_admin());
