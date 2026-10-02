-- T-160: organizations, departments, teams, organization_members + RLS isolation (F-500).
-- PRD §14 hierarchy: Organization -> Departments -> Teams -> Users. `org_admin` (T-012) already
-- exists as a role but currently only carries the same portal.admin.access every other back-office
-- role gets — that blanket grant is a placeholder from the original role seed, not real scoping.
-- Real "own org only" isolation (F-501) is this migration's job at the data layer; wiring a scoped
-- portal for org_admin is T-162's job, left untouched here.
--
-- A user belongs to at most one organization (unique on user_id alone): PRD/DESIGN never describe
-- multi-org membership, and every later Phase 8 feature (assigned learning, org reports, SSO
-- mapping) is far simpler to reason about, build and isolate when "which org is this user in" has
-- exactly one answer. Revisit only if a concrete multi-org requirement shows up.

insert into public.permissions (id, description) values
  ('organizations.manage', 'Create organizations and manage any organization''s structure/members');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'organizations.manage'),
  ('super_admin', 'organizations.manage');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index departments_org_idx on public.departments (organization_id);

-- organization_id is derived from department_id (set_team_organization below), never supplied by
-- the caller, so it can be trusted for RLS without joining through departments on every check.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (department_id, name)
);
create index teams_department_idx on public.teams (department_id);
create index teams_org_idx on public.teams (organization_id);

create function public.set_team_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select organization_id into strict new.organization_id
    from public.departments where id = new.department_id;
  return new;
end;
$$;
create trigger teams_set_organization before insert or update of department_id on public.teams
  for each row execute function public.set_team_organization();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  org_role text not null default 'member' check (org_role in ('org_admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id)
);
create index organization_members_org_idx on public.organization_members (organization_id);
create index organization_members_team_idx on public.organization_members (team_id);

-- A team's organization is trusted (set_team_organization), so this only needs to reject a
-- team_id whose organization doesn't match the membership row's own organization_id.
create function public.check_membership_team_org()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.team_id is not null and not exists (
    select 1 from public.teams where id = new.team_id and organization_id = new.organization_id
  ) then
    raise exception 'team does not belong to this organization' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger organization_members_check_team
  before insert or update of organization_id, team_id on public.organization_members
  for each row execute function public.check_membership_team_org();

-- security definer + stable, mirroring has_permission: callable from any of these tables' own RLS
-- policies without recursively re-checking organization_members' RLS on itself.
create function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
     where organization_id = p_org_id and user_id = auth.uid()
  );
$$;
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;

create function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
     where organization_id = p_org_id and user_id = auth.uid() and org_role = 'org_admin'
  );
$$;
revoke all on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.organization_members enable row level security;

create policy "read own org or manage all" on public.organizations for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_member(id));
create policy "platform admin writes organizations" on public.organizations for all to authenticated
  using (public.has_permission('organizations.manage'))
  with check (public.has_permission('organizations.manage'));

create policy "read own org departments or manage all" on public.departments for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_member(organization_id));
create policy "platform admin or org admin writes departments" on public.departments for all to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission('organizations.manage') or public.is_org_admin(organization_id));

create policy "read own org teams or manage all" on public.teams for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_member(organization_id));
create policy "platform admin or org admin writes teams" on public.teams for all to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission('organizations.manage') or public.is_org_admin(organization_id));

create policy "read own org members or manage all" on public.organization_members for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_member(organization_id));
create policy "platform admin or org admin writes members" on public.organization_members for all to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission('organizations.manage') or public.is_org_admin(organization_id));
