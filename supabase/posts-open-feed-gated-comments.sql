-- Reverses posts-network-visibility.sql's feed restriction: the Posts feed
-- is new, so the goal now is maximum visibility to drive people to try it,
-- not privacy — every signed-in user can see every post, its media, and its
-- reaction/comment counts, and can like anything. What stays gated is the
-- act of COMMENTING: you can only comment on a post (or reply within it) if
-- you're the post's author or directly connected (status = 'accepted') to
-- them — "if you want to join the conversation, connect first." This is
-- deliberately a 1st-degree-only check (not network_member_ids(), which
-- also includes 2nd-degree) since the ask was specifically "ask them to
-- connect," not "let their whole extended network comment too."
-- network_member_ids() itself (from posts-network-visibility.sql) is left
-- in place — nothing else here depends on it, but no reason to drop a
-- working, still-safe function.
--
-- Already applied live via Supabase MCP (posts_open_feed_gated_comments
-- migration) and verified against real data: an unrelated (not connected)
-- user can now SELECT another user's post and its reactions, but an INSERT
-- into post_comments from that same unrelated user correctly fails with
-- 42501 (RLS violation); a 1st-degree connection of the post's author, and
-- the author themselves, can both comment successfully. Checked in here per
-- this project's convention of tracking every applied migration as a file.
-- Safe to re-run.

drop policy if exists "Users read posts from their network" on public.posts;
create policy "Anyone signed in can read posts" on public.posts
  for select using (deleted_at is null);

drop policy if exists "Users read media on visible posts" on public.post_media;
create policy "Anyone signed in can read post media" on public.post_media
  for select using (
    exists (select 1 from public.posts p where p.id = post_media.post_id and p.deleted_at is null)
  );

drop policy if exists "Users read reactions on visible posts" on public.post_reactions;
create policy "Anyone signed in can read reactions" on public.post_reactions
  for select using (
    exists (select 1 from public.posts p where p.id = post_reactions.post_id and p.deleted_at is null)
  );

drop policy if exists "Users read comments on visible posts" on public.post_comments;
create policy "Anyone signed in can read comments" on public.post_comments
  for select using (
    deleted_at is null
    and exists (select 1 from public.posts p where p.id = post_comments.post_id and p.deleted_at is null)
  );

-- The actual new gate: commenting (top-level or a reply) requires being the
-- post's author or a 1st-degree accepted connection of theirs.
drop policy if exists "Users create their own comments" on public.post_comments;
create policy "Users comment if connected to the post author" on public.post_comments
  for insert
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id
        and (
          p.author_id = auth.uid()
          or exists (
            select 1 from public.connections c
            where c.status = 'accepted'
              and (
                (c.requester_id = auth.uid() and c.addressee_id = p.author_id)
                or (c.requester_id = p.author_id and c.addressee_id = auth.uid())
              )
          )
        )
    )
  );
