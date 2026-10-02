-- T-132: admin instructor detail — courses, revenue, rating distribution, payouts (F-403).
--
-- "Revenue" has no data source: the Commerce phase (orders/payments, T-180+) is not built yet, so
-- there is nothing real to show. This RPC returns account info, the instructor's courses, and a
-- real rating distribution across all of them; revenue is intentionally left out of the payload
-- rather than faked as zero (a real "$0" would be indistinguishable from "no revenue tracking
-- exists yet") — the page renders an explicit "not available" state instead (ADR-023).
-- "Payouts" reuses the real payout method/reference the instructor saved for themselves (T-112,
-- instructor_payout_details); actual payout transaction history is Commerce's instructor_payouts
-- table (T-186), not built yet either.

create function public.admin_instructor_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
  v_courses jsonb;
  v_distribution jsonb;
begin
  if not public.has_permission('user.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', u.email, 'created_at', p.created_at)
    into v_profile
    from public.profiles p
    join auth.users u on u.id = p.id
    join public.user_roles ur on ur.user_id = p.id and ur.role_id = 'instructor'
   where p.id = p_user_id;

  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'course_id', c.id,
           'slug', c.slug,
           'title', coalesce(v.title, c.slug),
           'status', coalesce(v.status, 'draft'),
           'is_live', c.published_version_id is not null,
           'learners', (select count(*) from public.enrollments e where e.course_id = c.id and e.status <> 'cancelled'),
           'rating_avg', c.rating_avg,
           'rating_count', c.rating_count
         ) order by c.created_at desc), '[]'::jsonb)
    into v_courses
    from public.courses c
    left join public.course_versions v
      on v.id = coalesce(c.published_version_id,
                          (select id from public.course_versions where course_id = c.id order by version_number desc limit 1))
   where c.instructor_id = p_user_id;

  select jsonb_object_agg(n::text, coalesce((
           select count(*)
             from public.course_ratings r
             join public.courses c on c.id = r.course_id
            where c.instructor_id = p_user_id and r.rating = n and not r.hidden
         ), 0))
    into v_distribution
    from generate_series(1, 5) n;

  return jsonb_build_object('profile', v_profile, 'courses', v_courses, 'rating_distribution', v_distribution);
end;
$$;

revoke all on function public.admin_instructor_detail(uuid) from public, anon;
grant execute on function public.admin_instructor_detail(uuid) to authenticated;

-- Staff need to see an instructor's saved payout method/reference (T-112) on this screen; the
-- existing "own payout details" policy only lets the instructor themselves read/write it. This is
-- an additional, read-only, permissive policy — Postgres RLS ORs multiple policies for one command.
create policy "staff read payout details" on public.instructor_payout_details for select to authenticated
  using (public.has_permission('user.read_all'));

