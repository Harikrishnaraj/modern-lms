-- T-133: Roles & Permissions matrix editor (F-404). roles/permissions/role_permissions already
-- have open SELECT for every authenticated user (T-012 — non-sensitive reference data every
-- permission check needs to read), so this only adds the write path.

insert into public.permissions (id, description) values
  ('permissions.manage', 'Edit which permissions each role has');
-- Editing the permission matrix can change what every other role (including "admin") is capable
-- of, so it is more sensitive than ordinary user/role management (user.manage) and is restricted
-- to Super Admin only.
insert into public.role_permissions (role_id, permission_id) values
  ('super_admin', 'permissions.manage');

create function public.set_role_permission(p_role_id text, p_permission_id text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('permissions.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.permissions where id = p_permission_id) then
    raise exception 'unknown permission' using errcode = '22023';
  end if;

  -- Guardrail (this task's "last Super Admin" protection, applied to the permission matrix
  -- itself): never remove the permissions Super Admin needs to fix a mistake made here, or to
  -- reach the admin console at all. Losing these would require direct database access to recover.
  if p_role_id = 'super_admin' and not p_granted
     and p_permission_id in ('permissions.manage', 'user.manage', 'portal.admin.access') then
    raise exception 'cannot remove this permission from Super Admin' using errcode = '23514';
  end if;

  if p_granted then
    insert into public.role_permissions (role_id, permission_id) values (p_role_id, p_permission_id)
    on conflict (role_id, permission_id) do nothing;
  else
    delete from public.role_permissions where role_id = p_role_id and permission_id = p_permission_id;
  end if;
end;
$$;

revoke all on function public.set_role_permission(text, text, boolean) from public, anon;
grant execute on function public.set_role_permission(text, text, boolean) to authenticated;
