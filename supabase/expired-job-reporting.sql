-- Lets a real user flag a cached job (Jooble/Careerjet/SerpApi-sourced —
-- the only source stored in retrieved_jobs; Greenhouse/Lever/Ashby/RemoteOK
-- are always fetched live, so a closed posting there just stops appearing
-- on the next request with nothing to clean up) as no longer available, and
-- removes it from the cache once flagged — see
-- app/api/jobs/report-expired/route.ts. Aggregators like Jooble index
-- listings from many employer sites and don't reliably tell us when the
-- underlying posting closes, so this is a real click-through report from an
-- actual visitor rather than a guess based on HTTP status codes (a closed
-- posting frequently still returns 200 with a "no longer available" message
-- rendered client-side, exactly like the reported case, so a status-code
-- check wouldn't have caught it either).
--
-- Run this once in the Supabase SQL editor, or via the Supabase MCP
-- apply_migration tool. Safe to run more than once.

alter table public.retrieved_jobs add column if not exists expired_report_count integer not null default 0;
alter table public.retrieved_jobs add column if not exists expired_reported_at timestamptz;
