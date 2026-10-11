-- "My Network" upgrade: rich profile pages, multi-type post reactions +
-- reposts + hashtags + mentions + saved posts, a connections/discovery
-- engine (degree badges, mutual-weighted "people you may know", Follow as
-- distinct from Connect), and profile/engagement analytics (profile
-- viewers, search appearances, post performance). Applied live via Supabase
-- MCP (network_pro_upgrade migration) — checked in here per this project's
-- convention of tracking every applied migration as a file. Safe to re-run
-- (all `if not exists` / `or replace` / guarded `do $$ ... $$` blocks).
--
-- Every new feature here stays on the free plan — no new `plan = 'pro'`
-- gates anywhere in this file or in the API routes/components built on top
-- of it. That was an explicit product decision, not an oversight; don't add
-- a Pro check to any of this later without re-confirming that's wanted.

-- ============================================================================
-- 1. profiles: headline/about/open-to-work, matching LinkedIn's own profile
--    header fields, plus a privacy toggle for "who's viewed your profile"
--    (see §7) that follows the exact show_email/show_phone precedent.
-- ============================================================================

alter table public.profiles
  add column if not exists headline text,
  add column if not exists about text,
  add column if not exists open_to_work boolean not null default false,
  add column if not exists private_profile_views boolean not null default false;

