-- T-130: admin user detail — account, roles, progress, skills, login history, actions (F-402).
--
-- "Sessions & devices" and "login history" have no data source in this project today: Supabase's
-- admin API exposes no session/device listing, and nothing recorded sign-in events before this.
-- This adds real login-event history (recorded on every successful sign-in, see
-- src/features/auth/login.ts) and scopes "sessions & devices" down to that history, since a live
-- session/device list is genuinely unavailable through the platform's public API.

create table public.login_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index login_history_user_idx on public.login_history (user_id, created_at desc);
alter table public.login_history enable row level security;

create policy "read own or staff login history" on public.login_history for select to authenticated
  using (user_id = auth.uid() or public.has_permission('user.read_all'));

revoke all on public.login_history from anon, authenticated;
grant select on public.login_history to authenticated;

-- Inserts only ever happen through this security-definer RPC (called right after a successful
-- sign-in), never a raw client insert, so nobody can fabricate history for themselves or anyone
-- else. Silently does nothing when unauthenticated so a caller can never be tricked into recording
-- history for someone they are not.
create function public.record_login(p_ip text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.login_history (user_id, ip_address, user_agent)
  values (auth.uid(), nullif(trim(coalesce(p_ip, '')), ''), nullif(trim(coalesce(p_user_agent, '')), ''));
end;
$$;

revoke all on function public.record_login(text, text) from public, anon;
grant execute on function public.record_login(text, text) to authenticated;

-- One user's account/role summary (same shape as one admin_users() row, minus the page total).
create function public.admin_user_detail(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  roles text[],
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('user.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id,
         u.email::text,
         p.full_name,
         p.status,
         coalesce((select array_agg(ur.role_id order by ur.role_id) from public.user_roles ur where ur.user_id = p.id), '{}'::text[]),
         p.created_at,
         u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_user_id;
end;
$$;
revoke all on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Course progress + skills for an arbitrary user (admin view). Same shape/logic as my_progress(),
-- which is hard-wired to auth.uid() and cannot be reused for another user's data.
create function public.admin_user_progress(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('user.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (
    with mine as (
      select e.id as enrollment_id, e.course_id, e.version_id, e.status
        from public.enrollments e
       where e.user_id = p_user_id and e.status <> 'cancelled'
    ),
    done as (
      select lp.completed_at, l.duration_minutes, m.course_id, m.enrollment_id
        from mine m
        join public.lesson_progress lp on lp.enrollment_id = m.enrollment_id and lp.completed_at is not null
        join public.lessons l on l.id = lp.lesson_id
    )
    select jsonb_build_object(
      'minutes', coalesce((select sum(duration_minutes) from done), 0),
      'lessons_completed', (select count(*) from done),
      'active_days', coalesce((
        select jsonb_agg(d order by d desc)
          from (select distinct (completed_at at time zone 'UTC')::date as d
                  from done
                 where completed_at > now() - interval '400 days') x
      ), '[]'::jsonb),
      'courses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'course_id', c.id,
          'slug', c.slug,
          'title', v.title,
          'category', cat.name,
          'status', m.status,
          'total_lessons', (select count(*) from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = m.version_id),
          'completed_lessons', (select count(*) from done d where d.enrollment_id = m.enrollment_id),
          'minutes', coalesce((select sum(d.duration_minutes) from done d where d.enrollment_id = m.enrollment_id), 0)
        ) order by v.title)
          from mine m
          join public.courses c on c.id = m.course_id
          join public.course_versions v on v.id = m.version_id
          left join public.categories cat on cat.id = c.category_id
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.admin_user_progress(uuid) from public, anon;
grant execute on function public.admin_user_progress(uuid) to authenticated;
