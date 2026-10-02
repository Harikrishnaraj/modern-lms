-- T-138: Content, media & SCORM (F-410). Admin oversight of uploaded media/documents
-- (resource-library items, T-111), plus a new SCORM lesson type: validated package upload,
-- sandboxed launch, and completion reporting back into the existing lesson_progress model.

alter table public.lessons drop constraint lessons_type_check;
alter table public.lessons add constraint lessons_type_check check (type in ('video', 'text', 'quiz', 'assignment', 'scorm'));

insert into public.permissions (id, description) values
  ('content.manage', 'Moderate and delete uploaded resource-library items and SCORM packages');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'content.manage'),
  ('super_admin', 'content.manage');

-- Whether the calling user may view a lesson's content: enrolled in that exact version, owns the
-- course, or has platform-wide course.read_all. Mirrors is_enrolled_in_version_course's grant.
create function public.can_access_lesson_content(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.lessons l
      join public.course_sections s on s.id = l.section_id
      join public.course_versions v on v.id = s.version_id
      join public.courses c on c.id = v.course_id
     where l.id = p_lesson_id
       and (
         public.is_enrolled_in_version_course(v.id)
         or public.owns_course(c.id)
         or public.has_permission('course.read_all')
       )
  );
$$;
grant execute on function public.can_access_lesson_content(uuid) to authenticated;

