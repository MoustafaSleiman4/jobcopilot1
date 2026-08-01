-- Optional migration: adds per-user daily search-quota tracking for the
-- Pro-only Job Search page. Without this, app/api/jobs/search/route.ts
-- fails open (no rate limiting at all, same as before this migration
-- existed) — run this once you want the 10-searches/day-per-Pro-user cap
-- to actually take effect. Exists specifically to protect SerpApi's free
-- tier (250 searches/month across ALL users) from being exhausted by one
-- heavy user or a runaway client-side loop; 10/day x 30 days is a
-- reasonable per-user ceiling under that shared pool, not an exact
-- guarantee of never exceeding it if every Pro user maxes it out every day.
create table if not exists public.job_search_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  search_date date not null default current_date,
  search_count integer not null default 0,
  primary key (user_id, search_date)
);

alter table public.job_search_usage enable row level security;

-- Owner-read policy, consistent with every other table in this schema —
-- not required today (the API route reads/writes this via the service-role
-- key, which bypasses RLS), but harmless and future-proofs a "your search
-- history" UI if that's ever wanted.
create policy "Users can view their own search usage"
  on public.job_search_usage for select
  using (auth.uid() = user_id);

-- Atomically increments today's row for a user and returns the new total.
-- Called with the service-role key from app/api/jobs/search/route.ts.
-- Needs to be atomic (a single UPSERT ... ON CONFLICT DO UPDATE, not a
-- read-then-write from the API route) so two near-simultaneous requests
-- from the same user can't both read "9" and both proceed as if under the
-- 10/day limit.
create or replace function public.increment_job_search_usage(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.job_search_usage (user_id, search_date, search_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, search_date)
  do update set search_count = job_search_usage.search_count + 1
  returning search_count into new_count;

  return new_count;
end;
$$;
