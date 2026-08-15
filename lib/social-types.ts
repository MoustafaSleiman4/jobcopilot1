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
};

/** Item shape returned by GET /api/people/search and GET /api/people/suggestions. */
export type PersonResult = Person & { connectionStatus: ConnectionStatus };

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
  | "comment_reply";

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
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
