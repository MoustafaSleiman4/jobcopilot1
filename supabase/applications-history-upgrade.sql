-- Upgrade migration: status history tracking for the Applications tracker.
-- Run this once in the Supabase SQL editor (after applications-upgrade.sql).
-- Safe to run more than once.
--
-- Adds a `status_history` jsonb column (array of {status, at} entries) that's
-- maintained automatically by a trigger on every insert/status change — so
-- every code path that touches `applications.status` (the kanban drag/drop,
-- the manual edit form, and the Smart Apply "mark as applied" flow) gets a
-- timeline for free, with nothing to remember to call from the app code.

alter table public.applications
  add column if not exists status_history jsonb not null default '[]'::jsonb;

-- Backfill: give existing rows a single history entry reflecting their
-- current status, dated from applied_at (if set) or updated_at, so the UI
-- never shows an application with a truly empty timeline.
update public.applications
set status_history = jsonb_build_array(
  jsonb_build_object('status', status, 'at', coalesce(applied_at, updated_at))
)
where status_history = '[]'::jsonb;

create or replace function public.log_application_status_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    new.status_history = jsonb_build_array(jsonb_build_object('status', new.status, 'at', now()));
  elsif (new.status is distinct from old.status) then
    new.status_history = coalesce(old.status_history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('status', new.status, 'at', now()));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists applications_log_status_change on public.applications;
create trigger applications_log_status_change
before insert or update on public.applications
for each row execute function public.log_application_status_change();
