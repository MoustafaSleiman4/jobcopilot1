import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * Turns http(s):// substrings in plain text into real `<a>` tags while
 * leaving everything else as plain text run through React/JSX's normal
 * escaping. Deliberately regex-based with no HTML parsing step and no
 * `dangerouslySetInnerHTML` anywhere — post/comment bodies are untrusted
 * user input, so the only thing that can ever become markup here is a
 * same-shape `<a href="...">` this function builds itself, never a byte of
 * the original string.
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(URL_RE);
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const url = match[0];
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
    lastIndex = match.index + url.length;
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
