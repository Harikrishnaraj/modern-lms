-- T-137: Certificate administration (F-409). Search, revoke (audited), reissue.
--
-- Revocation was already one-way on this table (certificates_guard trigger forbids reinstating a
-- revoked row), so "reissue" cannot mean editing that row back to issued — it means minting a new
-- certificate for the same enrollment. That needs enrollment_id to allow more than one row over
-- time (one revoked history row, one live row), so the plain UNIQUE(enrollment_id) constraint is
-- replaced with a partial index that still guarantees at most one *active* certificate.

alter table public.certificates drop constraint certificates_enrollment_id_key;
create unique index certificates_active_enrollment_idx on public.certificates (enrollment_id) where status <> 'revoked';

insert into public.permissions (id, description) values
  ('certificates.manage', 'Revoke and reissue certificates');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'certificates.manage'),
  ('super_admin', 'certificates.manage');

-- Search across every certificate. Requires course.read_all (already grants SELECT on
-- certificates directly, per the "read own certificates" policy).
create function public.admin_search_certificates(
  p_q text default '',
  p_status text default '',
  p_course_id uuid default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  certificate_id uuid,
  code text,
  user_id uuid,
  learner_name text,
  learner_email text,
  course_id uuid,
  course_title text,
  status text,
  issued_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
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
  select c.id, c.code, c.user_id, c.learner_name, u.email::text, c.course_id, c.course_title,
         c.status, c.issued_at, c.revoked_at, c.revoked_reason,
         count(*) over () as total
    from public.certificates c
    join auth.users u on u.id = c.user_id
   where (v_q = '' or lower(c.learner_name) like '%' || v_q || '%' or lower(u.email) like '%' || v_q || '%'
          or lower(c.code) like '%' || v_q || '%')
     and (coalesce(p_status, '') = '' or c.status = p_status)
     and (p_course_id is null or c.course_id = p_course_id)
   order by c.issued_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_search_certificates(text, text, uuid, int, int) from public, anon;
grant execute on function public.admin_search_certificates(text, text, uuid, int, int) to authenticated;

-- Revoke: the certificates_audit trigger already appends a 'revoked' certificate_events row;
-- this RPC additionally requires certificates.manage (a stronger bar than course.read_all).
create function public.admin_revoke_certificate(p_certificate_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('certificates.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a revocation reason is required' using errcode = '22023';
  end if;

  update public.certificates
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoked_reason = trim(p_reason)
   where id = p_certificate_id
     and status <> 'revoked';

  if not found then
    raise exception 'certificate not found or already revoked' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_revoke_certificate(uuid, text) from public, anon;
grant execute on function public.admin_revoke_certificate(uuid, text) to authenticated;

-- Reissue: mints a brand-new certificate row (new code, new issued_at) cloning the revoked
-- certificate's identity snapshot. The source row stays as revoked history.
create function public.admin_reissue_certificate(p_certificate_id uuid)
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

  select * into v_source from public.certificates where id = p_certificate_id;
  if not found then
    raise exception 'certificate not found' using errcode = '22023';
  end if;
  if v_source.status <> 'revoked' then
    raise exception 'only a revoked certificate can be reissued' using errcode = '22023';
  end if;

  insert into public.certificates (
    enrollment_id, user_id, course_id, version_id, learner_name, course_title, instructor_name,
    signature_title, closing_message
  ) values (
    v_source.enrollment_id, v_source.user_id, v_source.course_id, v_source.version_id,
    v_source.learner_name, v_source.course_title, v_source.instructor_name,
    v_source.signature_title, v_source.closing_message
  )
  returning id, code into v_new_id, v_new_code;

  return query select v_new_id, v_new_code;
end;
$$;
revoke all on function public.admin_reissue_certificate(uuid) from public, anon;
grant execute on function public.admin_reissue_certificate(uuid) to authenticated;
