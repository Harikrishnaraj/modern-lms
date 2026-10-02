-- T-161: Admin Organizations screen — create, members, learning hours (F-500).
-- organizations/departments/teams/organization_members and their RLS already exist (T-160), so
-- plain create/update/delete goes straight through the table-level RLS from the TS action layer
-- (same pattern as categories management, T-134). This migration only adds the read-side RPCs:
-- the list and detail queries join across tables RLS would otherwise force N+1 round trips for,
-- and "learning hours" is a real aggregate query best done in SQL.

create function public.admin_organizations(
  p_q text default '',
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  member_count bigint,
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
  if not public.has_permission('organizations.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug,
         (select count(*) from public.organization_members m where m.organization_id = o.id),
         o.created_at,
         count(*) over () as total
    from public.organizations o
   where v_q = '' or lower(o.name) like '%' || v_q || '%' or lower(o.slug) like '%' || v_q || '%'
   order by o.name asc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_organizations(text, int, int) from public, anon;
grant execute on function public.admin_organizations(text, int, int) to authenticated;

-- "Learning hours" is every hour org members have logged across their own enrollments (the same
-- last_position_seconds counter T-108's instructor analytics already uses for watch time), summed
-- across the whole organization. Available to a platform admin or that organization's own admin,
-- since T-162's scoped portal will reuse this same detail view.
create function public.admin_organization_detail(p_org_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  created_at timestamptz,
  member_count bigint,
  learning_hours numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug, o.created_at,
         (select count(*) from public.organization_members m where m.organization_id = o.id),
         coalesce((
           select round(sum(lp.last_position_seconds) / 3600.0, 1)
             from public.organization_members m
             join public.enrollments e on e.user_id = m.user_id
             join public.lesson_progress lp on lp.enrollment_id = e.id
            where m.organization_id = o.id
         ), 0)
    from public.organizations o
   where o.id = p_org_id;
end;
$$;
revoke all on function public.admin_organization_detail(uuid) from public, anon;
grant execute on function public.admin_organization_detail(uuid) to authenticated;

create function public.admin_organization_members(p_org_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  full_name text,
  email text,
  org_role text,
  team_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select m.id, m.user_id, p.full_name, u.email::text, m.org_role, t.name, m.created_at
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    left join public.teams t on t.id = m.team_id
   where m.organization_id = p_org_id
   order by m.created_at asc;
end;
$$;
revoke all on function public.admin_organization_members(uuid) from public, anon;
grant execute on function public.admin_organization_members(uuid) to authenticated;
