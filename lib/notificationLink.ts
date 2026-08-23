import type { NotificationItem } from "@/lib/social-types";

/**
 * Where a notification should take you when clicked, by type. Shared
 * between NotificationBell (the dropdown) and the full notifications page
 * so the two stay in sync rather than each hand-rolling their own routing.
 *
 * Returns null for a notification that has nothing sensible to link to
 * (e.g. a row missing the id it needs) — callers should render it as
 * plain, non-clickable text in that case rather than link to a dead end.
 */
export function notificationHref(n: NotificationItem): string | null {
  switch (n.type) {
    case "connection_request":
      // The Requests tab (received) — someone is waiting on a response.
      return "/dashboard/connections?tab=receivedRequests";
    case "connection_accepted":
      // My Connections — the request I sent is now a connection.
      return "/dashboard/connections?tab=myConnections";
    case "post_reaction":
    case "post_comment":
    case "comment_reply":
      return n.postId ? `/dashboard/posts?postId=${n.postId}` : null;
    case "message":
      return n.connectionId ? `/dashboard/messages?connectionId=${n.connectionId}` : null;
    case "admin_broadcast":
      // A broadcast has no post/connection to open — it's an announcement,
      // so route straight to the Pro upgrade page it's almost always
      // paired with rather than leaving it non-clickable.
      return "/pricing";
    default:
      return null;
  }
}
