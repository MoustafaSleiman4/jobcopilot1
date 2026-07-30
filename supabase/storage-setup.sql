-- Storage bucket + policies for uploaded resume files.
-- Run this in the Supabase SQL Editor after schema.sql (once, per project).

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- Files are stored at "<user_id>/<filename>" — these policies only allow a
-- user to read/write/delete objects inside their own folder.
create policy "Users can upload to their own resume folder"
on storage.objects for insert
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view their own resume files"
on storage.objects for select
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own resume files"
on storage.objects for update
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own resume files"
on storage.objects for delete
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
