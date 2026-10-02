-- Fix: my_assigned_learning failed with an ambiguous column reference (final select and order by
-- reused names from the function's OUT columns). Qualify them through an alias.
create or replace function public.my_assigned_learning()
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
  select cp.id, cp.content_type, cp.c_slug, cp.p_slug, cp.resolved_title, cp.due_at, cp.is_complete,
         (cp.due_at is not null and cp.due_at < now() and not cp.is_complete) as is_overdue
    from computed cp
   order by cp.due_at nulls last, cp.created_at desc;
end;
$$;
