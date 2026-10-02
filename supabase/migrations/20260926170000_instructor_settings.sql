-- T-112: instructor settings — public profile (headline/bio), payout details, notifications (F-220).

alter table public.profiles
  add column headline text check (char_length(headline) <= 150),
  add column bio text check (char_length(bio) <= 2000);

grant update (headline, bio) on public.profiles to authenticated;

-- Payout details: a lightweight reference captured ahead of real payout processing (Commerce
-- phase, T-186). Deliberately NOT a bank/card account number store (SECURITY SS13: "Do not store
-- raw card data") -- a marketplace payout ecosystem is a non-goal for the first slice (PRD SS5).
create table public.instructor_payout_details (
  instructor_id uuid primary key references public.profiles (id) on delete cascade,
  payout_method text not null check (payout_method in ('paypal', 'bank_transfer', 'other')),
  payout_reference text not null check (char_length(payout_reference) between 1 and 200),
  updated_at timestamptz not null default now()
);
alter table public.instructor_payout_details enable row level security;

create policy "own payout details" on public.instructor_payout_details for all to authenticated
  using (instructor_id = auth.uid() and public.has_permission('course.create'))
  with check (instructor_id = auth.uid() and public.has_permission('course.create'));

revoke all on public.instructor_payout_details from anon, authenticated;
grant select, insert, update, delete on public.instructor_payout_details to authenticated;

-- Course detail now also surfaces the instructor's public headline/bio (return type changes, so
-- the function must be dropped and recreated).
drop function public.get_course_detail(text);

create function public.get_course_detail(p_slug text)
returns table (
  id uuid,
  slug text,
  version_id uuid,
  title text,
  subtitle text,
  description text,
  level text,
  language text,
  price_cents int,
  currency text,
  duration_minutes int,
  thumbnail_url text,
  outcomes text[],
  requirements text[],
  certificate_enabled boolean,
  rating_avg numeric,
  rating_count int,
  category_slug text,
  category_name text,
  instructor_name text,
  instructor_headline text,
  instructor_bio text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, v.id, v.title, v.subtitle, v.description, v.level, v.language,
         v.price_cents, v.currency, v.duration_minutes, v.thumbnail_url, v.outcomes,
         v.requirements, v.certificate_enabled, c.rating_avg, c.rating_count,
         cat.slug, cat.name, p.full_name, p.headline, p.bio, v.published_at
    from public.courses c
    join public.course_versions v on v.id = c.published_version_id
    left join public.categories cat on cat.id = c.category_id
    left join public.profiles p on p.id = c.instructor_id
   where c.slug = p_slug;
$$;

grant execute on function public.get_course_detail(text) to anon, authenticated;
