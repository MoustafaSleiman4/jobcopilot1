-- Fixes a real bug: the billing webhook upserts into `subscriptions` using
-- `onConflict: "user_id"`, but the original schema.sql never gave that
-- column a unique constraint. Postgres requires a matching unique/exclusion
-- constraint for ON CONFLICT to work at all — without one, the upsert
-- throws on every single payment, which (before the webhook route was also
-- fixed to run each write independently) silently aborted before the far
-- more important `profiles.plan = 'pro'` update ever ran. Net effect: a
-- successful Lemon Squeezy payment, a 200 response back to Lemon Squeezy,
-- and a user who never actually got upgraded.
--
-- Run this once in the Supabase SQL editor. Safe to run more than once.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_user_id_key'
  ) then
    -- If more than one subscriptions row already exists per user (possible
    -- if earlier failed webhook attempts left partial data some other way),
    -- keep only the most recent one so the unique constraint can be added.
    delete from public.subscriptions a using public.subscriptions b
      where a.user_id = b.user_id and a.created_at < b.created_at;

    alter table public.subscriptions
      add constraint subscriptions_user_id_key unique (user_id);
  end if;
end $$;
