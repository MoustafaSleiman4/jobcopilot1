-- Upgrade migration for the Applications tracker page.
-- Run this once in the Supabase SQL editor if you already ran the original
-- schema.sql before 2026-07-31 (i.e. your `applications` table exists but
-- doesn't yet have company/title/location/apply_url/source_job_id columns).
-- Safe to run more than once.

alter table public.applications
  add column if not exists source_job_id text,
  add column if not exists company text not null default '',
  add column if not exists title text not null default '',
  add column if not exists location text,
  add column if not exists apply_url text,
  add column if not exists updated_at timestamptz not null default now();

-- Prevents duplicate rows when the same live job listing is saved/applied to
-- more than once (NULLs are exempt from uniqueness, so manually-added
-- applications with no source_job_id are unaffected).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applications_user_id_source_job_id_key'
  ) then
    alter table public.applications
      add constraint applications_user_id_source_job_id_key unique (user_id, source_job_id);
  end if;
end $$;

create or replace function public.set_applications_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_applications_updated_at();

create index if not exists applications_user_id_idx on public.applications (user_id);
