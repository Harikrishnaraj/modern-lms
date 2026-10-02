-- Fix: save_scorm_package only checked course ownership, so the owner could swap the package of a
-- submitted or published (live) version by calling the RPC directly, skipping review. Require the
-- lesson's version to be editable (owner + draft/changes_requested), same as the rest of authoring.
create or replace function public.save_scorm_package(
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
     where l.id = p_lesson_id and public.can_edit_version(s.version_id)
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
revoke all on function public.save_scorm_package(uuid, text, text, text, text, jsonb, int, bigint) from public, anon;
grant execute on function public.save_scorm_package(uuid, text, text, text, text, jsonb, int, bigint) to authenticated;
