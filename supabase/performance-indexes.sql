-- Performance pass: search indexing + a batched replacement for the
-- messages inbox's per-connection N+1 query pattern. Already applied live
-- via Supabase MCP (performance_indexes migration) — checked in here per
-- this project's convention of tracking every applied migration as a file.
-- Safe to re-run (all `if not exists` / `or replace`).
--
-- Note on scale: at the time this was written the whole `profiles` table
-- was 20 rows — small enough that no index changes query latency in any
-- measurable way today. These are here so search/suggestions/connections
-- stay fast as the user base grows, not because they fix a slowdown that
-- exists right now at this row count. The messages_thread_summary()
-- function below is the change that actually reduces round-trips today,
-- independent of table size — see app/api/messages/route.ts.

-- pg_trgm-backed indexes so `ilike '%q%'` (both-sides wildcard — a plain
-- btree index can't accelerate this at all) on people search actually uses
-- an index instead of a full table scan once there are many more profiles.
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);

-- "People you may know" (GET /api/people/suggestions) filters/orders on
-- these; the country match and target_roles overlap were previously
-- unindexed entirely.
create index if not exists profiles_country_idx on public.profiles (country) where hidden_from_discovery = false;
create index if not exists profiles_target_roles_gin_idx on public.profiles using gin (target_roles);
create index if not exists profiles_discovery_created_idx on public.profiles (created_at desc) where hidden_from_discovery = false;

-- Connections lookups always filter on (the other party's id) AND status
-- together (accepted-only lists, pending-only lists) — composite indexes
-- match that shape more precisely than the existing single-column ones.
create index if not exists connections_addressee_status_idx on public.connections (addressee_id, status);
create index if not exists connections_requester_status_idx on public.connections (requester_id, status);

-- Replaces GET /api/messages's old pattern of 2 queries PER conversation
-- (last message + unread count), run via Promise.all — correct, but N
-- conversations means 2*N round-trips to Supabase on every inbox load,
-- and round-trip count (not row-scan cost) is what actually drives
-- perceived latency at this app's current scale. One call to this function
-- replaces all of that with exactly 2 round-trips total (this call plus
-- the initial connections fetch), regardless of how many conversations
-- exist.
--
-- `security invoker` (the default — no elevated privilege) is deliberate:
-- this function does nothing a normal query by the caller couldn't already
-- do, so it should be bound by the caller's own RLS, not bypass it. A
-- connection_id the caller passes in that isn't actually theirs (shouldn't
-- happen — the route only ever passes back its own GET /api/messages
-- results — but defense in depth) simply returns nulls/zero for that row,
-- exactly as if you'd queried it directly and gotten nothing back.
create or replace function public.messages_thread_summary(connection_ids uuid[], viewer_id uuid)
returns table(
  connection_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id as connection_id,
    lm.body as last_body,
    lm.created_at as last_created_at,
    lm.sender_id as last_sender_id,
    coalesce(uc.unread_count, 0) as unread_count
  from unnest(connection_ids) as c(id)
  left join lateral (
    select m.body, m.created_at, m.sender_id
    from public.messages m
    where m.connection_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as unread_count
    from public.messages m2
    where m2.connection_id = c.id
      and m2.sender_id <> viewer_id
      and m2.read_at is null
  ) uc on true;
$$;

revoke all on function public.messages_thread_summary(uuid[], uuid) from public;
grant execute on function public.messages_thread_summary(uuid[], uuid) to authenticated;
