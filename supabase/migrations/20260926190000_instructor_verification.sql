-- T-131: instructor management & verification (F-403) — apply-to-teach flow, verification queue,
-- instructor list, top instructors.

create table public.instructor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
-- Only one open application per user at a time; a resolved one does not block reapplying.
create unique index instructor_applications_one_pending on public.instructor_applications (user_id) where status = 'pending';
create index instructor_applications_status_idx on public.instructor_applications (status, created_at desc);
alter table public.instructor_applications enable row level security;

create policy "read own or staff applications" on public.instructor_applications for select to authenticated
  using (user_id = auth.uid() or public.has_permission('user.read_all'));

-- A user may apply for themselves only, and only while they hold no instructor role and have no
-- other application already pending (the partial unique index above enforces the second part).
create policy "apply for own account" on public.instructor_applications for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role_id = 'instructor')
  );

revoke all on public.instructor_applications from anon, authenticated;
grant select, insert on public.instructor_applications to authenticated;

-- Approve grants the instructor role (additive; never touches other roles); reject just records
-- the decision. Row-locked so two reviewers cannot both act on the same application.
create function public.review_instructor_application(p_application_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  if not public.has_permission('user.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select user_id, status into v_user_id, v_status
    from public.instructor_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'application has already been reviewed' using errcode = '22023';
  end if;

  update public.instructor_applications
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_application_id;

  if p_decision = 'approved' then
    insert into public.user_roles (user_id, role_id) values (v_user_id, 'instructor')
    on conflict (user_id, role_id) do nothing;
  end if;
end;
$$;

revoke all on function public.review_instructor_application(uuid, text, text) from public, anon;
grant execute on function public.review_instructor_application(uuid, text, text) to authenticated;

-- Verification queue listing (pending by default), with the applicant's display name/email.
create function public.admin_instructor_applications(p_status text default 'pending')
returns table (
  id uuid,
  user_id uuid,
  applicant_name text,
  applicant_email text,
  message text,
  status text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz
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
  select a.id, a.user_id, p.full_name, u.email::text, a.message, a.status,
         r.full_name, a.reviewed_at, a.review_note, a.created_at
    from public.instructor_applications a
    join public.profiles p on p.id = a.user_id
    join auth.users u on u.id = a.user_id
    left join public.profiles r on r.id = a.reviewed_by
   where coalesce(p_status, '') = '' or a.status = p_status
   order by a.created_at desc;
end;
$$;

revoke all on function public.admin_instructor_applications(text) from public, anon;
grant execute on function public.admin_instructor_applications(text) to authenticated;

-- Every instructor with their course/learner/rating stats, for the list and "top instructors."
-- p_sort: 'top' orders by total learners desc (the closest real proxy to "top" without revenue
-- data, which the Commerce phase has not built yet), 'newest' by join date.
create function public.admin_instructors(p_q text default '', p_sort text default 'top', p_limit int default 25, p_offset int default 0)
returns table (
  user_id uuid,
  full_name text,
  email text,
  course_count bigint,
  published_course_count bigint,
  total_learners bigint,
  rating_avg numeric,
  created_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
begin
  if not public.has_permission('user.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with stats as (
    select p.id as user_id, p.full_name, u.email::text as email, p.created_at,
           count(distinct c.id) as course_count,
           count(distinct c.id) filter (where c.published_version_id is not null) as published_course_count,
           coalesce(count(distinct e.id), 0) as total_learners,
           coalesce(round(avg(c.rating_avg) filter (where c.rating_count > 0), 2), 0) as rating_avg
      from public.profiles p
      join auth.users u on u.id = p.id
      join public.user_roles ur on ur.user_id = p.id and ur.role_id = 'instructor'
      left join public.courses c on c.instructor_id = p.id
      left join public.enrollments e on e.course_id = c.id and e.status <> 'cancelled'
     where v_q = '' or lower(u.email) like '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
        or lower(coalesce(p.full_name, '')) like '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
     group by p.id, p.full_name, u.email, p.created_at
  )
  select s.user_id, s.full_name, s.email, s.course_count, s.published_course_count,
         s.total_learners, s.rating_avg, s.created_at, count(*) over () as total
    from stats s
   order by
     case when p_sort = 'newest' then s.created_at end desc nulls last,
     case when p_sort <> 'newest' then s.total_learners end desc nulls last,
     s.full_name
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_instructors(text, text, int, int) from public, anon;
grant execute on function public.admin_instructors(text, text, int, int) to authenticated;
