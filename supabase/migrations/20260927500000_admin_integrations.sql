-- T-142: Integrations & API (F-415). Scoped, per user decision, to a read-only reporting API
-- (courses/enrollments/completions/certificates) authenticated by hashed API keys, plus outbound
-- webhooks for a curated event set (enrollment.created, course.completed, certificate.issued).
-- Platform-wide admin config, not owner-scoped -- any admin with integrations.manage sees all keys
-- and endpoints (matches how roles/categories/enrollments admin screens already work).

insert into public.permissions (id, description) values
  ('integrations.manage', 'Create/revoke API keys and manage webhook endpoints');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'integrations.manage'),
  ('super_admin', 'integrations.manage');

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 150),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_hash_idx on public.api_keys (key_hash);

create table public.api_request_log (
  id bigint generated always as identity primary key,
  api_key_id uuid references public.api_keys (id) on delete set null,
  method text not null,
  path text not null,
  status_code int not null,
  ip text,
  created_at timestamptz not null default now()
);
create index api_request_log_key_idx on public.api_request_log (api_key_id, created_at desc);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  response_status int,
  attempt_count int not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries (webhook_endpoint_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.api_request_log enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

-- key_hash is never selected by the app UI (the TS query list omits it), but it also can't be
-- reversed into the plaintext key even if read, so no extra masking is needed at the RLS layer.
create policy "manage api keys" on public.api_keys for all to authenticated
  using (public.has_permission('integrations.manage'))
  with check (public.has_permission('integrations.manage'));
create policy "read api request log" on public.api_request_log for select to authenticated
  using (public.has_permission('integrations.manage'));
create policy "manage webhook endpoints" on public.webhook_endpoints for all to authenticated
  using (public.has_permission('integrations.manage'))
  with check (public.has_permission('integrations.manage'));
create policy "read webhook deliveries" on public.webhook_deliveries for select to authenticated
  using (public.has_permission('integrations.manage'));

-- Only the service-role client (the public API route, and the server-side dispatcher) writes
-- api_request_log / webhook_deliveries, so no insert policy is needed for either -- service role
-- bypasses RLS entirely.
revoke all on public.api_keys, public.api_request_log, public.webhook_endpoints, public.webhook_deliveries from anon, authenticated;
grant select, insert, update, delete on public.api_keys to authenticated;
grant select on public.api_request_log to authenticated;
grant select, insert, update, delete on public.webhook_endpoints to authenticated;
grant select on public.webhook_deliveries to authenticated;
