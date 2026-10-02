-- Fix: admin_reissue_certificate failed with "column reference code is ambiguous" because the
-- RETURNING list collided with the function's own OUT column "code". Qualify the columns.
create or replace function public.admin_reissue_certificate(p_certificate_id uuid)
returns table (certificate_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.certificates%rowtype;
  v_new_id uuid;
  v_new_code text;
begin
  if not public.has_permission('certificates.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_source from public.certificates c where c.id = p_certificate_id;
  if not found then
    raise exception 'certificate not found' using errcode = '22023';
  end if;
  if v_source.status <> 'revoked' then
    raise exception 'only a revoked certificate can be reissued' using errcode = '22023';
  end if;

  insert into public.certificates as n (
    enrollment_id, user_id, course_id, version_id, learner_name, course_title, instructor_name,
    signature_title, closing_message
  ) values (
    v_source.enrollment_id, v_source.user_id, v_source.course_id, v_source.version_id,
    v_source.learner_name, v_source.course_title, v_source.instructor_name,
    v_source.signature_title, v_source.closing_message
  )
  returning n.id, n.code into v_new_id, v_new_code;

  return query select v_new_id, v_new_code;
end;
$$;
