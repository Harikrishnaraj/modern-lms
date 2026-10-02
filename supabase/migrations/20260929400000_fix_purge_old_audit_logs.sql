-- Fix: purge_old_audit_logs (T-243) never actually purged anything. audit_logs has a BEFORE
-- DELETE/UPDATE trigger (audit_logs_immutable, T-070) that raises unless app.audit_purge = 'on'
-- is set for the transaction, and this function never set it -- so its own DELETE was silently
-- blocked (0 rows matched the trigger's per-row check, since nothing had actually been deleted
-- for the trigger to fire on... in practice: the DELETE statement itself raised on the first
-- matching row). SET LOCAL scopes the exception to this function's call only.
create or replace function public.purge_old_audit_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  perform set_config('app.audit_purge', 'on', true); -- true = transaction-local (SET LOCAL)
  delete from public.audit_logs where created_at < now() - interval '2 years';
  get diagnostics purged = row_count;
  return purged;
end;
$$;
revoke all on function public.purge_old_audit_logs() from public, anon, authenticated;
