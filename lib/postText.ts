// Server-side extraction helpers for a post body's hashtags and mentions —
// used once, at post-creation time (POST /api/posts and POST
// /api/posts/[id]/repost), to populate post_hashtags/post_mentions. Kept
// separate from lib/socialFormat.tsx (which is the client-side RENDERING
// half of this — turning the same markup into clickable links) so a server
// route never has to import a "use client"-adjacent React/JSX module just
// to extract plain strings.

const HASHTAG_RE = /#([a-zA-Z][a-zA-Z0-9_]{0,49})/g;
// Mentions are written into the body as literal `@[Display Name](user-id)`
// markup by PostComposer's mention picker (see components/PostComposer.tsx)
// — never free-typed "@Name" text, which would be ambiguous against two
// people sharing a name. The id is a uuid, matched loosely here (any
// non-`)` run) since the DB's own insert will reject anything that isn't a
// real uuid rather than this regex needing to be the enforcement point.
const MENTION_RE = /@\[[^\]]+\]\(([^)]+)\)/g;

/** Lowercased, de-duplicated hashtags (no leading '#') found in a post body. */
export function extractHashtags(body: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(HASHTAG_RE);
  while ((match = re.exec(body)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

/** De-duplicated user ids mentioned (via `@[Name](id)` markup) in a post body. */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  while ((match = re.exec(body)) !== null) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}
