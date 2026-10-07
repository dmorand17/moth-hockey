-- AI-generated game previews and recaps (#19). One row per (game, kind).
-- Rows are written by the server with the service role (cron + finalize);
-- admins edit or hide them through the app.

create type write_up_kind as enum ('preview', 'recap');

create table game_write_ups (
  game_id      uuid not null references games(id) on delete cascade,
  kind         write_up_kind not null,
  headline     text not null,
  body         text not null,
  model        text not null,
  generated_at timestamptz not null default now(),
  edited_at    timestamptz,
  edited_by    uuid references auth.users(id) on delete set null,
  hidden       boolean not null default false,
  primary key (game_id, kind)
);

alter table game_write_ups enable row level security;

create policy "public read visible write-ups" on game_write_ups for select
  using (not hidden or public.is_admin());

create policy "admins manage write-ups" on game_write_ups for all
  using (public.is_admin())
  with check (public.is_admin());
