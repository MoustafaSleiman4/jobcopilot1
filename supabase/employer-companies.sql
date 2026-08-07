-- Employer / company job-posting portal: companies sign up (with their own
-- Supabase Auth account, same auth.users table as job seekers — just a
-- different "type" of account, distinguished by owning a row here rather
-- than by any flag on public.profiles) and post jobs for free.
--
-- One employer account = one company (unique owner_id) — keeps the whole
-- feature simple (no company-switcher UI, no membership/invite system) and
-- matches what was actually asked for. A company can be extended to support
-- multiple team members later without a breaking schema change (that would
-- just add a separate company_members table on top of this).
--
-- Run this once in the Supabase SQL editor after schema.sql.

create table if not exists public.companies (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  website text,
  industry text,
  company_size text check (
    company_size is null or company_size in ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')
  ),
  logo_url text,
  description text,
  hq_location text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.company_jobs (
  id uuid primary key default extensions.uuid_generate_v4(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text not null,
  responsibilities text,
  requirements text,
  location text not null,
  work_type text not null check (work_type in ('remote', 'hybrid', 'onsite')),
  employment_type text not null default 'full_time' check (
    employment_type in ('full_time', 'part_time', 'contract', 'internship')
  ),
  industry text,
  salary_min integer,
  salary_max integer,
  salary_currency text default 'USD',
  -- Exactly one of apply_url / apply_email is required, enforced below —
  -- an employer needs some way for candidates to actually apply.
  apply_method text not null check (apply_method in ('url', 'email')),
  apply_url text,
  apply_email text,
  status text not null default 'active' check (status in ('active', 'closed', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_jobs_apply_method_matches_field check (
    (apply_method = 'url' and apply_url is not null and apply_url <> '')
    or (apply_method = 'email' and apply_email is not null and apply_email <> '')
  )
);

alter table public.companies enable row level security;
alter table public.company_jobs enable row level security;

-- Companies: public read (so job seekers can see who's hiring, and the
-- company shows up correctly next to its own postings in search results),
-- but only the owner can create/edit/delete their own company row.
create policy "Anyone can read companies" on public.companies
  for select using (true);

create policy "Owners manage their own company" on public.companies
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Company jobs: public read ONLY for active postings (drafts/closed stay
-- private to the employer), owner can see/manage every status of their own
-- postings via the company_id -> companies.owner_id relationship.
create policy "Anyone can read active company jobs" on public.company_jobs
  for select using (status = 'active');

create policy "Owners manage their own company jobs" on public.company_jobs
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = company_jobs.company_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies c
      where c.id = company_jobs.company_id and c.owner_id = auth.uid()
    )
  );

-- Shared updated_at trigger — same pattern as
-- public.set_applications_updated_at() in schema.sql, generalized so both
-- new tables here can reuse one function instead of two near-identical ones.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists company_jobs_set_updated_at on public.company_jobs;
create trigger company_jobs_set_updated_at
before update on public.company_jobs
for each row execute function public.set_updated_at();

create index if not exists companies_owner_id_idx on public.companies (owner_id);
create index if not exists company_jobs_company_id_idx on public.company_jobs (company_id);
create index if not exists company_jobs_status_idx on public.company_jobs (status);
create index if not exists company_jobs_industry_idx on public.company_jobs (industry);
create index if not exists company_jobs_work_type_idx on public.company_jobs (work_type);
create index if not exists company_jobs_location_idx on public.company_jobs (location);
