-- T-138: private storage buckets for SCORM. Uploads stage the raw zip in scorm-uploads (deleted
-- once extracted); scorm-packages holds the extracted, validated files served only through the
-- app's own authorization-checked proxy route -- never a public or directly signed URL.
insert into storage.buckets (id, name, public, file_size_limit) values
  ('scorm-uploads', 'scorm-uploads', false, 314572800),
  ('scorm-packages', 'scorm-packages', false, 314572800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