-- ============================================================================
-- 2. Experience / education / skills / endorsements / featured — the
--    sections of a rich profile page. All four follow the same visibility
--    model as `profiles` itself ("Authenticated users can read any
--    profile"): readable by any signed-in user, writable only by the owner.
-- ============================================================================

create table if not exists public.profile_experience (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  company text not null,
  employment_type text check (employment_type is null or employment_type = any (array['full_time', 'part_time', 'contract', 'internship'])),
  location text,
  start_date date,
  -- null end_date = "present" (still in this role), same convention as
  -- applications.applied_at being null meaning "not applied yet" elsewhere.
  end_date date,
  description text,
  order_index smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_education (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  school text not null,
  degree text,
  field_of_study text,
  start_date date,
  end_date date,
  description text,
  order_index smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_skills (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 60),
  order_index smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Case-insensitive de-dupe ("React" and "react" are the same skill) — a
-- plain `unique (user_id, name)` column constraint can't express that, an
-- expression index can.
create unique index if not exists profile_skills_user_lower_name_idx on public.profile_skills (user_id, lower(name));

create table if not exists public.skill_endorsements (
  id uuid primary key default extensions.uuid_generate_v4(),
  skill_id uuid not null references public.profile_skills (id) on delete cascade,
  endorser_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (skill_id, endorser_id)
);

create table if not exists public.profile_featured (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text,
  description text,
  order_index smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profile_experience enable row level security;
alter table public.profile_education enable row level security;
alter table public.profile_skills enable row level security;
alter table public.skill_endorsements enable row level security;
alter table public.profile_featured enable row level security;

drop policy if exists "Anyone signed in can read experience" on public.profile_experience;
create policy "Anyone signed in can read experience" on public.profile_experience
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users manage their own experience" on public.profile_experience;
create policy "Users manage their own experience" on public.profile_experience
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Anyone signed in can read education" on public.profile_education;
create policy "Anyone signed in can read education" on public.profile_education
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users manage their own education" on public.profile_education;
create policy "Users manage their own education" on public.profile_education
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Anyone signed in can read skills" on public.profile_skills;
create policy "Anyone signed in can read skills" on public.profile_skills
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users manage their own skills" on public.profile_skills;
create policy "Users manage their own skills" on public.profile_skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Anyone signed in can read endorsements" on public.skill_endorsements;
create policy "Anyone signed in can read endorsements" on public.skill_endorsements
  for select using (auth.role() = 'authenticated');
-- Can't endorse your own skill — the subquery runs under the endorser's own
-- read access to profile_skills (that table's select policy is open to any
-- authenticated user, so this is never blocked by RLS, only by the actual
-- ownership check).
drop policy if exists "Users endorse others skills" on public.skill_endorsements;
create policy "Users endorse others skills" on public.skill_endorsements
  for insert
  with check (
    endorser_id = auth.uid()
    and not exists (
      select 1 from public.profile_skills ps where ps.id = skill_id and ps.user_id = auth.uid()
    )
  );
drop policy if exists "Users remove their own endorsements" on public.skill_endorsements;
create policy "Users remove their own endorsements" on public.skill_endorsements
  for delete using (endorser_id = auth.uid());

drop policy if exists "Anyone signed in can read featured items" on public.profile_featured;
create policy "Anyone signed in can read featured items" on public.profile_featured
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users manage their own featured items" on public.profile_featured;
create policy "Users manage their own featured items" on public.profile_featured
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists profile_experience_user_idx on public.profile_experience (user_id, order_index);
create index if not exists profile_education_user_idx on public.profile_education (user_id, order_index);
create index if not exists profile_skills_user_idx on public.profile_skills (user_id, order_index);
create index if not exists skill_endorsements_skill_idx on public.skill_endorsements (skill_id);
create index if not exists profile_featured_user_idx on public.profile_featured (user_id, order_index);

-- Keep profile_experience/profile_education's updated_at current, same
-- pattern as set_applications_updated_at() in schema.sql.
create or replace function public.set_profile_section_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profile_experience_set_updated_at on public.profile_experience;
create trigger profile_experience_set_updated_at
before update on public.profile_experience
for each row execute function public.set_profile_section_updated_at();

drop trigger if exists profile_education_set_updated_at on public.profile_education;
create trigger profile_education_set_updated_at
before update on public.profile_education
for each row execute function public.set_profile_section_updated_at();

-- ============================================================================
-- 3. post_reactions: multiple reaction types (the now-standard Like /
--    Celebrate / Support / Love / Insightful / Curious set), not just a
--    boolean like. The primary key stays (post_id, user_id) — one reaction
--    PER USER per post, same as before; reacting again with a different
--    type changes it rather than adding a second row.
-- ============================================================================

alter table public.post_reactions
  add column if not exists reaction_type text not null default 'like';

alter table public.post_reactions
  drop constraint if exists post_reactions_reaction_type_check;
alter table public.post_reactions
  add constraint post_reactions_reaction_type_check
  check (reaction_type = any (array['like', 'celebrate', 'support', 'love', 'insightful', 'curious']));

create index if not exists post_reactions_post_type_idx on public.post_reactions (post_id, reaction_type);

-- ============================================================================
-- 4. Reposts: a repost is itself a row in `posts` (reuses every existing
--    post-rendering/reaction/comment path unchanged) that points back at
--    the original via repost_of_id, with its own optional commentary in the
--    normal `body` column (empty string for a plain reshare with no added
--    thoughts, matching `body`'s existing not-null default-less convention
--    at the API layer rather than the DB layer).
-- ============================================================================

alter table public.posts
  add column if not exists repost_of_id uuid references public.posts (id) on delete set null;

create index if not exists posts_repost_of_idx on public.posts (repost_of_id) where repost_of_id is not null;

-- ============================================================================
-- 5. Hashtags + mentions. Hashtags are extracted server-side from a post's
--    body at creation time (plain lowercase tag text, no leading '#') purely
--    for discovery (trending / "posts tagged X"); rendering a clickable
--    #tag in a post body itself still goes through lib/socialFormat.tsx's
--    existing regex-only linkify approach, not this table.
--
--    Mentions use the same reasoning as hashtags for storage, but rendering
--    is different: a mention is written into the post body as literal
--    `@[Display Name](user-id)` markup by the composer, and
--    lib/socialFormat.tsx parses THAT markup (not a lookup against this
--    table) into a profile link — see the composer/linkify changes. This
--    table exists so "who was mentioned" can drive notification fan-out
--    without re-parsing body text every time.
-- ============================================================================

create table if not exists public.post_hashtags (
  id uuid primary key default extensions.uuid_generate_v4(),
  post_id uuid not null references public.posts (id) on delete cascade,
  tag text not null check (char_length(tag) <= 50),
  created_at timestamptz not null default now()
);

create table if not exists public.post_mentions (
  id uuid primary key default extensions.uuid_generate_v4(),
  post_id uuid not null references public.posts (id) on delete cascade,
  mentioned_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, mentioned_user_id)
);

alter table public.post_hashtags enable row level security;
alter table public.post_mentions enable row level security;

-- Same visibility shape as post_media: readable whenever the parent post is.
drop policy if exists "Anyone can read hashtags on visible posts" on public.post_hashtags;
create policy "Anyone can read hashtags on visible posts" on public.post_hashtags
  for select using (
    exists (select 1 from public.posts p where p.id = post_hashtags.post_id and p.deleted_at is null)
  );
drop policy if exists "Users attach hashtags to their own posts" on public.post_hashtags;
create policy "Users attach hashtags to their own posts" on public.post_hashtags
  for insert
  with check (exists (select 1 from public.posts p where p.id = post_hashtags.post_id and p.author_id = auth.uid()));

-- Narrower than hashtags on purpose: a mention row is only meaningful to the
-- person who wrote the post and the person who was mentioned, not to every
-- reader of the post (the rendered @mention link in the body is what every
-- reader actually sees).
drop policy if exists "Mentioned users and post authors read mentions" on public.post_mentions;
create policy "Mentioned users and post authors read mentions" on public.post_mentions
  for select using (
    mentioned_user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_mentions.post_id and p.author_id = auth.uid())
  );
drop policy if exists "Users mention others in their own posts" on public.post_mentions;
create policy "Users mention others in their own posts" on public.post_mentions
  for insert
  with check (exists (select 1 from public.posts p where p.id = post_mentions.post_id and p.author_id = auth.uid()));

create index if not exists post_hashtags_tag_idx on public.post_hashtags (tag);
create index if not exists post_hashtags_post_idx on public.post_hashtags (post_id);
create index if not exists post_mentions_user_idx on public.post_mentions (mentioned_user_id);

-- ============================================================================
-- 6. Saved posts ("Bookmark") and Follow (distinct from Connect — lets
--    someone see/get weighted toward a person's public posts without a
--    mutual, accepted connection; the feed is already visible to everyone
--    per posts-open-feed-gated-comments.sql, so Follow here is a personal
--    "interested in this person" signal rather than a visibility gate).
-- ============================================================================

create table if not exists public.saved_posts (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.saved_posts enable row level security;
alter table public.follows enable row level security;

drop policy if exists "Users manage their own saved posts" on public.saved_posts;
create policy "Users manage their own saved posts" on public.saved_posts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users see who they follow and who follows them" on public.follows;
create policy "Users see who they follow and who follows them" on public.follows
  for select using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists "Users follow others" on public.follows;
create policy "Users follow others" on public.follows
  for insert with check (follower_id = auth.uid());
drop policy if exists "Users unfollow" on public.follows;
create policy "Users unfollow" on public.follows
  for delete using (follower_id = auth.uid());

create index if not exists follows_followee_idx on public.follows (followee_id);

-- ============================================================================
-- 7. Analytics: who viewed your profile, search appearances, post
--    impressions. All three are plain RLS-scoped tables (no
--    security-definer function needed) — the insert side writes a row
--    naming the ACTING user (viewer_id / searcher_id / viewer_id) which is
--    always auth.uid(), and the read side is scoped to the SUBJECT of the
--    row (viewed_id / searched_user_id / post author), so the two policies
--    never need to trust each other.
-- ============================================================================

create table if not exists public.profile_views (
  id uuid primary key default extensions.uuid_generate_v4(),
  viewer_id uuid not null references auth.users (id) on delete cascade,
  viewed_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (viewer_id <> viewed_id)
);

create table if not exists public.search_appearances (
  id uuid primary key default extensions.uuid_generate_v4(),
  searched_user_id uuid not null references auth.users (id) on delete cascade,
  searcher_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.post_impressions (
  id uuid primary key default extensions.uuid_generate_v4(),
  post_id uuid not null references public.posts (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profile_views enable row level security;
alter table public.search_appearances enable row level security;
alter table public.post_impressions enable row level security;

drop policy if exists "Users log their own profile views" on public.profile_views;
create policy "Users log their own profile views" on public.profile_views
  for insert with check (viewer_id = auth.uid());
drop policy if exists "Users read who viewed their profile" on public.profile_views;
create policy "Users read who viewed their profile" on public.profile_views
  for select using (viewed_id = auth.uid());

drop policy if exists "Users log their own searches" on public.search_appearances;
create policy "Users log their own searches" on public.search_appearances
  for insert with check (searcher_id = auth.uid() or searcher_id is null);
drop policy if exists "Users read their own search appearances" on public.search_appearances;
create policy "Users read their own search appearances" on public.search_appearances
  for select using (searched_user_id = auth.uid());

drop policy if exists "Users log post impressions" on public.post_impressions;
create policy "Users log post impressions" on public.post_impressions
  for insert with check (viewer_id = auth.uid() or viewer_id is null);
-- Deliberately no select policy for `authenticated` here — reading
-- impression counts goes exclusively through post_impression_count() below,
-- which is author-gated, matching notifications' "no INSERT policy, the
-- trigger's elevated path is the only writer" style of locking a table down
-- to one narrow, intentional access path.

create index if not exists profile_views_viewed_idx on public.profile_views (viewed_id, created_at desc);
create index if not exists search_appearances_searched_idx on public.search_appearances (searched_user_id, created_at desc);
create index if not exists post_impressions_post_idx on public.post_impressions (post_id);

-- Impression counts are private to the post's author (unlike reaction/
-- comment counts, which are public) — same reasoning as LinkedIn keeping
-- "impressions" as an author-only analytics number, not a public stat.
create or replace function public.post_impression_count(target_post_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.post_impressions pi
  join public.posts p on p.id = pi.post_id
  where pi.post_id = target_post_id
    and p.author_id = auth.uid();
$$;

revoke all on function public.post_impression_count(uuid) from public;
grant execute on function public.post_impression_count(uuid) to authenticated;

-- ============================================================================
-- 8. Discovery engine: 1st/2nd/3rd-degree badges and a mutual-connection-
--    weighted "People you may know" — both security-definer, both niladic
--    on the caller's own side (always keyed off auth.uid() internally),
--    following network_member_ids()'s existing safety reasoning exactly.
-- ============================================================================

-- Single-target version — used by the profile detail page (one person).
create or replace function public.connection_degree(target_id uuid)
returns smallint
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
  select (case
    when target_id = auth.uid() then 0
    when target_id in (select id from direct) then 1
    when target_id in (select id from second) then 2
    else 3
  end)::smallint;
$$;

revoke all on function public.connection_degree(uuid) from public;
grant execute on function public.connection_degree(uuid) to authenticated;

-- Batch version — used by list views (search results, suggestions, a feed
-- page of post authors) so showing N degree badges costs one round trip
-- instead of N, same motivation as messages_thread_summary() in
-- performance-indexes.sql.
create or replace function public.connection_degrees(target_ids uuid[])
returns table(target_id uuid, degree smallint)
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
  select t.id as target_id,
    (case
      when t.id = auth.uid() then 0
      when t.id in (select id from direct) then 1
      when t.id in (select id from second) then 2
      else 3
    end)::smallint as degree
  from unnest(target_ids) as t(id);
$$;

revoke all on function public.connection_degrees(uuid[]) from public;
grant execute on function public.connection_degrees(uuid[]) to authenticated;

-- Mutual-connection-weighted candidate ranking: "connections of my
-- connections," most-shared-connections first, excluding anyone already
-- connected/pending/declined with. Returns candidates only from the
-- caller's 2nd-degree network — GET /api/people/suggestions blends this
-- with its existing country/target_roles scoring and backfills from the
-- general pool when this returns too few rows (e.g. a caller with few or no
-- connections yet).
create or replace function public.people_you_may_know(limit_count int default 10)
returns table(member_id uuid, mutual_count int)
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
  excluded as (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as id
    from public.connections
    where requester_id = auth.uid() or addressee_id = auth.uid()
  ),
  second_degree as (
    select (case when c.requester_id = d.id then c.addressee_id else c.requester_id end) as id,
           count(*) as mutual_count
    from public.connections c
    join direct d on (c.requester_id = d.id or c.addressee_id = d.id)
    where c.status = 'accepted'
    group by 1
  )
  select sd.id as member_id, sd.mutual_count::int
  from second_degree sd
  where sd.id <> auth.uid()
    and sd.id not in (select id from excluded)
  order by sd.mutual_count desc
  limit greatest(limit_count, 0);
$$;

revoke all on function public.people_you_may_know(int) from public;
grant execute on function public.people_you_may_know(int) to authenticated;

-- ============================================================================
-- 9. Notifications: three new types (skill_endorsement, post_mention,
--    post_repost), plus the one new column skill_endorsement notifications
--    need (there's no existing FK column on `notifications` that fits).
-- ============================================================================

alter table public.notifications
  add column if not exists skill_id uuid references public.profile_skills (id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'connection_request',
    'connection_accepted',
    'post_reaction',
    'post_comment',
    'comment_reply',
    'message',
    'admin_broadcast',
    'skill_endorsement',
    'post_mention',
    'post_repost'
  ]));

-- Extends the existing single polymorphic trigger function rather than
-- adding separate ones per table — matches this project's established
-- pattern (see the original fan_out_notification() in
-- posts-network-visibility.sql's era and notifications-admin-broadcast.sql).
create or replace function public.fan_out_notification()
returns trigger as $$
begin
  if tg_table_name = 'post_reactions' then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    select p.author_id, new.user_id, 'post_reaction', new.post_id
    from public.posts p where p.id = new.post_id and p.author_id <> new.user_id;

  elsif tg_table_name = 'post_comments' then
    if new.parent_comment_id is not null then
      insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
      select c.author_id, new.author_id, 'comment_reply', new.post_id, new.id
      from public.post_comments c where c.id = new.parent_comment_id and c.author_id <> new.author_id;
    else
      insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
      select p.author_id, new.author_id, 'post_comment', new.post_id, new.id
      from public.posts p where p.id = new.post_id and p.author_id <> new.author_id;
    end if;

  elsif tg_table_name = 'connections' then
    if tg_op = 'INSERT' then
      insert into public.notifications (recipient_id, actor_id, type, connection_id)
      values (new.addressee_id, new.requester_id, 'connection_request', new.id);
    elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
      insert into public.notifications (recipient_id, actor_id, type, connection_id)
      values (new.requester_id, new.addressee_id, 'connection_accepted', new.id);
    end if;

  elsif tg_table_name = 'messages' then
    insert into public.notifications (recipient_id, actor_id, type, connection_id, message_id)
    select case when c.requester_id = new.sender_id then c.addressee_id else c.requester_id end,
           new.sender_id, 'message', new.connection_id, new.id
    from public.connections c where c.id = new.connection_id;

  elsif tg_table_name = 'skill_endorsements' then
    insert into public.notifications (recipient_id, actor_id, type, skill_id)
    select ps.user_id, new.endorser_id, 'skill_endorsement', new.skill_id
    from public.profile_skills ps where ps.id = new.skill_id and ps.user_id <> new.endorser_id;

  elsif tg_table_name = 'post_mentions' then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    select new.mentioned_user_id, p.author_id, 'post_mention', new.post_id
    from public.posts p where p.id = new.post_id and p.author_id <> new.mentioned_user_id;

  elsif tg_table_name = 'posts' then
    -- Only a repost needs a notification — a brand new, non-repost post has
    -- no "original author" to tell. Every regular post insert still runs
    -- this branch and no-ops; negligible per-post overhead for not needing
    -- a second trigger/function just for this one case.
    if new.repost_of_id is not null then
      insert into public.notifications (recipient_id, actor_id, type, post_id)
      select op.author_id, new.author_id, 'post_repost', new.repost_of_id
      from public.posts op where op.id = new.repost_of_id and op.author_id <> new.author_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists skill_endorsements_notify on public.skill_endorsements;
create trigger skill_endorsements_notify after insert on public.skill_endorsements
for each row execute function public.fan_out_notification();

drop trigger if exists post_mentions_notify on public.post_mentions;
create trigger post_mentions_notify after insert on public.post_mentions
for each row execute function public.fan_out_notification();

drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert on public.posts
for each row execute function public.fan_out_notification();
