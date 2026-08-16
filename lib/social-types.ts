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
};

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
  commentCount: number;
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
  | "message";

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
