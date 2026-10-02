-- T-111: instructor resource library — reusable media/documents with usage count (F-219).
-- An item is uploaded once and can be attached to any of the owner's lessons; the storage object
-- is copied into the lesson-assets bucket on attach (so the existing attachment/download code
-- needs no changes), and the usage row cascades away automatically if that attachment is later
-- removed via the existing lesson-editor "remove attachment" action -- nothing else has to change
-- to keep the usage count correct.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resource-library', 'resource-library', false, 10485760, array[
    'application/pdf', 'application/zip', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.resource_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index resource_library_items_owner_idx on public.resource_library_items (owner_id, created_at desc);
alter table public.resource_library_items enable row level security;

create policy "own resource library" on public.resource_library_items for all to authenticated
  using (owner_id = auth.uid() and public.has_permission('course.create'))
  with check (owner_id = auth.uid() and public.has_permission('course.create'));

revoke all on public.resource_library_items from anon, authenticated;
grant select, insert, delete on public.resource_library_items to authenticated;

-- Which lesson attachment (if any) a library resource was used to create.
create table public.resource_library_usages (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_library_items (id) on delete cascade,
  lesson_asset_id uuid not null unique references public.lesson_assets (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index resource_library_usages_resource_idx on public.resource_library_usages (resource_id);
alter table public.resource_library_usages enable row level security;

create policy "owner reads own resource usages" on public.resource_library_usages for select to authenticated
  using (exists (
    select 1 from public.resource_library_items r
     where r.id = resource_id and r.owner_id = auth.uid()
  ));

-- Attaching (inserting a usage row) requires owning both the resource and the lesson the
-- attachment was just created on. There is no update/delete policy: rows only ever disappear
-- through the lesson_assets cascade above.
create policy "owner attaches own resource to own lesson" on public.resource_library_usages for insert to authenticated
  with check (
    exists (select 1 from public.resource_library_items r where r.id = resource_id and r.owner_id = auth.uid())
    and exists (
      select 1
        from public.lesson_assets la
        join public.lessons l on l.id = la.lesson_id
        join public.course_sections cs on cs.id = l.section_id
        join public.course_versions cv on cv.id = cs.version_id
        join public.courses c on c.id = cv.course_id
       where la.id = lesson_asset_id and c.instructor_id = auth.uid()
    )
  );

revoke all on public.resource_library_usages from anon, authenticated;
grant select, insert on public.resource_library_usages to authenticated;

-- Library listing scoped to the caller, with a live usage count.
create function public.instructor_resource_library(p_query text default null)
returns table (
  id uuid,
  name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz,
  usage_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.storage_path, r.mime_type, r.size_bytes, r.created_at,
         count(u.id) as usage_count
    from public.resource_library_items r
    left join public.resource_library_usages u on u.resource_id = r.id
   where r.owner_id = auth.uid()
     and (p_query is null or r.name ilike '%' || p_query || '%')
   group by r.id
   order by r.created_at desc;
$$;

revoke all on function public.instructor_resource_library(text) from public, anon;
grant execute on function public.instructor_resource_library(text) to authenticated;
