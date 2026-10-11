"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import type { PersonResult } from "@/lib/social-types";

const MENTION_TRIGGER_RE = /@([a-zA-Z؀-ۿ][a-zA-Z0-9؀-ۿ ]{0,40})$/;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A plain textarea with an @mention autocomplete layered on top — typing
 * "@" followed by letters opens a dropdown of matching people (reusing GET
 * /api/people/search, same source as Find People); picking one inserts
 * `@[Display Name](user-id)` markup at the cursor (see lib/postText.ts for
 * the matching server-side extraction and lib/socialFormat.tsx for how
 * that markup renders back out as a profile link). Deliberately built as
 * its own component rather than inlined into PostComposer so the same
 * mention behavior could be reused anywhere else a post/comment body is
 * typed, without duplicating the trigger-detection regex and fetch logic.
 */
export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("posts");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [open, setOpen] = useState(false);
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);

    const cursor = e.target.selectionStart ?? next.length;
    const uptoCursor = next.slice(0, cursor);
    const match = uptoCursor.match(MENTION_TRIGGER_RE);
    if (!match) {
      setOpen(false);
      setTriggerStart(null);
      return;
    }

    const query = match[1].trim();
    setTriggerStart(cursor - match[0].length);
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions((data.items ?? []).slice(0, 6));
        setOpen(true);
      } catch {
        // Silently drop — a mention dropdown that fails to load just means
        // the person types the rest of the word as plain, un-linked text.
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function pick(person: PersonResult) {
    if (triggerStart === null) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, triggerStart);
    const after = value.slice(cursor);
    const markup = `@[${person.fullName}](${person.id}) `;
    const nextValue = `${before}${markup}${after}`;
    onChange(nextValue);
    setOpen(false);
    setTriggerStart(null);
    // Restore focus + cursor position right after the inserted markup —
    // without this the textarea loses focus on selection (a plain button
    // click steals it), which feels broken mid-sentence.
    requestAnimationFrame(() => {
      textarea?.focus();
      const pos = before.length + markup.length;
      textarea?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">{t("mentionHint")}</p>
          {suggestions.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-start hover:bg-background"
            >
              <Avatar avatarUrl={person.avatarUrl} name={person.fullName} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{person.fullName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
