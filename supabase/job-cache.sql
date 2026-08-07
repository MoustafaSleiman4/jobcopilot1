-- Local, self-hosted cache of the paid job sources (Jooble / Careerjet /
-- SerpApi), so a live user search never calls those metered APIs directly.
-- Instead, one shared "global refresh" a day (see
-- app/api/jobs/refresh-cache/route.ts and lib/jobCache.ts) populates this
-- table, and every user's search just reads from it. Each row is
-- considered fresh for 30 days (expires_at); the refresh function also
-- deletes anything already past its expiry every time it runs, so this
-- table self-prunes without needing a separate cleanup job.
--
-- Safe to run more than once.

create table if not exists public.retrieved_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text,
  title text not null,
  company text not null,
  location text not null,
  apply_url text not null,
  apply_type text not null default 'external',
  industry text not null default 'Other',
  work_type text not null default 'onsite',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create unique index if not exists retrieved_jobs_apply_url_key on public.retrieved_jobs (apply_url);
create index if not exists retrieved_jobs_expires_at_idx on public.retrieved_jobs (expires_at);
create index if not exists retrieved_jobs_industry_idx on public.retrieved_jobs (industry);
create index if not exists retrieved_jobs_work_type_idx on public.retrieved_jobs (work_type);

-- Singleton row tracking when the shared cache was last actually refreshed
-- from the paid APIs, so refreshGlobalJobCacheIfStale() can tell "is this
-- stale enough to spend real API quota on" instead of refreshing every time
-- anyone logs in.
create table if not exists public.job_cache_meta (
  id boolean primary key default true,
  last_refreshed_at timestamptz,
  constraint job_cache_meta_singleton check (id)
);

insert into public.job_cache_meta (id, last_refreshed_at)
values (true, null)
on conflict (id) do nothing;

-- Service-role only table (read via the admin client, never the browser
-- client) — RLS on with no policies means the anon/authenticated roles get
-- zero access by default, same convention as the rest of this app's
-- server-only tables.
alter table public.retrieved_jobs enable row level security;
alter table public.job_cache_meta enable row level security;
