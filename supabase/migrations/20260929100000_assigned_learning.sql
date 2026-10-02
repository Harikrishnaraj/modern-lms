-- T-163: Assigned learning -- courses/paths assigned to an organization, a team, or a specific
-- member, with a due date and overdue tracking (F-502).

create table public.assigned_learning (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null check (scope in ('organization', 'team', 'user')),
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('course', 'path')),
  course_id uuid references public.courses (id) on delete cascade,
  path_id uuid references public.learning_paths (id) on delete cascade,
  due_at timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope = 'team') = (team_id is not null)),
  check ((scope = 'user') = (user_id is not null)),
  check ((content_type = 'course') = (course_id is not null)),
  check ((content_type = 'path') = (path_id is not null))
);
create index assigned_learning_org_idx on public.assigned_learning (organization_id);

-- A team, if given, must belong to this organization; a user, if given, must already be a
-- member of it -- otherwise "assign to this org" could silently target someone unrelated.
create function public.check_assigned_learning_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.team_id is not null and not exists (
    select 1 from public.teams where id = new.team_id and organization_id = new.organization_id
  ) then
    raise exception 'team does not belong to this organization' using errcode = '23514';
  end if;
  if new.user_id is not null and not exists (
    select 1 from public.organization_members where user_id = new.user_id and organization_id = new.organization_id
  ) then
    raise exception 'user is not a member of this organization' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger assigned_learning_check_scope
  before insert or update of organization_id, team_id, user_id on public.assigned_learning
  for each row execute function public.check_assigned_learning_scope();

alter table public.assigned_learning enable row level security;

-- Any member can see what's assigned in their own organization (it's a training requirement,
-- not sensitive data); only that org's admin (or a platform admin) can create or remove one.
create policy "read own org assignments or manage all" on public.assigned_learning for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_member(organization_id));
create policy "platform admin or org admin manage assignments" on public.assigned_learning for all to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission('organizations.manage') or public.is_org_admin(organization_id));

-- Org admin / platform admin view: every assignment in the org, with how many of the affected
-- members have completed it and how many are overdue.
create function public.list_org_assigned_learning(p_org_id uuid)
returns table (
  id uuid,
  scope text,
  team_name text,
  user_full_name text,
  user_email text,
  content_type text,
  title text,
  due_at timestamptz,
  created_at timestamptz,
  total_assigned bigint,
  completed_count bigint,
  overdue_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select al.id, al.scope, t.name, p.full_name, u.email::text, al.content_type,
         coalesce(cv.title, lp.title, c.slug) as title,
         al.due_at, al.created_at,
         count(target.user_id) as total_assigned,
         count(target.user_id) filter (where target.is_complete) as completed_count,
         count(target.user_id) filter (where not target.is_complete and al.due_at is not null and al.due_at < now()) as overdue_count
    from public.assigned_learning al
    left join public.teams t on t.id = al.team_id
    left join public.profiles p on p.id = al.user_id
    left join auth.users u on u.id = al.user_id
    left join public.courses c on c.id = al.course_id
    left join public.course_versions cv on cv.id = c.published_version_id
    left join public.learning_paths lp on lp.id = al.path_id
    left join lateral (
      select m.user_id,
             case
               when al.content_type = 'course' then exists (
                 select 1 from public.enrollments e where e.user_id = m.user_id and e.course_id = al.course_id and e.status = 'completed'
               )
               else (
                 select count(*) from public.learning_path_courses lpc where lpc.path_id = al.path_id
               ) > 0 and (
                 select count(*) from public.learning_path_courses lpc where lpc.path_id = al.path_id
               ) = (
                 select count(*) from public.learning_path_courses lpc
                  join public.enrollments e2 on e2.course_id = lpc.course_id and e2.user_id = m.user_id and e2.status = 'completed'
                 where lpc.path_id = al.path_id
               )
             end as is_complete
        from (
          select om.user_id
            from public.organization_members om
           where (al.scope = 'organization' and om.organization_id = al.organization_id)
              or (al.scope = 'team' and om.team_id = al.team_id)
              or (al.scope = 'user' and om.user_id = al.user_id)
        ) m
    ) target on true
   where al.organization_id = p_org_id
   group by al.id, t.name, p.full_name, u.email, c.slug, cv.title, lp.title
   order by al.created_at desc;
end;
$$;
revoke all on function public.list_org_assigned_learning(uuid) from public, anon;
grant execute on function public.list_org_assigned_learning(uuid) to authenticated;

-- Learner view: every assignment that applies to the caller, with their own completion/overdue
-- status.
create function public.my_assigned_learning()
returns table (
  id uuid,
  content_type text,
  course_slug text,
  path_slug text,
  title text,
  due_at timestamptz,
  is_complete boolean,
  is_overdue boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with mine as (
    select al.id, al.content_type, al.course_id, al.path_id, al.due_at, al.created_at,
           c.slug as c_slug, lp.slug as p_slug, coalesce(cv.title, lp.title, c.slug) as resolved_title
      from public.assigned_learning al
      left join public.courses c on c.id = al.course_id
      left join public.course_versions cv on cv.id = c.published_version_id
      left join public.learning_paths lp on lp.id = al.path_id
     where exists (
       select 1 from public.organization_members om
        where om.user_id = auth.uid()
          and (
            (al.scope = 'organization' and om.organization_id = al.organization_id)
            or (al.scope = 'team' and om.team_id = al.team_id)
            or (al.scope = 'user' and al.user_id = auth.uid())
          )
     )
  ),
  computed as (
    select m.*,
           case
             when m.content_type = 'course' then exists (
               select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = m.course_id and e.status = 'completed'
             )
             else (
               select count(*) from public.learning_path_courses lpc where lpc.path_id = m.path_id
             ) > 0 and (
               select count(*) from public.learning_path_courses lpc where lpc.path_id = m.path_id
             ) = (
               select count(*) from public.learning_path_courses lpc
                join public.enrollments e2 on e2.course_id = lpc.course_id and e2.user_id = auth.uid() and e2.status = 'completed'
               where lpc.path_id = m.path_id
             )
           end as is_complete
      from mine m
  )
  select id, content_type, c_slug, p_slug, resolved_title, due_at, is_complete,
         (due_at is not null and due_at < now() and not is_complete) as is_overdue
    from computed
   order by due_at nulls last, created_at desc;
end;
$$;
revoke all on function public.my_assigned_learning() from public, anon;
grant execute on function public.my_assigned_learning() to authenticated;
