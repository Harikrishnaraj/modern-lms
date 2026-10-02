-- Fix: the scheduled-reports cron runs with the service role, which has no auth.uid(), so
-- has_permission() refused it and no scheduled export could ever be generated. Allow the
-- service role explicitly; every other caller still needs analytics.read.
create or replace function public.admin_analytics_daily(p_days int default 30)
returns table (day date, enrollments int, completions int, signups int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select d::date,
         (select count(*)::int from public.enrollments e
           where e.enrolled_at::date = d::date and e.status <> 'cancelled'),
         (select count(*)::int from public.enrollments e
           where e.completed_at::date = d::date),
         (select count(*)::int from public.profiles p
           where p.created_at::date = d::date)
    from generate_series(current_date - (v_days - 1), current_date, interval '1 day') as d
   order by d;
end;
$$;
grant execute on function public.admin_analytics_daily(int) to service_role;
