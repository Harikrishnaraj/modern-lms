-- Fix: admin_enroll_user's `on conflict ... do update set status = 'active'` reset a `completed`
-- enrollment back to active whenever an admin re-enrolled the same learner in the same course
-- (e.g. for a cohort re-run), leaving completed_at and the issued certificate in an inconsistent
-- state relative to the now-reopened enrollment. Reproduced on "AML & KYC Fundamentals" and
-- restored manually; see docs/MEMORY.md for the fix decision (refuse rather than silently reset).
--
-- Single-target enroll: raise a clear error so the admin knows nothing changed, rather than
-- silently no-op-ing (which enrollUserAction would otherwise report as a webhook-firing success).
create or replace function public.admin_enroll_user(p_user_id uuid, p_course_id uuid)
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
    set status = 'active', version_id = excluded.version_id
    where public.enrollments.status <> 'completed';

  if not found then
    raise exception 'this learner has already completed the course' using errcode = '22023';
  end if;
end;
$$;

-- Bulk cohort enroll: a completed member must not block enrolling the rest of the cohort, so this
-- skips (rather than raises for) any member whose enrollment is already completed -- the ON
-- CONFLICT ... WHERE clause makes that row a no-op, same as ON CONFLICT DO NOTHING would, and it's
-- excluded from RETURNING, so `enrolled < total_members` already tells the admin some were skipped.
create or replace function public.admin_bulk_enroll_cohort(p_cohort_id uuid, p_course_id uuid)
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
      where public.enrollments.status <> 'completed'
    returning 1
  )
  select count(*) into v_enrolled from ins;

  return jsonb_build_object('total_members', v_total, 'enrolled', v_enrolled);
end;
$$;
