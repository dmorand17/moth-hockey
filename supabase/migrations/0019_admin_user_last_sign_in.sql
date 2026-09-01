-- Expose auth.users.last_sign_in_at to admins for the Users admin view.
-- auth.users isn't readable by the authenticated PostgREST role, so this
-- SECURITY DEFINER function (owned by postgres) reads it and returns just the
-- sign-in timestamp, guarded by is_admin() so only admins can call it.

create or replace function public.admin_user_last_sign_in()
returns table (user_id uuid, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select u.id, u.last_sign_in_at
    from auth.users u;
end;
$$;

revoke all on function public.admin_user_last_sign_in() from public;
grant execute on function public.admin_user_last_sign_in() to authenticated;
