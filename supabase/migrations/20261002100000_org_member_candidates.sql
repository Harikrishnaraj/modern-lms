-- T-251: org admins could not add members. The org-admin portal's "add member" search used
-- admin_users(), which requires user.read_all (platform admins and support only), so every search
-- by an org admin failed with "not allowed". This dedicated search is callable by a platform
-- organizations manager or by an admin of that organization, and only returns people who are not
-- in any organization yet (a person belongs to at most one, T-160), so an org admin never browses
-- other organizations' members.
create function public.org_member_candidates(p_org_id uuid, p_q text)
returns table (user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_q := replace(replace(v_q, '%', ''), '_', '');
  if char_length(v_q) < 2 then
    return;
  end if;
  return query
  select p.id, p.full_name, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.status = 'active'
     and not exists (select 1 from public.organization_members m where m.user_id = p.id)
     and (lower(u.email) like '%' || v_q || '%' or lower(coalesce(p.full_name, '')) like '%' || v_q || '%')
   order by p.full_name nulls last, u.email
   limit 10;
end;
$$;
revoke all on function public.org_member_candidates(uuid, text) from public, anon;
grant execute on function public.org_member_candidates(uuid, text) to authenticated;
