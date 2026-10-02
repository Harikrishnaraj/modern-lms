-- T-243 (F-943, SECURITY.md §21 Privacy): self-service account deletion request/cancel, and the
-- retention jobs that actually carry it out plus prune old audit log rows. No specific grace
-- period or audit retention window is specified anywhere in docs/, so these are a deliberate
-- scoped choice (documented in docs/MEMORY.md): 30 days to change your mind after requesting
-- deletion, 2 years of audit log history.

alter table public.profiles add column if not exists deletion_requested_at timestamptz;

-- Same column-grant pattern as T-086 (full_name/avatar_url) and T-112 (headline/bio): RLS already
-- restricts writes to the caller's own row, this just says which columns a plain self-service
-- update may touch.
grant update (deletion_requested_at) on public.profiles to authenticated;

-- Deletes the auth.users row for every profile whose deletion request is past the grace period.
-- profiles.id (and every other user-owned table, following the same convention) references
-- auth.users(id) on delete cascade, so this one delete removes the account's data everywhere.
-- Only pg_cron (scheduled below, runs as the migration owner) may call it -- never authenticated
-- or anon, since it bypasses RLS entirely by design.
create or replace function public.purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from auth.users
  where id in (
    select id from public.profiles
    where deletion_requested_at is not null and deletion_requested_at < now() - interval '30 days'
  );
  get diagnostics purged = row_count;
  return purged;
end;
$$;
revoke all on function public.purge_expired_accounts() from public, anon, authenticated;

-- Audit log retention (SECURITY.md §21 "retention policies"). Same access shape: cron-only.
create or replace function public.purge_old_audit_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from public.audit_logs where created_at < now() - interval '2 years';
  get diagnostics purged = row_count;
  return purged;
end;
$$;
revoke all on function public.purge_old_audit_logs() from public, anon, authenticated;

create extension if not exists pg_cron;

-- cron.schedule() upserts by job name, so re-running this migration is safe.
select cron.schedule('purge-expired-accounts-daily', '0 3 * * *', $$select public.purge_expired_accounts();$$);
select cron.schedule('purge-old-audit-logs-weekly', '0 4 * * 0', $$select public.purge_old_audit_logs();$$);
