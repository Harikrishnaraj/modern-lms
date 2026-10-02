-- T-140: Platform analytics — saved reports and scheduled export (F-412). Dashboards already
-- existed (T-098-ish admin_analytics.sql); this adds saving a report config (date range) and
-- scheduling a recurring CSV export of it. Personal to the admin who created it, like
-- resource_library_items (T-111) -- owner-scoped RLS, no cross-admin sharing in this first cut.

create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  range_days int not null check (range_days in (7, 30, 90)),
  schedule text not null default 'none' check (schedule in ('none', 'daily', 'weekly', 'monthly')),
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_reports_owner_idx on public.saved_reports (owner_id, created_at desc);
create index saved_reports_due_idx on public.saved_reports (next_run_at) where schedule <> 'none';
create trigger saved_reports_updated_at before update on public.saved_reports
  for each row execute function public.set_updated_at();

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  saved_report_id uuid not null references public.saved_reports (id) on delete cascade,
  generated_at timestamptz not null default now(),
  storage_path text not null,
  row_count int not null default 0 check (row_count >= 0),
  triggered_by text not null check (triggered_by in ('manual', 'scheduled'))
);
create index report_exports_report_idx on public.report_exports (saved_report_id, generated_at desc);

alter table public.saved_reports enable row level security;
alter table public.report_exports enable row level security;

create policy "own saved reports" on public.saved_reports for all to authenticated
  using (owner_id = auth.uid() and public.has_permission('analytics.read'))
  with check (owner_id = auth.uid() and public.has_permission('analytics.read'));

create policy "read own report exports" on public.report_exports for select to authenticated
  using (exists (select 1 from public.saved_reports sr where sr.id = saved_report_id and sr.owner_id = auth.uid()));
create policy "insert own report exports" on public.report_exports for insert to authenticated
  with check (exists (select 1 from public.saved_reports sr where sr.id = saved_report_id and sr.owner_id = auth.uid()));

revoke all on public.saved_reports, public.report_exports from anon, authenticated;
grant select, insert, update, delete on public.saved_reports to authenticated;
grant select, insert on public.report_exports to authenticated;
