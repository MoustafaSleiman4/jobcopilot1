-- Backs "click a connection to see who THEY'RE connected to" — browsing a
-- person's actual connections list, not just the count or the mutual-only
-- subset (mutual_connections() from people-profile-detail.sql stays as-is
-- for that). This is a bigger disclosure than a count or a mutual-only
-- intersection, so it's gated the same way this app already gates other
-- social content this session (posts are "connections and connections of
-- connections only"): you can browse someone's connections list if you are
-- yourself connected to them, or it's your own profile. Anyone else (not
-- yet connected, or just browsing Find People) gets an empty list — not an
-- error, same ambiguous-but-safe shape as any RLS-gated read in this app.
-- Already applied live via Supabase MCP (person_connections_list
-- migration) — checked in here per this project's convention of tracking
-- every applied migration as a file. Safe to re-run.
create or replace function public.person_connections(target_id uuid)
returns table(member_id uuid, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when c.requester_id = target_id then c.addressee_id else c.requester_id end as member_id,
    c.created_at as connected_at
  from public.connections c
  where c.status = 'accepted'
    and (c.requester_id = target_id or c.addressee_id = target_id)
    and (
      target_id = auth.uid()
      or exists (
        select 1 from public.connections v
        where v.status = 'accepted'
          and (
            (v.requester_id = auth.uid() and v.addressee_id = target_id)
            or (v.requester_id = target_id and v.addressee_id = auth.uid())
          )
      )
    )
  order by c.created_at desc;
$$;

revoke all on function public.person_connections(uuid) from public;
grant execute on function public.person_connections(uuid) to authenticated;
