-- "Application Assist" — the safe, human-in-the-loop layer of real
-- auto-apply automation. See lib/screeningAnswers.ts for the full design
-- rationale (this app deliberately never submits an application itself; it
-- prepares ready-to-paste answers for a human to review and send).
--
-- Run this once in the Supabase SQL editor, or via the Supabase MCP
-- apply_migration tool. Safe to run more than once.

-- 1. A dedicated place to save the screening-question facts a resume alone
--    doesn't carry (work authorization, notice period, salary expectations,
--    relocation, etc) — one row per user, filled in once, reused across
--    every queued match. Kept as its own table rather than more columns on
--    profiles: these are Auto-Apply-specific inputs, not public profile
--    info, and RLS below scopes them to the owner only (never readable by
--    anyone else, unlike most of `profiles`).
create table if not exists public.applicant_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  work_authorization text check (work_authorization in ('citizen', 'resident_no_sponsorship', 'requires_sponsorship', 'gcc_national')),
  notice_period text check (notice_period in ('immediate', '2_weeks', '1_month', '2_months', '3_months_plus')),
  expected_salary text,
  willing_to_relocate boolean,
  willing_to_travel boolean,
  linkedin_url text,
  portfolio_url text,
  total_years_experience numeric,
  earliest_start_date date,
  additional_notes text check (char_length(additional_notes) <= 1000),
  updated_at timestamptz not null default now()
);

alter table public.applicant_profile enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'applicant_profile'
      and policyname = 'Users manage their own applicant profile'
  ) then
    create policy "Users manage their own applicant profile"
      on public.applicant_profile for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- 2. Which ATS actually hosts a job's apply page (see lib/atsPlatform.ts) —
--    stored on the crawled-jobs cache so it's computed once at crawl time,
--    not re-derived on every read.
alter table public.retrieved_jobs add column if not exists ats_platform text;

-- 3. Auto Apply queue: the ATS tag for the matched job, plus (for
--    Greenhouse postings) the real fetched application questions and,
--    always, the drafted ready-to-paste answers — computed once when the
--    match is queued (lib/autoApplyRun.ts), read by the Application Assist
--    panel on app/[locale]/dashboard/auto-apply/page.tsx.
alter table public.auto_apply_queue add column if not exists ats_platform text;
alter table public.auto_apply_queue add column if not exists application_questions jsonb;
alter table public.auto_apply_queue add column if not exists suggested_answers jsonb;
