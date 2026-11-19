-- Season recap media gallery: photos, videos and PDFs stored in Vercel Blob.
-- The file lives in Blob; this row is the record (who, order, caption).
-- Public read; only admins add, edit, reorder or delete.

create table season_media (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  blob_url text not null,
  pathname text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  width int,
  height int,
  caption text not null default '' check (char_length(caption) <= 300),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sort_order int not null default 0
);

create index season_media_season_order on season_media (season_id, sort_order);

alter table season_media enable row level security;

create policy "public read season media" on season_media for select
  using (true);

create policy "admins manage season media" on season_media for all
  using (public.is_admin())
  with check (public.is_admin());
