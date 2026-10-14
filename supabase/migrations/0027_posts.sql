-- Message board (#140). One table for the site board (game_id is null) and
-- per-game threads. Threads are one level deep: replies point at a top-level
-- post. Anyone can read; only users linked to a roster player can post.

create table posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users(id) on delete cascade,
  game_id    uuid references games(id) on delete cascade,
  parent_id  uuid references posts(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index posts_feed_idx    on posts (game_id, parent_id, created_at desc);
create index posts_replies_idx on posts (parent_id, created_at);
create index posts_author_idx  on posts (author_id, created_at desc);

-- True when the caller is linked to a roster player.
create or replace function public.is_linked_player()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from players where user_id = auth.uid());
$$;

-- One-level threading + per-user rate limit.
create or replace function public.posts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent posts%rowtype;
begin
  -- Serialize per-author inserts so concurrent requests can't race past the rate limit.
  perform pg_advisory_xact_lock(hashtext(new.author_id::text));

  -- Server controls timestamps; clients cannot pin posts or bypass rate limit via created_at.
  new.created_at := now();
  new.edited_at  := null;

  -- Normalize whitespace before the check constraint is evaluated.
  new.body := btrim(new.body, E' \t\r\n');

  if new.parent_id is not null then
    select * into parent from posts where id = new.parent_id;
    if not found
       or parent.parent_id is not null
       or parent.game_id is distinct from new.game_id then
      raise exception 'posts_invalid_parent';
    end if;
  end if;

  if (select count(*) from posts
        where author_id = new.author_id
          and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from posts
        where author_id = new.author_id
          and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'posts_rate_limited';
  end if;

  return new;
end;
$$;

create trigger posts_before_insert
  before insert on posts
  for each row execute function public.posts_before_insert();

-- Only the body is editable; edited_at is managed here.
create or replace function public.posts_before_update()
returns trigger
language plpgsql
as $$
begin
  if (new.id        is distinct from old.id        or
      new.author_id is distinct from old.author_id or
      new.game_id   is distinct from old.game_id   or
      new.parent_id is distinct from old.parent_id or
      new.created_at is distinct from old.created_at) then
    raise exception 'posts_immutable_column';
  end if;

  -- Normalize whitespace before comparing body for edited_at.
  new.body := btrim(new.body, E' \t\r\n');

  if new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

create trigger posts_before_update
  before update on posts
  for each row execute function public.posts_before_update();

alter table posts enable row level security;

create policy "public read posts" on posts for select
  using (true);

create policy "linked players create posts" on posts for insert
  with check (author_id = auth.uid() and public.is_linked_player());

create policy "authors and admins edit posts" on posts for update
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "admins delete posts" on posts for delete
  using (public.is_admin());
