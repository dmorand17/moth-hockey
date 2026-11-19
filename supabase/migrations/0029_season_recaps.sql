-- AI season summary for the recap page. Two tables because RLS can't hide a
-- single column: a draft column on a published row would be publicly readable.
--   season_recaps        — the published record (public read while published)
--   season_recap_drafts  — the admin working copy (admins only)
-- `input` is the exact facts JSON sent to the model, for spot-checking.

create table season_recaps (
  season_id uuid primary key references seasons(id) on delete cascade,
  summary_markdown text not null,
  input jsonb not null,
  model text not null,
  generated_at timestamptz not null,
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  published boolean not null default true,
  published_at timestamptz
);

create table season_recap_drafts (
  season_id uuid primary key references seasons(id) on delete cascade,
  draft_markdown text not null,
  input jsonb not null,
  model text not null,
  generated_at timestamptz not null,
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz
);

alter table season_recaps enable row level security;
alter table season_recap_drafts enable row level security;

create policy "public read published recaps" on season_recaps for select
  using (published or public.is_admin());

create policy "admins manage recaps" on season_recaps for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins manage recap drafts" on season_recap_drafts for all
  using (public.is_admin())
  with check (public.is_admin());
