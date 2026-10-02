-- T-162: Org Admin scoped portal access, own org only (F-501). `org_admin` has held
-- portal.admin.access since T-012 as a placeholder -- full admin console access, no org
-- scoping at all. This replaces that with a real, narrow portal permission.

delete from public.role_permissions where role_id = 'org_admin' and permission_id = 'portal.admin.access';

insert into public.permissions (id, description) values
  ('portal.org_admin.access', 'Access the scoped Org Admin portal (own organization only)');
insert into public.role_permissions (role_id, permission_id) values
  ('org_admin', 'portal.org_admin.access');

-- MFA previously applied to org_admin "for free" because they shared the admin portal; keep
-- that guarantee now that they have their own portal, but only for anyone who hasn't already
-- customized this setting away from its original seed.
update public.platform_settings
   set mfa_required_portals = array(select distinct unnest(mfa_required_portals || array['org_admin']))
 where mfa_required_portals = array['admin'];
alter table public.platform_settings alter column mfa_required_portals set default array['admin', 'org_admin'];

-- Org Admin can manage their own organization's name too (SECURITY.md §4: "Org Admin can manage
-- their organization"), not just its departments/teams/members -- T-160 only gave the platform
-- admin that column-level write.
drop policy "platform admin writes organizations" on public.organizations;
create policy "platform admin or org admin writes organizations" on public.organizations for all to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(id))
  with check (public.has_permission('organizations.manage') or public.is_org_admin(id));

-- The org-admin portal needs to find "my organization" without knowing its id up front.
create function public.my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;
revoke all on function public.my_organization_id() from public, anon;
grant execute on function public.my_organization_id() to authenticated;
