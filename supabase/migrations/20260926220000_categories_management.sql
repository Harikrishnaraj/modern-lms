-- T-134: categories management (F-405). categories already has open SELECT (T-030, needed for
-- course browsing); this adds the write path.

alter table public.categories
  add constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint categories_name_length check (char_length(name) between 1 and 100);

insert into public.permissions (id, description) values
  ('categories.manage', 'Create, edit and delete course categories');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'categories.manage'),
  ('super_admin', 'categories.manage');

create policy "staff manage categories" on public.categories for all to authenticated
  using (public.has_permission('categories.manage'))
  with check (public.has_permission('categories.manage'));

grant insert, update, delete on public.categories to authenticated;
