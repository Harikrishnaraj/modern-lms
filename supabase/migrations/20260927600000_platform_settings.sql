-- T-143: Settings & Security (F-416). A single configurable row governing password/MFA/session
-- policy, seeded with values matching today's hardcoded behavior exactly, so nothing changes
-- until an admin edits it. Readable by anyone (even signed-out visitors: signup/reset need
-- min_password_length before the caller has a session) -- none of these values are secret.

create table public.platform_settings (
  id boolean primary key default true check (id),
  min_password_length int not null default 8 check (min_password_length between 8 and 128),
  mfa_required_portals text[] not null default '{admin}',
  session_idle_timeout_minutes int check (session_idle_timeout_minutes is null or session_idle_timeout_minutes between 5 and 10080),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.platform_settings (id) values (true);

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.permissions (id, description) values
  ('settings.manage', 'Change platform password/MFA/session policy');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'settings.manage'),
  ('super_admin', 'settings.manage');

alter table public.platform_settings enable row level security;

create policy "anyone reads platform settings" on public.platform_settings for select using (true);
create policy "manage platform settings" on public.platform_settings for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;
