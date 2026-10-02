-- T-114 (F-206, ADR-030): the instructor Assignments page. Per-assignment allowed submission
-- file types, reference files attached to an assignment (private bucket, 50MB), creating an
-- assignment in a live course (additive only), and one overview of every assignment across the
-- instructor's courses with submissions against enrolled learners.

-- 1. Which submission file types an assignment accepts. Existing rows keep exactly the set every
--    assignment accepted before (PDF, DOCX, ZIP, TXT, PNG, JPEG); DOC and PPT/PPTX become available.
alter table public.assignments
  add column allowed_file_types text[] not null default array['pdf', 'docx', 'zip', 'txt', 'png', 'jpg'];
alter table public.assignments
  add constraint assignments_allowed_file_types_check check (
    cardinality(allowed_file_types) >= 1
    and allowed_file_types <@ array['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'txt', 'png', 'jpg']::text[]
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assignment-submissions', 'assignment-submissions', false, 10485760, array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'text/plain', 'image/png', 'image/jpeg'
  ]),
  -- Reference files an instructor attaches to an assignment. Private: learners get short-lived
  -- signed URLs only after RLS lets them read the assignment (same model as lesson-assets).
  ('assignment-resources', 'assignment-resources', false, 52428800, array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Reference files. storage_path is always "<uploader uid>/<uuid>.<ext>"; copies of an
--    assignment in another version share the same object (like lesson_assets), so the app only
--    removes an object once no row references it.
create table public.assignment_resources (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null check (storage_path !~ '\.\.'),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index assignment_resources_assignment_idx on public.assignment_resources (assignment_id, position);

alter table public.assignment_resources enable row level security;
create policy "read assignment resources" on public.assignment_resources for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_access_assessment_version(a.version_id)));
-- An instructor may only register objects under their own upload prefix, so a row can never be
-- pointed at someone else's private file to obtain a signed URL for it.
create policy "add assignment resources" on public.assignment_resources for insert to authenticated
  with check (
    storage_path like (auth.uid()::text || '/%')
    and exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_version(a.version_id))
  );
create policy "remove assignment resources" on public.assignment_resources for delete to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_version(a.version_id)));
revoke all on public.assignment_resources from anon;
revoke update on public.assignment_resources from authenticated;

