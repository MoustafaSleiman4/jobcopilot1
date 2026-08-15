-- Restricts the Posts feed to a viewer's 1st- and 2nd-degree network
-- ("connections only and connections of connections"), enforced at the RLS
-- layer so it can't be bypassed by a direct PostgREST call, not just in the
-- app's own API routes. Already applied live via Supabase MCP
-- (posts_network_visibility migration) — this file exists so the change is
-- checked into the repo alongside schema.sql/storage-setup.sql, matching
-- this project's existing convention. Safe to re-run.

-- Niladic on purpose (no viewer_id parameter): it always keys off
-- auth.uid() internally. A parameterized version would let anyone call it
-- directly via RPC with someone else's id and, since it's
-- security-definer, get that person's network computed and returned —
-- a real info leak. With no parameter it only ever answers "who is
-- auth.uid() connected to," which is safe to expose to `authenticated`.
create or replace function public.network_member_ids()
returns table(member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with direct as (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as id
    from public.connections
    where status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid())
  ),
  second as (
    select case when c.requester_id = d.id then c.addressee_id else c.requester_id end as id
    from public.connections c
    join direct d on (c.requester_id = d.id or c.addressee_id = d.id)
    where c.status = 'accepted'
  )
  select auth.uid()
  union
  select id from direct
  union
  select id from second;
$$;

revoke all on function public.network_member_ids() from public;
grant execute on function public.network_member_ids() to authenticated;

-- posts: replace the fully-public read policy with a network-scoped one.
drop policy if exists "Anyone signed in can read posts" on public.posts;
create policy "Users read posts from their network" on public.posts
  for select using (
    deleted_at is null
    and author_id in (select member_id from public.network_member_ids())
  );

-- post_comments: previously fully public regardless of the parent post's
-- visibility — that would leak comment bodies on a now-hidden post even
-- though the post itself is no longer visible. Scope to the parent post.
drop policy if exists "Anyone signed in can read comments" on public.post_comments;
create policy "Users read comments on visible posts" on public.post_comments
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id
        and p.deleted_at is null
        and p.author_id in (select member_id from public.network_member_ids())
    )
  );

-- post_media: same reasoning — media on a now-hidden post shouldn't be
-- independently readable via a direct query against post_media.
drop policy if exists "Anyone signed in can read post media" on public.post_media;
create policy "Users read media on visible posts" on public.post_media
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.deleted_at is null
        and p.author_id in (select member_id from public.network_member_ids())
    )
  );

-- post_reactions: same reasoning for reaction rows/counts.
drop policy if exists "Anyone signed in can read reactions" on public.post_reactions;
create policy "Users read reactions on visible posts" on public.post_reactions
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_reactions.post_id
        and p.deleted_at is null
        and p.author_id in (select member_id from public.network_member_ids())
    )
  );
