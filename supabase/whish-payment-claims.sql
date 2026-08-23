-- Retroactive record of migration 20260814073723_create_whish_payment_claims,
-- which was applied directly to the live database (via Supabase MCP) but
-- never checked into this repo as a tracked .sql file — a gap this file
-- closes so the live schema and the repo agree, matching every other table
-- in this directory.
--
-- Backs the manual "pay Pro via Whish" flow: a user claims they paid via
-- Whish (app/api/billing/whish/claim/route.ts, using the service-role
-- admin client — RLS below is defense-in-depth, not the only gate), and an
-- admin reviews + approves/rejects at /admin/whish
-- (app/api/admin/whish/confirm/route.ts, also service-role). See
-- lib/billing/whish-links.ts for why this manual flow exists instead of an
-- automated webhook.
--
-- Already live — this file is documentation-only unless run against a
-- fresh database that doesn't have it yet, in which case it's safe to run
-- as-is (idempotent create/guards below).

create table if not exists public.whish_payment_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.whish_payment_claims enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whish_payment_claims'
      and policyname = 'Users can view own whish claim'
  ) then
    create policy "Users can view own whish claim"
      on public.whish_payment_claims for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whish_payment_claims'
      and policyname = 'Users can insert own whish claim'
  ) then
    create policy "Users can insert own whish claim"
      on public.whish_payment_claims for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
