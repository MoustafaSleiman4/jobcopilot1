// Shared shapes for the social-network feature (Connections / Posts /
// Notifications) — mirrors the API contracts documented for the
// concurrently-built app/api/** routes exactly, so every component/page in
// this feature imports one source of truth instead of redeclaring these
// shapes ad hoc per file and drifting.

export type ConnectionStatus = "none" | "pending_sent" | "pending_received" | "connected";

export type Person = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  currentCompany: string | null;
  // Filled from profiles.country — either typed into "About you" directly,
  // or auto-filled from the account's CV location line (see
  // supabase/backfill-profile-country.sql and the equivalent client-side
  // prefill in app/[locale]/dashboard/resume/page.tsx). Unlike
  // email/phone, this is not privacy-gated — it was always shown in
  // "people you may know" matching and is intentionally low-sensitivity
  // (a country, not an address).
  country: string | null;
  // Both null unless the profile owner has opted in (profiles.show_email /
  // show_phone) or the viewer IS that profile's owner — the API routes
  // decide this server-side per row, never the client. See
  // app/api/people/search, app/api/people/suggestions, app/api/connections.
  email: string | null;
  phone: string | null;
  // Presence — only populated where it's actually shown (connections list,
  // message threads); omitted (not just null) elsewhere, e.g. post authors.
  isOnline?: boolean;
  lastSeenAt?: string | null;
  // The VIEWER's relationship to this person — only populated where a call
  // site actually needs it. Added for PostItem.author (see GET /api/posts):
  // the feed is visible to everyone now (posts-open-feed-gated-comments.sql)
  // but commenting still requires a direct connection to the author, so
  // PostCard/CommentThread use this to show a "connect to comment" prompt
  // proactively instead of only reactively after a failed POST.
  connectionStatus?: ConnectionStatus;
  // 0 = you, 1 = direct connection, 2 = a connection of a connection, 3 =
  // everyone else — from connection_degree()/connection_degrees() in
  // supabase/network-pro-upgrade.sql. Only populated where a call site
  // actually fetches it (search/suggestions results, post authors, the
  // profile detail view) — omitted, not just undefined-but-typed,
  // everywhere else, same convention as isOnline/connectionStatus above.
  connectionDegree?: ConnectionDegree;
  // Whether the viewer follows this person — Follow is deliberately
  // separate from Connect (see public.follows): you can follow someone
  // without a mutual, accepted connection. Only populated on the profile
  // detail view, where the Follow button actually lives.
  isFollowedByViewer?: boolean;
  // LinkedIn's "Open to work" banner — a profile-owner-controlled flag
  // (profiles.open_to_work), shown wherever a Person is rendered with
  // enough room for it (profile header, PersonDetailModal), not on compact
  // rows like PersonCard.
  openToWork?: boolean;
  headline?: string | null;
  // Only populated on GET /api/people/suggestions results — the count
  // behind people_you_may_know()'s ranking, shown as "N mutual connections"
  // on the suggestion card so the ranking isn't a black box.
  mutualConnectionsCount?: number;
};

/** 0 = you, 1 = 1st-degree, 2 = 2nd-degree, 3 = everyone else (3rd+). */
export type ConnectionDegree = 0 | 1 | 2 | 3;

/** Item shape returned by GET /api/people/search and GET /api/people/suggestions. */
export type PersonResult = Person & { connectionStatus: ConnectionStatus };

/** Minimal shape used for avatar-stack previews (mutual connections, etc.). */
export type PersonPreview = { id: string; fullName: string; avatarUrl: string | null };

/**
 * Item shape returned by GET /api/people/[id]/connections — a row in
 * someone else's connections list, browsed from PersonDetailModal. No
 * connectionStatus here (unlike PersonResult): the modal re-fetches
 * GET /api/people/[id] itself when you drill into one of these rows, which
 * is the source of truth for that.
 */
export type PersonConnectionRow = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  currentCompany: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Item shape returned by GET /api/people/[id] — the "click a person to see
 * their profile" detail view (PersonDetailModal). Superset of PersonResult:
 * adds the connectionId needed to accept/decline/cancel/remove from within
 * the modal itself, plus the two LinkedIn-style headline stats.
 */
export type PersonDetail = Person & {
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
  connectionsCount: number;
  mutualConnectionsCount: number;
  // Capped preview list (see MUTUAL_PREVIEW_LIMIT in the route) — use
  // mutualConnectionsCount for the true total, this array for "show them."
  mutualConnections: PersonPreview[];
};