-- 3. Submissions must use one of the assignment's allowed types.
create function public.assignment_file_ext(p_mime text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_mime
    when 'application/pdf' then 'pdf'
    when 'application/msword' then 'doc'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.ms-powerpoint' then 'ppt'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'application/zip' then 'zip'
    when 'text/plain' then 'txt'
    when 'image/png' then 'png'
    when 'image/jpeg' then 'jpg'
  end;
$$;

create or replace function public.submit_assignment(
  p_assignment_id uuid,
  p_user_id uuid,
  p_text text,
  p_file_path text,
  p_file_name text,
  p_file_size int,
  p_file_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments;
  existing public.assignment_submissions;
  v_late boolean := false;
  v_text text := coalesce(trim(p_text), '');
begin
  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  if not exists (
    select 1 from public.enrollments e
     where e.user_id = p_user_id and e.version_id = a.version_id and e.status <> 'cancelled'
  ) then
    return jsonb_build_object('result', 'not_enrolled');
  end if;

  if a.due_at is not null and now() > a.due_at then
    if not a.allow_late then return jsonb_build_object('result', 'closed'); end if;
    v_late := true;
  end if;

  select * into existing from public.assignment_submissions
   where assignment_id = p_assignment_id and user_id = p_user_id;
  if found and existing.status = 'graded' then return jsonb_build_object('result', 'graded'); end if;

  if v_text = '' and p_file_path is null then return jsonb_build_object('result', 'empty'); end if;
  if v_text <> '' and not a.allow_text then return jsonb_build_object('result', 'text_not_allowed'); end if;
  if p_file_path is not null and not a.allow_file then return jsonb_build_object('result', 'file_not_allowed'); end if;
  if p_file_path is not null
     and coalesce(public.assignment_file_ext(p_file_type) = any (a.allowed_file_types), false) = false then
    return jsonb_build_object('result', 'file_type_not_allowed');
  end if;
  if p_file_path is not null and p_file_size > a.max_file_mb * 1024 * 1024 then
    return jsonb_build_object('result', 'file_too_large');
  end if;

  insert into public.assignment_submissions
    (assignment_id, user_id, text_answer, file_path, file_name, file_size, file_type, is_late, submitted_at)
  values
    (p_assignment_id, p_user_id, v_text, p_file_path, p_file_name, p_file_size, p_file_type, v_late, now())
  on conflict (assignment_id, user_id) do update
    set text_answer = excluded.text_answer,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        file_type = excluded.file_type,
        is_late = excluded.is_late,
        submitted_at = excluded.submitted_at;

  return jsonb_build_object('result', 'ok', 'previous_file_path', existing.file_path);
end;
$$;
revoke all on function public.submit_assignment(uuid, uuid, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.submit_assignment(uuid, uuid, text, text, text, int, text) to service_role;

-- 4. Create an assignment from the Assignments page (ADR-030). Targets: the live version (if the
--    course is published) and the newest version when it is an editable draft, so the next
--    publish keeps it. A course that is only in review has no target and is refused.
create function public.create_course_assignment(
  p_course_id uuid,
  p_title text,
  p_instructions text,
  p_due_at timestamptz,
  p_max_points int,
  p_allowed_file_types text[],
  p_resources jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses;
  v_newest public.course_versions;
  v_targets uuid[] := '{}';
  v_target uuid;
  v_id uuid;
  v_first uuid;
  v_resources jsonb := coalesce(p_resources, '[]'::jsonb);
begin
  select * into v_course from public.courses where id = p_course_id;
  if not found or auth.uid() is null or v_course.instructor_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_resources) <> 'array' or jsonb_array_length(v_resources) > 5 then
    raise exception 'at most 5 reference files' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_resources) x
     where coalesce(x->>'storage_path', '') not like (auth.uid()::text || '/%')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_course.published_version_id is not null then
    v_targets := v_targets || v_course.published_version_id;
  end if;
  select * into v_newest from public.course_versions where course_id = p_course_id order by version_number desc limit 1;
  if found and v_newest.status in ('draft', 'changes_requested') and v_newest.id is distinct from v_course.published_version_id then
    v_targets := v_targets || v_newest.id;
  end if;
  if cardinality(v_targets) = 0 then
    raise exception 'course is locked' using errcode = '22023';
  end if;

  foreach v_target in array v_targets loop
    insert into public.assignments (version_id, title, instructions, due_at, max_points, allowed_file_types, allow_file, position)
    values (
      v_target, p_title, coalesce(p_instructions, ''), p_due_at, p_max_points, p_allowed_file_types, true,
      coalesce((select max(position) + 1 from public.assignments where version_id = v_target), 0)
    )
    returning id into v_id;
    insert into public.assignment_resources (assignment_id, name, storage_path, mime_type, size_bytes, position)
      select v_id, x->>'name', x->>'storage_path', x->>'mime_type', (x->>'size_bytes')::bigint, (ord - 1)::int
        from jsonb_array_elements(v_resources) with ordinality as t(x, ord);
    if v_first is null then v_first := v_id; end if;
  end loop;

  return v_first;
end;
$$;
revoke all on function public.create_course_assignment(uuid, text, text, timestamptz, int, text[], jsonb) from public, anon;
grant execute on function public.create_course_assignment(uuid, text, text, timestamptz, int, text[], jsonb) to authenticated;

-- 5. Every assignment on the caller's own courses: from the live version when the course is
--    published, otherwise from the newest version (so a live assignment and its draft copy never
--    both appear). Archived courses are left out.
create function public.instructor_assignments_overview()
returns table (
  assignment_id uuid, title text, course_id uuid, course_title text, version_id uuid, version_status text,
  is_live boolean, due_at timestamptz, allow_late boolean, max_points int,
  submissions int, ungraded int, enrolled int, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cur as (
    select c.id as course_id,
           c.published_version_id,
           coalesce(
             c.published_version_id,
             (select v.id from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)
           ) as version_id
      from public.courses c
     where c.instructor_id = auth.uid()
  )
  select a.id, a.title, cur.course_id, v.title, v.id, v.status,
         v.id = cur.published_version_id,
         a.due_at, a.allow_late, a.max_points,
         (select count(*) from public.assignment_submissions s where s.assignment_id = a.id)::int,
         (select count(*) from public.assignment_submissions s where s.assignment_id = a.id and s.status <> 'graded')::int,
         (select count(*) from public.enrollments e where e.version_id = v.id and e.status <> 'cancelled')::int,
         a.created_at
    from cur
    join public.course_versions v on v.id = cur.version_id
    join public.assignments a on a.version_id = v.id
   where v.status <> 'archived'
   order by a.due_at nulls last, a.created_at desc
   limit 500;
$$;
revoke all on function public.instructor_assignments_overview() from public, anon;
grant execute on function public.instructor_assignments_overview() to authenticated;

-- 6. New draft versions carry allowed file types and reference files (shared storage objects).
create or replace function public.create_draft_version(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.course_versions;
  v_new uuid;
  sec record;
  les record;
  a record;
  q record;
  o record;
  sp record;
  v_sec uuid;
  v_les uuid;
  v_a uuid;
  v_q uuid;
  v_opt uuid;
  v_correct uuid[];
  key_row public.assessment_answer_keys;
begin
  if auth.uid() is null or not exists (
    select 1 from public.courses c where c.id = p_course_id and c.instructor_id = auth.uid()
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into src from public.course_versions
   where course_id = p_course_id order by version_number desc limit 1;
  if not found then raise exception 'course has no version' using errcode = '22023'; end if;
  if src.status not in ('published', 'archived') then
    raise exception 'the newest version is already being edited' using errcode = '22023';
  end if;

  insert into public.course_versions
    (course_id, version_number, status, title, subtitle, description, level, language, thumbnail_url,
     price_cents, currency, outcomes, requirements, certificate_enabled, visibility)
  values
    (p_course_id, src.version_number + 1, 'draft', src.title, src.subtitle, src.description, src.level, src.language,
     src.thumbnail_url, src.price_cents, src.currency, src.outcomes, src.requirements, src.certificate_enabled, src.visibility)
  returning id into v_new;

  create temp table _lesson_map (old_id uuid primary key, new_id uuid) on commit drop;

  for sec in select * from public.course_sections where version_id = src.id order by position loop
    insert into public.course_sections (version_id, title, position) values (v_new, sec.title, sec.position)
    returning id into v_sec;
    for les in select * from public.lessons where section_id = sec.id order by position loop
      insert into public.lessons (section_id, title, type, position, content, video_url, duration_minutes, is_preview)
      values (v_sec, les.title, les.type, les.position, les.content, les.video_url, les.duration_minutes, les.is_preview)
      returning id into v_les;
      insert into _lesson_map values (les.id, v_les);
      insert into public.lesson_assets (lesson_id, name, storage_path, mime_type, size_bytes)
        select v_les, name, storage_path, mime_type, size_bytes from public.lesson_assets where lesson_id = les.id;

      if les.type = 'scorm' then
        select * into sp from public.scorm_packages where lesson_id = les.id;
        if found then
          insert into public.scorm_packages
            (lesson_id, version, title, launch_path, storage_prefix, file_paths, file_count, total_bytes, uploaded_by)
          values
            (v_les, sp.version, sp.title, sp.launch_path, sp.storage_prefix, sp.file_paths, sp.file_count, sp.total_bytes, sp.uploaded_by);
        end if;
      end if;
    end loop;
  end loop;

  for a in select * from public.assessments where version_id = src.id order by position loop
    insert into public.assessments (version_id, lesson_id, title, description, pass_mark, max_attempts, time_limit_minutes, position)
    values (v_new, (select new_id from _lesson_map where old_id = a.lesson_id), a.title, a.description, a.pass_mark,
            a.max_attempts, a.time_limit_minutes, a.position)
    returning id into v_a;
    for q in select * from public.assessment_questions where assessment_id = a.id order by position loop
      insert into public.assessment_questions (assessment_id, type, prompt, points, position)
      values (v_a, q.type, q.prompt, q.points, q.position) returning id into v_q;
      select * into key_row from public.assessment_answer_keys where question_id = q.id;
      v_correct := '{}';
      for o in select * from public.assessment_options where question_id = q.id order by position loop
        insert into public.assessment_options (question_id, label, position) values (v_q, o.label, o.position)
        returning id into v_opt;
        if key_row.correct_option_ids is not null and o.id = any (key_row.correct_option_ids) then
          v_correct := v_correct || v_opt;
        end if;
      end loop;
      insert into public.assessment_answer_keys (question_id, correct_option_ids, accepted_answers, explanation)
      values (v_q, v_correct, coalesce(key_row.accepted_answers, '{}'), coalesce(key_row.explanation, ''));
    end loop;
  end loop;

  for a in select * from public.assignments where version_id = src.id order by position loop
    insert into public.assignments (version_id, lesson_id, title, instructions, due_at, max_points, allow_late,
                                    allow_text, allow_file, max_file_mb, allowed_file_types, position)
    values (v_new, (select new_id from _lesson_map where old_id = a.lesson_id), a.title, a.instructions, a.due_at,
            a.max_points, a.allow_late, a.allow_text, a.allow_file, a.max_file_mb, a.allowed_file_types, a.position)
    returning id into v_a;
    insert into public.assignment_rubric_criteria (assignment_id, position, title, description, max_points)
      select v_a, position, title, description, max_points
        from public.assignment_rubric_criteria where assignment_id = a.id;
    insert into public.assignment_resources (assignment_id, name, storage_path, mime_type, size_bytes, position)
      select v_a, name, storage_path, mime_type, size_bytes, position
        from public.assignment_resources where assignment_id = a.id;
  end loop;

  insert into public.course_prerequisites (version_id, prerequisite_course_id)
    select v_new, prerequisite_course_id from public.course_prerequisites where version_id = src.id;

  return v_new;
end;
$$;

revoke all on function public.create_draft_version(uuid) from public, anon;
grant execute on function public.create_draft_version(uuid) to authenticated;
