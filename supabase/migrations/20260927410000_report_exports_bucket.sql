-- T-140: private bucket for generated report CSVs, served only via a signed URL to the report's owner.
insert into storage.buckets (id, name, public, file_size_limit) values
  ('report-exports', 'report-exports', false, 10485760)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
