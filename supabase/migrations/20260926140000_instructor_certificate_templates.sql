-- T-110: Instructor certificates — issued list + certificate template settings (F-218).

-- 1. Per-course template settings the instructor customizes. Snapshotted onto certificates at
--    issuance time (consistent with the existing learner_name/course_title snapshot pattern),
--    so changing a template never rewrites certificates already issued.
create table public.certificate_templates (
  course_id uuid primary key references public.courses (id) on delete cascade,
  signature_title text check (char_length(signature_title) <= 200),
  closing_message text check (char_length(closing_message) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.certificate_templates enable row level security;

create policy "instructor reads own certificate template" on public.certificate_templates
  for select to authenticated
  using (public.owns_course(course_id) or public.has_permission('course.read_all'));

revoke all on public.certificate_templates from anon, authenticated;
grant select on public.certificate_templates to authenticated;

-- 2. Snapshot fields on certificates (immutable once issued, like instructor_name/course_title).
alter table public.certificates
  add column signature_title text,
  add column closing_message text;

-- Extend the identity guard to cover the two new snapshot fields.
create or replace function public.certificates_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.enrollment_id is distinct from old.enrollment_id
     or new.user_id is distinct from old.user_id
     or new.course_id is distinct from old.course_id
     or new.version_id is distinct from old.version_id
     or new.learner_name is distinct from old.learner_name
     or new.course_title is distinct from old.course_title
     or new.instructor_name is distinct from old.instructor_name
     or new.signature_title is distinct from old.signature_title
     or new.closing_message is distinct from old.closing_message
     or new.issued_at is distinct from old.issued_at then
    raise exception 'certificate identity fields are immutable';
  end if;
  if old.status = 'revoked' and new.status is distinct from 'revoked' then
    raise exception 'a revoked certificate cannot be reinstated';
  end if;
  return new;
end;
$$;

-- 3. Upsert template settings — instructor-only, own course.
create function public.upsert_certificate_template(
  p_course_id uuid,
  p_signature_title text,
  p_closing_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
begin
  if not public.owns_course(p_course_id) then
    raise exception 'not allowed to edit this course''s certificate template' using errcode = '42501';
  end if;

  v_title := nullif(trim(coalesce(p_signature_title, '')), '');
  v_message := nullif(trim(coalesce(p_closing_message, '')), '');

  if v_title is not null and char_length(v_title) > 200 then
    raise exception 'signature title cannot exceed 200 characters' using errcode = '22023';
  end if;
  if v_message is not null and char_length(v_message) > 500 then
    raise exception 'closing message cannot exceed 500 characters' using errcode = '22023';
  end if;

  insert into public.certificate_templates (course_id, signature_title, closing_message, updated_at)
  values (p_course_id, v_title, v_message, now())
  on conflict (course_id) do update
    set signature_title = excluded.signature_title,
        closing_message = excluded.closing_message,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_certificate_template(uuid, text, text) from public, anon;
grant execute on function public.upsert_certificate_template(uuid, text, text) to authenticated;

-- 4. Issued-certificates list, scoped to courses owned by the calling instructor.
create function public.instructor_certificates(p_course_id uuid default null)
returns table (
  id uuid,
  code text,
  course_id uuid,
  course_title text,
  learner_name text,
  instructor_name text,
  status text,
  issued_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.course_id, c.course_title, c.learner_name, c.instructor_name,
         c.status, c.issued_at, c.revoked_at
    from public.certificates c
    join public.courses co on co.id = c.course_id
   where co.instructor_id = auth.uid()
     and (p_course_id is null or c.course_id = p_course_id)
   order by c.issued_at desc;
$$;

revoke all on function public.instructor_certificates(uuid) from public, anon;
grant execute on function public.instructor_certificates(uuid) to authenticated;

-- 5. Verification now also surfaces the snapshotted signature title / closing message.
--    Return type changes (new output columns), so the function must be dropped and recreated.
drop function public.verify_certificate(text);

create function public.verify_certificate(p_code text)
returns table (
  code text,
  status text,
  learner_name text,
  course_title text,
  instructor_name text,
  signature_title text,
  closing_message text,
  issued_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.status, c.learner_name, c.course_title, c.instructor_name,
         c.signature_title, c.closing_message, c.issued_at, c.revoked_at
    from public.certificates c
   where c.code = upper(btrim(p_code));
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
