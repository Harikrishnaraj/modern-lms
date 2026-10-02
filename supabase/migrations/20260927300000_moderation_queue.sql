-- T-139: Moderation (F-411). Reported posts/reviews queue, hide/restore, ban.
-- discussion_reports (T-083) already exists; reviews need the same reporting mechanism.
-- course_ratings.hidden was already added in T-087 with a comment reserving it for this task.
-- "Ban" reuses the existing setUserStatus("suspended") admin-users action -- no new mechanism.

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  review_id uuid not null references public.course_ratings (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  unique (reporter_id, review_id)
);
alter table public.review_reports enable row level security;

create policy "staff read review reports" on public.review_reports for select to authenticated
  using (public.has_permission('course.read_all'));
revoke all on public.review_reports from anon, authenticated;
grant select on public.review_reports to authenticated;

create function public.report_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select user_id into v_author from public.course_ratings where id = p_review_id;
  if v_author is null then
    raise exception 'review not found' using errcode = '22023';
  end if;
  if v_author = auth.uid() then
    raise exception 'you cannot report your own review' using errcode = '22023';
  end if;
  insert into public.review_reports (reporter_id, review_id, reason)
  values (auth.uid(), p_review_id, trim(p_reason))
  on conflict (reporter_id, review_id) do nothing;
end;
$$;
grant execute on function public.report_review(uuid, text) to authenticated;

insert into public.permissions (id, description) values
  ('moderation.manage', 'Hide/restore reported content and resolve moderation reports');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'moderation.manage'),
  ('super_admin', 'moderation.manage');

-- Open (or all) reports across discussion threads, discussion posts and reviews, newest first.
create function public.admin_moderation_queue(p_status text default 'open', p_limit int default 25, p_offset int default 0)
returns table (
  report_id uuid,
  report_kind text,
  reporter_name text,
  reporter_email text,
  reason text,
  status text,
  created_at timestamptz,
  target_id uuid,
  target_hidden boolean,
  target_snippet text,
  author_id uuid,
  author_name text,
  course_id uuid,
  course_title text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with combined as (
    select dr.id as report_id, 'thread'::text as report_kind, dr.reporter_id, dr.reason, dr.status, dr.created_at,
           d.id as target_id, d.hidden as target_hidden, d.title as target_snippet,
           d.author_id, d.course_id
      from public.discussion_reports dr
      join public.discussions d on d.id = dr.target_id and dr.target_type = 'thread'
    union all
    select dr.id, 'post'::text, dr.reporter_id, dr.reason, dr.status, dr.created_at,
           p.id, p.hidden, p.body,
           p.author_id, d.course_id
      from public.discussion_reports dr
      join public.discussion_posts p on p.id = dr.target_id and dr.target_type = 'post'
      join public.discussions d on d.id = p.discussion_id
    union all
    select rr.id, 'review'::text, rr.reporter_id, rr.reason, rr.status, rr.created_at,
           r.id, r.hidden, r.body,
           r.user_id, r.course_id
      from public.review_reports rr
      join public.course_ratings r on r.id = rr.review_id
  )
  select c.report_id, c.report_kind, rp.full_name, ru.email::text, c.reason, c.status, c.created_at,
         c.target_id, c.target_hidden, left(c.target_snippet, 200),
         c.author_id, ap.full_name, c.course_id, coalesce(v.title, co.slug),
         count(*) over () as total
    from combined c
    join public.profiles rp on rp.id = c.reporter_id
    join auth.users ru on ru.id = c.reporter_id
    join public.profiles ap on ap.id = c.author_id
    join public.courses co on co.id = c.course_id
    left join public.course_versions v on v.id = co.published_version_id
   where coalesce(p_status, '') = '' or c.status = p_status
   order by c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_moderation_queue(text, int, int) from public, anon;
grant execute on function public.admin_moderation_queue(text, int, int) to authenticated;

-- Sets hidden on the underlying content. p_kind matches report_kind ('thread' | 'post' | 'review').
create function public.admin_moderate_content(p_kind text, p_target_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('moderation.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind = 'thread' then
    update public.discussions set hidden = p_hidden where id = p_target_id;
  elsif p_kind = 'post' then
    update public.discussion_posts set hidden = p_hidden where id = p_target_id;
  elsif p_kind = 'review' then
    update public.course_ratings set hidden = p_hidden where id = p_target_id;
  else
    raise exception 'unknown content kind' using errcode = '22023';
  end if;
  if not found then
    raise exception 'content not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_moderate_content(text, uuid, boolean) from public, anon;
grant execute on function public.admin_moderate_content(text, uuid, boolean) to authenticated;

-- Marks one report resolved (dismiss, or after acting on it). p_report_kind: 'thread'/'post' share
-- discussion_reports; 'review' uses review_reports.
create function public.admin_resolve_report(p_report_kind text, p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('moderation.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_report_kind = 'review' then
    update public.review_reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid() where id = p_report_id;
  elsif p_report_kind in ('thread', 'post') then
    update public.discussion_reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid() where id = p_report_id;
  else
    raise exception 'unknown report kind' using errcode = '22023';
  end if;
  if not found then
    raise exception 'report not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_resolve_report(text, uuid) from public, anon;
grant execute on function public.admin_resolve_report(text, uuid) to authenticated;
