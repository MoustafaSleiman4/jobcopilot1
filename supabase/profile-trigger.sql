-- Auto-create a public.profiles row whenever someone signs up via Supabase Auth.
-- Without this, profiles stays empty and there is nothing for the app to read
-- a user's plan ("free" vs "pro") from. Run this once in the SQL Editor,
-- after schema.sql.

-- Kept in sync with the live definition (see
-- supabase/profiles_readable_and_email_column and
-- supabase/backfill_profile_full_name migrations, applied via Supabase
-- MCP): also captures `email` at signup, and self-heals `email`/`full_name`
-- on a pre-existing profile row if either was left null (e.g. a profile
-- row that predates one of these columns).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, locale, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'locale', 'en'),
    new.email
  )
  on conflict (id) do update set
    email = excluded.email where public.profiles.email is null;
  update public.profiles
  set full_name = excluded_full_name
  from (select new.raw_user_meta_data->>'full_name' as excluded_full_name) as x
  where public.profiles.id = new.id
    and public.profiles.full_name is null
    and coalesce(x.excluded_full_name, '') <> '';
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create a profile row for any existing user who signed up before
-- this trigger existed (safe to run even if there are none yet).
insert into public.profiles (id, full_name, locale)
select u.id, u.raw_user_meta_data->>'full_name', coalesce(u.raw_user_meta_data->>'locale', 'en')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- One user = one current subscription row, so the billing webhook can upsert
-- on user_id instead of accumulating duplicate rows every renewal.
-- Guarded with a existence check (rather than a plain `add constraint`)
-- because supabase/subscriptions-upgrade.sql may already have added this
-- exact constraint — running this file unconditionally after that one had
-- already run would otherwise error out on this line and, depending on how
-- the statements are batched, could roll back the profiles backfill above
-- along with it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_user_id_key'
  ) then
    alter table public.subscriptions add constraint subscriptions_user_id_key unique (user_id);
  end if;
end $$;
