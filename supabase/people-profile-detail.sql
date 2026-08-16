-- Backs the "click a person to see their profile" feature (LinkedIn-style
-- detail view opened from Find People / Sent Requests / Received Requests /
-- comment authors): a connection-count headline stat and a mutual-
-- connections list, both computed cross-user, which is why each needs its
-- own narrowly-scoped security-definer function rather than a plain client
-- query — `connections` RLS (see the original social-network migration)
-- only lets a caller read rows where they themselves are the requester or
-- addressee, so a normal query can't answer "how many connections does
-- person X have" or "which of my connections does X also have" for an
-- arbitrary X. Already applied live via Supabase MCP
-- (people_profile_detail migration) — checked in here per this project's
-- convention of tracking every applied migration as a file. Safe to re-run.

-- Low-sensitivity headline stat, the same thing LinkedIn shows publicly on
-- every profile ("500+ connections") — takes an explicit target_id (unlike
-- the niladic network_member_ids()) because the whole point is answering
-- this for someone OTHER than the caller. Safe to expose broadly: it only
-- ever returns a count, never the identities behind it.
create or replace function public.connection_count(target_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.connections
  where status = 'accepted'
    and (requester_id = target_id or addressee_id = target_id);
$$;

revoke all on function public.connection_count(uuid) from public;
grant execute on function public.connection_count(uuid) to authenticated;

-- Mutual connections between the caller and target_id — intersects the
-- caller's own accepted connections (identities the caller can already see
-- via GET /api/connections) with target_id's accepted connections. This is
-- safe despite being security definer: it never reveals a stranger's full
-- network, only "which of your own connections do you two have in common,"
-- exactly like LinkedIn's "N mutual connections."
create or replace function public.mutual_connections(target_id uuid)
returns table(member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as id
    from public.connections
    where status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid())
  ),
  theirs as (
    select case when requester_id = target_id then addressee_id else requester_id end as id
    from public.connections
    where status = 'accepted' and (requester_id = target_id or addressee_id = target_id)
  )
  select id from mine
  intersect
  select id from theirs;
$$;

revoke all on function public.mutual_connections(uuid) from public;
grant execute on function public.mutual_connections(uuid) to authenticated;
