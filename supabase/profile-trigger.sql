-- Auto-create a public.profiles row whenever someone signs up via Supabase Auth.
-- Without this, profiles stays empty and there is nothing for the app to read
-- a user's plan ("free" vs "pro") from. Run this once in the SQL Editor,
-- after schema.sql.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'locale', 'en')
  )
  on conflict (id) do nothing;
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
alter table public.subscriptions
  add constraint subscriptions_user_id_key unique (user_id);
