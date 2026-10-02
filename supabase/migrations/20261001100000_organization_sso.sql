-- T-165 (F-504, ADR-033): organization SSO via Google Workspace.
--
-- An organization lists the Google Workspace domain(s) it owns. A person who signs in with Google
-- and whose Google account belongs to one of those Workspaces is placed in that organization.
--
-- The Workspace is read from Google's verified `hd` (hosted domain) ID-token claim, which Supabase
-- Auth stores as identity_data.custom_claims.hd on the user's google row in auth.identities
-- (supabase/auth internal/api/provider/oidc.go). It is only present for Workspace accounts, so a
-- personal Google account that merely uses a company address never matches. auth.identities is
-- written by the Auth server only; the user-editable raw_user_meta_data copy is never trusted.

create table public.organization_sso_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  domain text not null unique
    check (
      domain = lower(domain)
      and char_length(domain) between 3 and 253
      and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
      -- Consumer mail domains never identify one organization.
      and domain not in ('gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
                         'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com')
    ),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index organization_sso_domains_org_idx on public.organization_sso_domains (organization_id);

alter table public.organization_sso_domains enable row level security;
create policy "platform admin or own org admin reads sso domains" on public.organization_sso_domains
  for select to authenticated
  using (public.has_permission('organizations.manage') or public.is_org_admin(organization_id));
create policy "platform admin adds sso domains" on public.organization_sso_domains
  for insert to authenticated
  with check (public.has_permission('organizations.manage') and created_by = auth.uid());
create policy "platform admin removes sso domains" on public.organization_sso_domains
  for delete to authenticated
  using (public.has_permission('organizations.manage'));
revoke all on public.organization_sso_domains from anon;
revoke update on public.organization_sso_domains from authenticated;

-- Places the signed-in user in the organization that owns their Google Workspace domain.
-- Idempotent; a member of another organization is never moved (one organization per user, T-160).
-- Returns {result, organization_id}: result is joined | already_member | other_org | no_match | not_sso.
create function public.join_organization_via_sso()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hd text;
  v_org uuid;
  v_current uuid;
  v_email text;
  v_inserted int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select lower(nullif(i.identity_data -> 'custom_claims' ->> 'hd', ''))
    into v_hd
    from auth.identities i
   where i.user_id = v_uid and i.provider = 'google'
   order by i.last_sign_in_at desc nulls last
   limit 1;
  if not found then
    return jsonb_build_object('result', 'not_sso');
  end if;
  if v_hd is null then
    return jsonb_build_object('result', 'no_match');
  end if;

  select organization_id into v_org from public.organization_sso_domains where domain = v_hd and provider = 'google';
  if v_org is null then
    return jsonb_build_object('result', 'no_match');
  end if;

  select organization_id into v_current from public.organization_members where user_id = v_uid;
  if v_current = v_org then
    return jsonb_build_object('result', 'already_member', 'organization_id', v_org);
  elsif v_current is not null then
    return jsonb_build_object('result', 'other_org', 'organization_id', v_current);
  end if;

  insert into public.organization_members (organization_id, user_id, org_role)
  values (v_org, v_uid, 'member')
  on conflict (user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Joined some organization concurrently; report what is there now.
    select organization_id into v_current from public.organization_members where user_id = v_uid;
    return jsonb_build_object('result', case when v_current = v_org then 'already_member' else 'other_org' end,
                              'organization_id', v_current);
  end if;

  select email into v_email from auth.users where id = v_uid;
  insert into public.audit_logs (actor_id, actor_email, action, resource_type, resource_id, metadata)
  values (v_uid, v_email, 'organization.member_joined_via_sso', 'organization', v_org::text,
          jsonb_build_object('provider', 'google', 'domain', v_hd));

  return jsonb_build_object('result', 'joined', 'organization_id', v_org);
end;
$$;
revoke all on function public.join_organization_via_sso() from public, anon;
grant execute on function public.join_organization_via_sso() to authenticated;
