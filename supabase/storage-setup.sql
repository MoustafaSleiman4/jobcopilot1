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

-- Storage bucket + policies for personal photos, used by the "Personal
-- photo" section on /dashboard/resume (see app/[locale]/dashboard/resume/
-- page.tsx). This is an ACCOUNT-level photo — saved to
-- public.profiles.avatar_url, not to any one resume's content — so it's
-- set once and shown across every resume version. Unlike "resumes" above,
-- this bucket is PUBLIC READ by design: a photo only needs to render as a
-- plain <img src> in the on-screen preview and inside the exported PDF, and
-- it never contains anything more sensitive than what the user already put
-- on their CV. Write access stays owner-scoped, same pattern as "resumes".
-- This has already been applied directly to the live project via a
-- migration — kept here so the SQL source matches production and so a
-- fresh project can be set up from this file alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resume-photos', 'resume-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users can upload their own resume photo"
on storage.objects for insert
with check (bucket_id = 'resume-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own resume photo"
on storage.objects for update
using (bucket_id = 'resume-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own resume photo"
on storage.objects for delete
using (bucket_id = 'resume-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Resume photos are publicly readable"
on storage.objects for select
using (bucket_id = 'resume-photos');

-- The photo above is saved to public.profiles.avatar_url — see that
-- column's definition in schema.sql.
