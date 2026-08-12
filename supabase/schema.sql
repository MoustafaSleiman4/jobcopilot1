-- JobCopilot database schema for Supabase (Postgres)
-- Run this in the Supabase SQL editor after creating your project.
-- Auth users live in the built-in auth.users table; everything below
-- references that via user_id uuid.

create extension if not exists "uuid-ossp";

-- Public profile, one row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  locale text default 'en' check (locale in ('en', 'ar')),
  phone text,
  target_roles text[],
  country text,
  plan text default 'free' check (plan in ('free', 'pro')),
  -- Personal photo, set from the "Personal photo" section on
  -- /dashboard/resume — account-level and shared across every resume
  -- version (see components/ResumePreview.tsx and lib/resume-pdf.ts, both
  -- of which take it as a separate argument rather than reading it off any
  -- one resume's saved content). A plain public URL into the
  -- "resume-photos" Storage bucket (see storage-setup.sql), not a storage
  -- path, so it can be used directly wherever it's rendered.
  avatar_url text,
  created_at timestamptz default now()
);

-- Resumes: uploaded, built from scratch, or AI-enhanced versions
create table if not exists public.resumes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My Resume',
  content jsonb not null default '{}'::jsonb,
  file_url text,
  is_primary boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Job listings pulled from ATS/job-board sources
create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  source text not null,               -- e.g. 'greenhouse', 'lever', 'manual'
  external_id text not null,          -- id from the source system
  title text not null,
  company text not null,
  location text,
  description text,
  apply_url text not null,
  apply_type text not null default 'external' check (apply_type in ('one_click', 'external')),
  created_at timestamptz default now(),
  unique (source, external_id)
);

-- Applications: the tracker board.
-- `job_id` intentionally stays optional and unenforced in practice: live
-- search results come from external ATS APIs (Greenhouse/Lever/Ashby) and an
-- in-memory fallback list, not from rows in public.jobs, so applications
-- carry their own snapshot of the listing (company/title/location/apply_url)
-- rather than depending on a jobs-table row existing.
create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  resume_id uuid references public.resumes (id) on delete set null,
  source_job_id text,          -- id of the listing from /api/jobs/search, e.g. "demo-3" or "greenhouse-careem-123"
  company text not null default '',
  title text not null default '',
  location text,
  apply_url text,
  status text not null default 'saved' check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  notes text,
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_job_id)
);

-- Subscriptions: mirrors the active billing provider's state.
-- `unique (user_id)` is required — the billing webhook upserts into this
-- table with `onConflict: "user_id"`, and Postgres rejects an ON CONFLICT
-- upsert with no matching unique constraint. Without it, that upsert throws
-- on every payment.
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,             -- 'lemonsqueezy' | 'stripe'
  provider_subscription_id text,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  renews_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id)
);

-- Chat history for the AI job-search assistant
create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Row Level Security: every user can only see/modify their own rows.
-- `jobs` is public read (it's shared listing data, not user data).
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.jobs enable row level security;

create policy "Users manage their own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage their own resumes" on public.resumes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own chat messages" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Anyone can read jobs" on public.jobs
  for select using (true);

-- Keep applications.updated_at current on every edit (status change, note
-- edit, etc.) — the applications board sorts/labels by this.
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
