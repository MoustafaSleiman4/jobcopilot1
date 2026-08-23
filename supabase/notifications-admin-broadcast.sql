-- Adds a generic, one-directional "admin broadcast" notification type so an
-- account owner can send a single announcement (e.g. a Pro-upgrade nudge) to
-- many users at once via the existing notification bell, without requiring
-- an accepted connection between sender and recipient the way DMs do (see
-- app/api/messages/[connectionId]/route.ts's loadAcceptedConnection check —
-- "DMs only exist between accepted connections").
--
-- `body` is nullable and only ever populated for admin_broadcast rows today
-- — every other notification type still derives its label client-side from
-- `type` + the joined actor's name (see components/NotificationBell.tsx's
-- TYPE_KEY map). A broadcast has no natural "actor" (it isn't from another
-- user), so `actor_id` stays null for these rows and the API layer supplies
-- a synthetic "GulfJobCopilot" sender instead of falling through to
-- deriveDisplayName(null, null) => "Member".
--
-- Rows are inserted exclusively via the service-role client / a direct SQL
-- call from an operator — there is still no INSERT policy for
-- `authenticated` on this table (only "Users read their own notifications"
-- and "Users mark their own notifications read" exist), matching the
-- existing fan_out_notification() trigger's own write path being the only
-- other writer.

alter table public.notifications
  add column if not exists body text;

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
    'admin_broadcast'
  ]));
