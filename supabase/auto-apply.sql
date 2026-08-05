-- Auto Apply: scheduled job matching + one-click review queue.
-- Run this once in the Supabase SQL editor. Required (not optional like
-- job-search-rate-limit.sql) — app/api/cron/auto-apply/route.ts and
-- app/[locale]/dashboard/auto-apply/page.tsx both fail outright without
-- these tables existing.

-- Per-user Auto Apply configuration. One row per user, upserted from the
-- settings page. `daily_cap` is the number of new matches the cron will
-- queue per user per day (see app/api/cron/auto-apply/route.ts) — this is a
-- cap on how many ready-to-send matches get prepared and queued, not a
-- count of blind, no-click submissions: sending each one still takes a
-- single click on the review-queue page, because no job source used here
-- exposes a public "submit on the candidate's behalf" API (see the note in
-- app/api/jobs/search/route.ts) and browsers only allow opening a real
-- application tab in direct response to a genuine click.
create table if not exists public.auto_apply_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  daily_cap integer not null default 5 check (daily_cap between 1 and 20),
  keywords text not null default '',
  location text not null default '',
  work_type text check (work_type in ('remote', 'hybrid', 'onsite') or work_type is null),
  excluded_companies text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matched jobs waiting for the user's one-click approval (or already sent /
-- dismissed). `source_job_id` mirrors the id shape used in `applications`
-- (e.g. "lever-soum-123") so a queued-then-sent row can dedupe cleanly
-- against the applications tracker via the same id.
create table if not exists public.auto_apply_queue (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_job_id text not null,
  title text not null default '',
  company text not null default '',
  location text,
  apply_url text not null,
  source text not null default '',
  industry text,
  work_type text,
  match_score integer not null default 0,
  cover_letter text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, source_job_id)
);

alter table public.auto_apply_preferences enable row level security;
alter table public.auto_apply_queue enable row level security;

create policy "Users manage their own auto-apply preferences" on public.auto_apply_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own auto-apply queue" on public.auto_apply_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Used by the cron to enforce "N new matches per day" per user (counts
-- today's queued rows regardless of status, so a user who already reviewed
-- and sent/dismissed everything doesn't get re-topped-up mid-day).
create index if not exists auto_apply_queue_user_created_idx
  on public.auto_apply_queue (user_id, created_at);

create or replace function public.set_auto_apply_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists auto_apply_preferences_set_updated_at on public.auto_apply_preferences;
create trigger auto_apply_preferences_set_updated_at
before update on public.auto_apply_preferences
for each row execute function public.set_auto_apply_preferences_updated_at();