/** One row of GET /api/profile/[id]'s "experience" section. */
export type ExperienceItem = {
  id: string;
  title: string;
  company: string;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

/** One row of GET /api/profile/[id]'s "education" section. */
export type EducationItem = {
  id: string;
  school: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

/** One row of GET /api/profile/[id]'s "skills" section. */
export type SkillItem = {
  id: string;
  name: string;
  endorsementCount: number;
  // Whether the VIEWER has already endorsed this specific skill — drives
  // the endorse button's toggled state, same shape as PostItem.viewerHasReacted.
  endorsedByViewer: boolean;
};

/** One row of GET /api/profile/[id]'s "featured" section. */
export type FeaturedItem = {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
};

/** Full response shape of GET /api/profile/[id] — the rich profile page. */
export type ProfileDetail = PersonDetail & {
  headline: string | null;
  about: string | null;
  openToWork: boolean;
  // Self-only in practice — EditProfileModal is the only reader, and that
  // modal only ever opens on your own profile — but returned for every
  // viewer the same way openToWork is, rather than specially gated, since
  // it carries no more sensitivity than the toggle itself.
  privateProfileViews: boolean;
  connectionDegree: ConnectionDegree;
  isFollowedByViewer: boolean;
  isFollowingViewer: boolean;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  featured: FeaturedItem[];
  // Only populated when isSelf — see GET /api/profile/[id]'s comment on why
  // these never compute for anyone else's profile.
  profileViewCount: number | null;
  searchAppearanceCount: number | null;
};

/** Item shape returned by GET /api/connections and GET /api/connections/requests. */
export type ConnectionListItem = {
  connectionId: string;
  person: Person;
};

export type PostMediaType = "image" | "video";

export type PostMedia = {
  mediaType: PostMediaType;
  storagePath: string;
  orderIndex: number;
};

/**
 * The now-standard six-reaction set (matches the industry-standard taxonomy
 * every major professional network converged on) — see
 * supabase/network-pro-upgrade.sql's post_reactions_reaction_type_check.
 */
export type ReactionType = "like" | "celebrate" | "support" | "love" | "insightful" | "curious";

/** Count per reaction type, only including types with at least one reaction. */
export type ReactionBreakdown = Partial<Record<ReactionType, number>>;

/** Minimal nested shape for a reposted post's original — see PostItem.repostOf. */
export type RepostedPost = {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
  media: PostMedia[];
  deleted: boolean;
};

/** Item shape returned by GET /api/posts. */
export type PostItem = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: Person;
  media: PostMedia[];
  reactionCount: number;
  viewerHasReacted: boolean;
  // Replaces the old plain boolean-like model: how many of each reaction
  // type this post has, and which one (if any) the viewer picked.
  reactionBreakdown: ReactionBreakdown;
  viewerReactionType: ReactionType | null;
  commentCount: number;
  // Present only when this post is a repost (posts.repost_of_id is set).
  // `body` on a repost is the reposter's own added commentary, which may be
  // an empty string for a plain reshare with nothing added.
  repostOf: RepostedPost | null;
  repostCount: number;
  viewerHasReposted: boolean;
  viewerHasSaved: boolean;
};

export type CommentAuthor = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
};

/** Item shape returned by GET /api/posts/[id]/comments. */
export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  author: CommentAuthor;
};

export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "post_reaction"
  | "post_comment"
  | "comment_reply"
  | "message"
  | "admin_broadcast"
  | "skill_endorsement"
  | "post_mention"
  | "post_repost";

/** Item shape returned by GET /api/notifications. */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  actor: { fullName: string; avatarUrl: string | null };
  postId: string | null;
  connectionId: string | null;
  commentId: string | null;
  messageId: string | null;
  // Only populated for "skill_endorsement" rows — the skill's name, joined
  // in so the notification can read "X endorsed your Y skill" without a
  // second fetch.
  skillName: string | null;
  // Only ever populated for "admin_broadcast" rows — every other type still
  // derives its label client-side from `type` + the actor's name. When
  // present, the UI shows this verbatim instead of the templated label.
  body: string | null;
};

/** One accepted connection's message thread — GET /api/messages. */
export type ConversationItem = {
  connectionId: string;
  person: Person;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

/** Item shape returned by GET /api/messages/[connectionId]. */
export type MessageItem = {
  id: string;
  connectionId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

/** One row of GET /api/profile/analytics's "who viewed your profile" list. */
export type ProfileViewerItem = {
  // Null when the viewer browsed privately (profiles.private_profile_views)
  // — render as an anonymous row ("Someone in your network") rather than a
  // Person card when this is null, same spirit as a hidden mutual-
  // connections list, just one level more private.
  viewer: Person | null;
  viewedAt: string;
};

/** One row of GET /api/profile/analytics's per-post performance list. */
export type PostAnalyticsItem = {
  postId: string;
  createdAt: string;
  bodyPreview: string;
  impressionCount: number;
  reactionCount: number;
  commentCount: number;
  repostCount: number;
};

/** Full response shape of GET /api/profile/analytics. */
export type ProfileAnalytics = {
  profileViewCount7d: number;
  profileViewCount: number;
  recentViewers: ProfileViewerItem[];
  searchAppearanceCount7d: number;
  posts: PostAnalyticsItem[];
};
