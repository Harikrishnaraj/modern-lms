-- T-136: Assessment oversight (F-408). Platform-wide averages, question-quality flags, and
-- attempt investigation/reset. Read-heavy RPCs reuse course.read_all (already used for
-- enrollments/certificates admin screens). Resetting an attempt is a write and needs a new
-- permission, since it deletes real learner attempt data.

insert into public.permissions (id, description) values
  ('assessments.manage', 'Investigate and reset assessment attempts for integrity issues');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'assessments.manage'),
  ('super_admin', 'assessments.manage');

-- 1. Platform-wide assessment averages (mirrors instructor_assessment_analytics, unscoped by owner).
create function public.admin_assessment_analytics(p_course_id uuid default null)
returns table (
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  pass_mark int,
  total_attempts int,
  total_learners int,
  passed_attempts int,
  pass_rate int,
  avg_score numeric(5, 2),
  avg_attempts numeric(4, 2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with scoped_courses as (
    select c.id as course_id,
           coalesce(v.title, 'Untitled course') as course_title,
           v.id as version_id
      from public.courses c
      join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where p_course_id is null or c.id = p_course_id
  )
  select a.id as assessment_id,
         a.title as assessment_title,
         sc.course_id,
         sc.course_title,
         a.pass_mark,
         count(att.id)::int as total_attempts,
         count(distinct att.user_id)::int as total_learners,
         count(att.id) filter (where att.passed is true)::int as passed_attempts,
         case
           when count(att.id) = 0 then 0
           else round((count(att.id) filter (where att.passed is true)::numeric / count(att.id)::numeric) * 100)::int
         end as pass_rate,
         coalesce(round(avg(att.percent), 2), 0)::numeric(5, 2) as avg_score,
         case
           when count(distinct att.user_id) = 0 then 0
           else round((count(att.id)::numeric / count(distinct att.user_id)::numeric), 2)::numeric(4, 2)
         end as avg_attempts
    from scoped_courses sc
    join public.assessments a on a.version_id = sc.version_id
    left join public.assessment_attempts att on att.assessment_id = a.id
   group by a.id, a.title, sc.course_id, sc.course_title, a.pass_mark, a.position
   order by sc.course_title asc, a.position asc;
end;
$$;
revoke all on function public.admin_assessment_analytics(uuid) from public, anon;
grant execute on function public.admin_assessment_analytics(uuid) to authenticated;

-- 2. Platform-wide question analytics with a quality_flag: attempt-backed heuristic for a
-- question that is likely broken (everyone fails it) or trivial (everyone passes it), the same
-- pass_rate-vs-attempts basis instructor_question_analytics already uses.
create function public.admin_question_analytics(p_course_id uuid default null)
returns table (
  question_id uuid,
  prompt text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  question_type text,
  points int,
  total_attempts int,
  pass_rate int,
  difficulty text,
  quality_flag text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with scoped_courses as (
    select c.id as course_id,
           coalesce(v.title, 'Untitled course') as course_title,
           v.id as version_id
      from public.courses c
      join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where p_course_id is null or c.id = p_course_id
  ),
  q_stats as (
    select q.id as q_id,
           q.prompt as q_prompt,
           a.id as a_id,
           a.title as a_title,
           sc.course_id as c_id,
           sc.course_title as c_title,
           q.type as q_type,
           q.points as q_points,
           count(att.id)::int as q_attempts,
           case
             when count(att.id) = 0 then 100
             else round((count(att.id) filter (where att.passed is true)::numeric / count(att.id)::numeric) * 100)::int
           end as q_pass_rate
      from scoped_courses sc
      join public.assessments a on a.version_id = sc.version_id
      join public.assessment_questions q on q.assessment_id = a.id
      left join public.assessment_attempts att on att.assessment_id = a.id
     group by q.id, q.prompt, a.id, a.title, sc.course_id, sc.course_title, q.type, q.points, q.position
     order by sc.course_title asc, a.title asc, q.position asc
  )
  select q_id,
         q_prompt,
         a_id,
         a_title,
         c_id,
         c_title,
         q_type,
         q_points,
         q_attempts,
         q_pass_rate,
         case
           when q_pass_rate >= 80 then 'easy'
           when q_pass_rate >= 50 then 'medium'
           else 'hard'
         end as difficulty,
         case
           when q_attempts >= 5 and q_pass_rate = 0 then 'review_too_hard'
           when q_attempts >= 5 and q_pass_rate = 100 then 'review_too_easy'
           else null
         end as quality_flag
    from q_stats;
end;
$$;
revoke all on function public.admin_question_analytics(uuid) from public, anon;
grant execute on function public.admin_question_analytics(uuid) to authenticated;

-- 3. Attempt search, for investigation. Newest first.
create function public.admin_search_attempts(
  p_q text default '',
  p_course_id uuid default null,
  p_assessment_id uuid default null,
  p_status text default '',
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  attempt_id uuid,
  user_id uuid,
  learner_name text,
  learner_email text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  attempt_number int,
  status text,
  score numeric(8, 2),
  max_score numeric(8, 2),
  percent numeric(5, 2),
  passed boolean,
  started_at timestamptz,
  submitted_at timestamptz,
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
  select att.id, att.user_id, p.full_name, u.email::text,
         a.id, a.title, c.id, coalesce(v.title, c.slug),
         att.attempt_number, att.status, att.score, att.max_score, att.percent, att.passed,
         att.started_at, att.submitted_at,
         count(*) over () as total
    from public.assessment_attempts att
    join public.assessments a on a.id = att.assessment_id
    join public.course_versions v on v.id = a.version_id
    join public.courses c on c.id = v.course_id
    join public.profiles p on p.id = att.user_id
    join auth.users u on u.id = att.user_id
   where (v_q = '' or lower(u.email) like '%' || v_q || '%' or lower(coalesce(p.full_name, '')) like '%' || v_q || '%')
     and (p_course_id is null or c.id = p_course_id)
     and (p_assessment_id is null or a.id = p_assessment_id)
     and (coalesce(p_status, '') = '' or att.status = p_status)
   order by att.started_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_search_attempts(text, uuid, uuid, text, int, int) from public, anon;
grant execute on function public.admin_search_attempts(text, uuid, uuid, text, int, int) to authenticated;

-- 4. Single attempt detail, including answers, for investigation before a reset decision.
create function public.admin_attempt_detail(p_attempt_id uuid)
returns table (
  attempt_id uuid,
  user_id uuid,
  learner_name text,
  learner_email text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  attempt_number int,
  status text,
  score numeric(8, 2),
  max_score numeric(8, 2),
  percent numeric(5, 2),
  passed boolean,
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  answers jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select att.id, att.user_id, p.full_name, u.email::text,
         a.id, a.title, c.id, coalesce(v.title, c.slug),
         att.attempt_number, att.status, att.score, att.max_score, att.percent, att.passed,
         att.started_at, att.expires_at, att.submitted_at, att.answers
    from public.assessment_attempts att
    join public.assessments a on a.id = att.assessment_id
    join public.course_versions v on v.id = a.version_id
    join public.courses c on c.id = v.course_id
    join public.profiles p on p.id = att.user_id
    join auth.users u on u.id = att.user_id
   where att.id = p_attempt_id;
end;
$$;
revoke all on function public.admin_attempt_detail(uuid) from public, anon;
grant execute on function public.admin_attempt_detail(uuid) to authenticated;

-- 5. Attempt reset: deletes the attempt row, freeing its attempt-number slot and clearing any
-- stuck in_progress state (see decideStart in src/features/assessments/grading.ts, which counts
-- rows to enforce max_attempts). Returns the deleted row's identity for the audit log.
create function public.admin_reset_attempt(p_attempt_id uuid)
returns table (assessment_id uuid, user_id uuid, attempt_number int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('assessments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  delete from public.assessment_attempts
   where id = p_attempt_id
  returning assessment_attempts.assessment_id, assessment_attempts.user_id, assessment_attempts.attempt_number;
end;
$$;
revoke all on function public.admin_reset_attempt(uuid) from public, anon;
grant execute on function public.admin_reset_attempt(uuid) to authenticated;
