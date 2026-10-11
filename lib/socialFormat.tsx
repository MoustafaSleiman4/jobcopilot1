import { Fragment, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Combined into one alternation (rather than four separate passes) so
// overlapping matches can't double-process the same span — e.g. a URL
// containing a '#' fragment would otherwise also get matched by the
// hashtag pattern on a second pass. Group order matches the branches below.
const COMBINED_RE =
  /(https?:\/\/[^\s]+)|(@\[[^\]]+\]\([^)]+\))|(#[a-zA-Z][a-zA-Z0-9_]{0,49})/g;
const MENTION_PART_RE = /^@\[([^\]]+)\]\(([^)]+)\)$/;

/**
 * Turns a post/comment body's plain text into rendered content: http(s)://
 * URLs become real links, `#hashtag` tokens become links to that hashtag's
 * feed, and `@[Display Name](user-id)` mention markup (written by
 * PostComposer's mention picker — see lib/postText.ts for the matching
 * server-side extraction) becomes a link to that person's profile. Deliberately
 * regex-based with no HTML parsing step and no `dangerouslySetInnerHTML`
 * anywhere — post/comment bodies are untrusted user input, so the only
 * thing that can ever become markup here is one of the fixed link shapes
 * this function builds itself, never a byte of the original string.
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(COMBINED_RE);
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const [whole, url, mention, hashtag] = match;

    if (url) {
      nodes.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-emerald-700 underline hover:text-emerald-800"
        >
          {url}
        </a>
      );
    } else if (mention) {
      const parts = mention.match(MENTION_PART_RE);
      if (parts) {
        const [, name, userId] = parts;
        nodes.push(
          <Link
            key={key++}
            href={`/dashboard/profile/${userId}`}
            className="font-semibold text-emerald-700 hover:underline"
          >
            @{name}
          </Link>
        );
      } else {
        nodes.push(<Fragment key={key++}>{mention}</Fragment>);
      }
    } else if (hashtag) {
      const tag = hashtag.slice(1);
      nodes.push(
        <Link
          key={key++}
          href={{ pathname: "/dashboard/posts", query: { hashtag: tag.toLowerCase() } }}
          className="font-medium text-emerald-700 hover:underline"
        >
          {hashtag}
        </Link>
      );
    }

    lastIndex = match.index + whole.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

const RELATIVE_DIVISIONS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * "3 hours ago" / "منذ 3 ساعات" style relative timestamps using the
 * platform's built-in Intl.RelativeTimeFormat — locale-correct for both
 * `en` and `ar` (including Arabic's plural rules) with zero extra i18n keys
 * needed, unlike a hand-rolled "Xm/Xh/Xd" formatter would.
 */
export function formatRelativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const [unit, secondsInUnit] of RELATIVE_DIVISIONS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, "second");
}
