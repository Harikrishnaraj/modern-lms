-- Fix: admin_delete_scorm_package (from draft_version_copies_scorm) failed with "column
-- reference storage_prefix is ambiguous". The still-referenced check compared the bare column
-- name against v_prefix, which collides with the function's own RETURNS TABLE(storage_prefix
-- text, ...) OUT parameter -- the exact class of bug fix_scorm_delete already fixed once for
-- the DELETE ... RETURNING above it, just not here. Alias the table and qualify the column.
create or replace function public.admin_delete_scorm_package(p_package_id uuid)
returns table (storage_prefix text, file_paths jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_paths jsonb;
  v_still_referenced boolean;
begin
  if not public.has_permission('content.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.scorm_packages sp where sp.id = p_package_id returning sp.storage_prefix, sp.file_paths into v_prefix, v_paths;
  if not found then
    raise exception 'package not found' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.scorm_packages sp where sp.storage_prefix = v_prefix
  ) into v_still_referenced;

  -- Signal "do not touch storage" to the caller by returning no file_paths when another lesson
  -- version still uses this exact prefix.
  if v_still_referenced then
    return query select v_prefix, '[]'::jsonb;
  else
    return query select v_prefix, v_paths;
  end if;
end;
$$;
