-- T-141: Communication — targeted announcements, email templates, delivery log (F-413).
-- Sending itself (Resend HTTP call) can't happen in Postgres, so this only owns storage +
-- authorization + audience resolution; the server action loops over resolve_announcement_targets
-- and calls out to email/in-app notify per recipient, then writes one announcement_deliveries row
-- per recipient per channel (the "delivery log").

insert into public.permissions (id, description) values
  ('communication.manage', 'Create/send announcements and manage email templates');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'communication.manage'),
  ('super_admin', 'communication.manage');

create table public.announcement_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 150),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger announcement_templates_updated_at before update on public.announcement_templates
  for each row execute function public.set_updated_at();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.announcement_templates (id) on delete set null,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  target_type text not null check (target_type in ('all_learners', 'role', 'course')),
  target_role text references public.roles (id),
  target_course_id uuid references public.courses (id),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint announcements_target_shape check (
    (target_type = 'all_learners' and target_role is null and target_course_id is null) or
    (target_type = 'role' and target_role is not null and target_course_id is null) or
    (target_type = 'course' and target_course_id is not null and target_role is null)
  )
);
create index announcements_created_idx on public.announcements (created_at desc);

create table public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index announcement_deliveries_announcement_idx on public.announcement_deliveries (announcement_id, created_at desc);

alter table public.announcement_templates enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_deliveries enable row level security;

-- Shared admin tooling (like categories), not owner-scoped: any admin with communication.manage
-- can see/edit any template or announcement.
create policy "manage templates" on public.announcement_templates for all to authenticated
  using (public.has_permission('communication.manage')) with check (public.has_permission('communication.manage'));
create policy "manage announcements" on public.announcements for all to authenticated
  using (public.has_permission('communication.manage')) with check (public.has_permission('communication.manage'));
create policy "read deliveries" on public.announcement_deliveries for select to authenticated
  using (public.has_permission('communication.manage'));

revoke all on public.announcement_templates, public.announcements, public.announcement_deliveries from anon, authenticated;
grant select, insert, update, delete on public.announcement_templates to authenticated;
grant select, insert, update on public.announcements to authenticated;
grant select on public.announcement_deliveries to authenticated;
-- Delivery rows are written by the server action's service-role client only (one row per
-- recipient per channel, after the real send attempt), never directly by an admin's own session.

-- Resolves the audience for a target spec into (user_id, email) pairs. Used both to preview the
-- recipient count before sending and to drive the actual send loop, so the numbers always match.
create or replace function public.resolve_announcement_targets(
  p_target_type text,
  p_target_role text default null,
  p_target_course_id uuid default null
)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('communication.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_target_type = 'all_learners' then
    return query
      select p.id, u.email::text
        from public.profiles p
        join auth.users u on u.id = p.id
        join public.user_roles ur on ur.user_id = p.id and ur.role_id = 'learner'
       where p.status = 'active';
  elsif p_target_type = 'role' then
    if p_target_role is null then raise exception 'target_role required' using errcode = '22023'; end if;
    return query
      select p.id, u.email::text
        from public.profiles p
        join auth.users u on u.id = p.id
        join public.user_roles ur on ur.user_id = p.id and ur.role_id = p_target_role
       where p.status = 'active';
  elsif p_target_type = 'course' then
    if p_target_course_id is null then raise exception 'target_course_id required' using errcode = '22023'; end if;
    return query
      select distinct p.id, u.email::text
        from public.profiles p
        join auth.users u on u.id = p.id
        join public.enrollments e on e.user_id = p.id
       where e.course_id = p_target_course_id
         and e.status in ('active', 'completed')
         and p.status = 'active';
  else
    raise exception 'invalid target_type' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.resolve_announcement_targets(text, text, uuid) from public, anon;
grant execute on function public.resolve_announcement_targets(text, text, uuid) to authenticated;