-- One SCORM package per lesson. file_paths records exactly what was extracted, so a
-- replace/delete can remove precisely those storage objects (no recursive bucket listing needed).
create table public.scorm_packages (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  version text not null check (version in ('1.2', '2004')),
  title text,
  launch_path text not null,
  storage_prefix text not null,
  file_paths jsonb not null default '[]'::jsonb,
  file_count int not null default 0 check (file_count >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now()
);

-- Per-enrollment SCORM runtime state (resume data + reported completion/score).
create table public.scorm_registrations (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cmi jsonb not null default '{}'::jsonb,
  lesson_status text,
  score_raw numeric(6, 2),
  suspend_data text,
  updated_at timestamptz not null default now(),
  unique (lesson_id, enrollment_id)
);
create index scorm_registrations_enrollment_idx on public.scorm_registrations (enrollment_id);

alter table public.scorm_packages enable row level security;
alter table public.scorm_registrations enable row level security;

create policy "read scorm package for accessible lesson" on public.scorm_packages for select to authenticated
  using (public.can_access_lesson_content(lesson_id));

create policy "own scorm registration" on public.scorm_registrations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "staff read scorm registrations" on public.scorm_registrations for select to authenticated
  using (public.has_permission('course.read_all'));

revoke all on public.scorm_packages, public.scorm_registrations from anon, authenticated;
grant select on public.scorm_packages to authenticated;
grant select, insert, update on public.scorm_registrations to authenticated;

-- Finalizes an already-extracted-and-uploaded package (the server action does the zip
-- validation/extraction; this just records the result once every file is safely stored).
create function public.save_scorm_package(
  p_lesson_id uuid,
  p_version text,
  p_title text,
  p_launch_path text,
  p_storage_prefix text,
  p_file_paths jsonb,
  p_file_count int,
  p_total_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
      from public.lessons l
      join public.course_sections s on s.id = l.section_id
      join public.course_versions v on v.id = s.version_id
      join public.courses c on c.id = v.course_id
     where l.id = p_lesson_id and public.owns_course(c.id)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.scorm_packages (
    lesson_id, version, title, launch_path, storage_prefix, file_paths, file_count, total_bytes, uploaded_by
  ) values (
    p_lesson_id, p_version, p_title, p_launch_path, p_storage_prefix, p_file_paths, p_file_count, p_total_bytes, auth.uid()
  )
  on conflict (lesson_id) do update set
    version = excluded.version,
    title = excluded.title,
    launch_path = excluded.launch_path,
    storage_prefix = excluded.storage_prefix,
    file_paths = excluded.file_paths,
    file_count = excluded.file_count,
    total_bytes = excluded.total_bytes,
    uploaded_by = excluded.uploaded_by,
    uploaded_at = now()
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.save_scorm_package(uuid, text, text, text, text, jsonb, int, bigint) to authenticated;

-- The prior package's storage_prefix/file_paths, so the server action can clean up old files
-- after a replace upload finishes (called before save_scorm_package overwrites the row).
create function public.get_scorm_package_for_lesson(p_lesson_id uuid)
returns table (storage_prefix text, file_paths jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select sp.storage_prefix, sp.file_paths
    from public.scorm_packages sp
    join public.lessons l on l.id = sp.lesson_id
    join public.course_sections s on s.id = l.section_id
    join public.course_versions v on v.id = s.version_id
    join public.courses c on c.id = v.course_id
   where sp.lesson_id = p_lesson_id and public.owns_course(c.id);
$$;
grant execute on function public.get_scorm_package_for_lesson(uuid) to authenticated;

-- Admin oversight: resource-library items across every instructor (RLS on that table is
-- owner-only, so a security-definer RPC is needed for cross-user visibility, per T-135's pattern).
create function public.admin_content_resources(p_q text default '', p_limit int default 25, p_offset int default 0)
returns table (
  resource_id uuid,
  name text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  mime_type text,
  size_bytes bigint,
  usage_count bigint,
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
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select r.id, r.name, r.owner_id, p.full_name, u.email::text, r.mime_type, r.size_bytes,
         (select count(*) from public.resource_library_usages ru where ru.resource_id = r.id),
         r.created_at,
         count(*) over () as total
    from public.resource_library_items r
    join public.profiles p on p.id = r.owner_id
    join auth.users u on u.id = r.owner_id
   where (v_q = '' or lower(r.name) like '%' || v_q || '%' or lower(u.email) like '%' || v_q || '%')
   order by r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_content_resources(text, int, int) from public, anon;
grant execute on function public.admin_content_resources(text, int, int) to authenticated;

create function public.admin_delete_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('content.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.resource_library_items where id = p_resource_id;
  if not found then
    raise exception 'resource not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_delete_resource(uuid) from public, anon;
grant execute on function public.admin_delete_resource(uuid) to authenticated;

create function public.admin_scorm_packages(p_q text default '', p_limit int default 25, p_offset int default 0)
returns table (
  package_id uuid,
  lesson_id uuid,
  lesson_title text,
  course_id uuid,
  course_title text,
  version text,
  title text,
  file_count int,
  total_bytes bigint,
  uploaded_by_name text,
  uploaded_at timestamptz,
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
  select sp.id, l.id, l.title, c.id, coalesce(v.title, c.slug), sp.version, sp.title,
         sp.file_count, sp.total_bytes, p.full_name, sp.uploaded_at,
         count(*) over () as total
    from public.scorm_packages sp
    join public.lessons l on l.id = sp.lesson_id
    join public.course_sections s on s.id = l.section_id
    join public.course_versions v on v.id = s.version_id
    join public.courses c on c.id = v.course_id
    left join public.profiles p on p.id = sp.uploaded_by
   where (v_q = '' or lower(l.title) like '%' || v_q || '%' or lower(coalesce(v.title, c.slug)) like '%' || v_q || '%')
   order by sp.uploaded_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_scorm_packages(text, int, int) from public, anon;
grant execute on function public.admin_scorm_packages(text, int, int) to authenticated;

create function public.admin_delete_scorm_package(p_package_id uuid)
returns table (storage_prefix text, file_paths jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_paths jsonb;
begin
  if not public.has_permission('content.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.scorm_packages where id = p_package_id returning storage_prefix, file_paths into v_prefix, v_paths;
  if not found then
    raise exception 'package not found' using errcode = '22023';
  end if;
  return query select v_prefix, v_paths;
end;
$$;
revoke all on function public.admin_delete_scorm_package(uuid) from public, anon;
grant execute on function public.admin_delete_scorm_package(uuid) to authenticated;
