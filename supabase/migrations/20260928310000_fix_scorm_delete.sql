-- Fix: admin_delete_scorm_package failed with "column reference storage_prefix is ambiguous"
-- because RETURNING collided with the function's OUT columns. Alias the table and qualify.
create or replace function public.admin_delete_scorm_package(p_package_id uuid)
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
  delete from public.scorm_packages sp where sp.id = p_package_id returning sp.storage_prefix, sp.file_paths into v_prefix, v_paths;
  if not found then
    raise exception 'package not found' using errcode = '22023';
  end if;
  return query select v_prefix, v_paths;
end;
$$;
