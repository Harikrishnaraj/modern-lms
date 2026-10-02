-- T-135: Enrollments & cohorts (F-407). Search/list reuses course.read_all, which already grants
-- SELECT on enrollments directly (courses_schema.sql). Writing (manual enroll/unenroll, cohorts)
-- needs a new permission: self-enroll RLS only allows a learner to enroll themselves into a free
-- published course.

insert into public.permissions (id, description) values
  ('enrollments.manage', 'Manually enroll/unenroll learners and manage cohorts');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'enrollments.manage'),
  ('super_admin', 'enrollments.manage');

-- Search/list for the admin screen.
create function public.admin_enrollments(
  p_q text default '',
  p_status text default '',
  p_course_id uuid default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  enrollment_id uuid,
  user_id uuid,
  learner_name text,
  learner_email text,
  course_id uuid,
  course_title text,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
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
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select e.id, e.user_id, p.full_name, u.email::text, e.course_id,
         coalesce(v.title, c.slug), e.status, e.enrolled_at, e.completed_at,
         count(*) over () as total
    from public.enrollments e
    join public.profiles p on p.id = e.user_id
    join auth.users u on u.id = e.user_id
    join public.courses c on c.id = e.course_id
    left join public.course_versions v on v.id = e.version_id
   where (v_q = '' or lower(u.email) like '%' || v_q || '%' or lower(coalesce(p.full_name, '')) like '%' || v_q || '%')
     and (coalesce(p_status, '') = '' or e.status = p_status)
     and (p_course_id is null or e.course_id = p_course_id)
   order by e.enrolled_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_enrollments(text, text, uuid, int, int) from public, anon;
grant execute on function public.admin_enrollments(text, text, uuid, int, int) to authenticated;

-- Manual enroll: bypasses the free/self-only self-enroll policy. Idempotent: re-enrolling
-- (including reactivating a cancelled enrollment) just (re)sets status/version.
create function public.admin_enroll_user(p_user_id uuid, p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  if not public.has_permission('enrollments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select published_version_id into v_version_id from public.courses where id = p_course_id;
  if v_version_id is null then
    raise exception 'course is not published' using errcode = '22023';
  end if;

  insert into public.enrollments (user_id, course_id, version_id, status)
  values (p_user_id, p_course_id, v_version_id, 'active')
  on conflict (user_id, course_id) do update
    set status = 'active', version_id = excluded.version_id;
end;
$$;

revoke all on function public.admin_enroll_user(uuid, uuid) from public, anon;
grant execute on function public.admin_enroll_user(uuid, uuid) to authenticated;

create function public.admin_unenroll_user(p_user_id uuid, p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('enrollments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.enrollments set status = 'cancelled' where user_id = p_user_id and course_id = p_course_id;
end;
$$;

revoke all on function public.admin_unenroll_user(uuid, uuid) from public, anon;
grant execute on function public.admin_unenroll_user(uuid, uuid) to authenticated;

-- Cohorts: named groups of learners for bulk enrollment.
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 150),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.cohorts enable row level security;
create policy "staff manage cohorts" on public.cohorts for all to authenticated
  using (public.has_permission('enrollments.manage'))
  with check (public.has_permission('enrollments.manage'));
revoke all on public.cohorts from anon, authenticated;
grant select, insert, update, delete on public.cohorts to authenticated;

create table public.cohort_members (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
alter table public.cohort_members enable row level security;
create policy "staff manage cohort members" on public.cohort_members for all to authenticated
  using (public.has_permission('enrollments.manage'))
  with check (public.has_permission('enrollments.manage'));
revoke all on public.cohort_members from anon, authenticated;
grant select, insert, delete on public.cohort_members to authenticated;

create function public.admin_cohorts()
returns table (id uuid, name text, member_count bigint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('enrollments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, count(m.user_id), c.created_at
    from public.cohorts c
    left join public.cohort_members m on m.cohort_id = c.id
   group by c.id
   order by c.created_at desc;
end;
$$;

revoke all on function public.admin_cohorts() from public, anon;
grant execute on function public.admin_cohorts() to authenticated;

create function public.admin_cohort_members(p_cohort_id uuid)
returns table (user_id uuid, full_name text, email text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('enrollments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, u.email::text, m.added_at
    from public.cohort_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
   where m.cohort_id = p_cohort_id
   order by m.added_at desc;
end;
$$;

revoke all on function public.admin_cohort_members(uuid) from public, anon;
grant execute on function public.admin_cohort_members(uuid) to authenticated;

-- Bulk assign: enrolls every current cohort member into a published course.
create function public.admin_bulk_enroll_cohort(p_cohort_id uuid, p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_enrolled int := 0;
  v_total int := 0;
begin
  if not public.has_permission('enrollments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select published_version_id into v_version_id from public.courses where id = p_course_id;
  if v_version_id is null then
    raise exception 'course is not published' using errcode = '22023';
  end if;

  select count(*) into v_total from public.cohort_members where cohort_id = p_cohort_id;

  with ins as (
    insert into public.enrollments (user_id, course_id, version_id, status)
    select m.user_id, p_course_id, v_version_id, 'active'
      from public.cohort_members m
     where m.cohort_id = p_cohort_id
    on conflict (user_id, course_id) do update
      set status = 'active', version_id = excluded.version_id
    returning 1
  )
  select count(*) into v_enrolled from ins;

  return jsonb_build_object('total_members', v_total, 'enrolled', v_enrolled);
end;
$$;

revoke all on function public.admin_bulk_enroll_cohort(uuid, uuid) from public, anon;
grant execute on function public.admin_bulk_enroll_cohort(uuid, uuid) to authenticated;
