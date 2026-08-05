-- Adds on-demand "Run now" support on top of auto-apply.sql. Run this once
-- in the Supabase SQL editor, after auto-apply.sql has already been run.
--
-- app/api/auto-apply/run-now/route.ts and the Auto Apply dashboard page both
-- fail outright without this column existing.

-- Stamped by lib/autoApplyRun.ts's runAutoApplyForUser() every time a run
-- happens for a user — whether triggered by the daily cron
-- (app/api/cron/auto-apply/route.ts) or by this user clicking "Run now"
-- (app/api/auto-apply/run-now/route.ts). Drives two things: the "next check
-- in Xh" countdown shown on the Auto Apply page, and the 24h cooldown that
-- rate-limits the on-demand "Run now" trigger (RUN_NOW_COOLDOWN_MS in
-- lib/autoApplyRun.ts) so it can't be used to hammer the free job sources
-- far more often than the daily cron ever would.
alter table public.auto_apply_preferences
  add column if not exists last_run_at timestamptz;
