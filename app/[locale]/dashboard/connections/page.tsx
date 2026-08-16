"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Users, Inbox, Send, Search as SearchIcon, Loader2, UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import PersonCard from "@/components/PersonCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import type { ConnectionListItem, PersonResult } from "@/lib/social-types";

// "requests" used to be one tab covering only requests received. Split in
// two per explicit request: "sentRequests" (Pending — requests I sent,
// awaiting their response) and "receivedRequests" (Requests — people who
// asked to connect with me, awaiting mine). Keeping both as distinct tabs
// rather than sub-tabs of one "Requests" tab matches this page's existing
// flat tab-bar pattern and keeps each list's empty/loading state simple.
type Tab = "myConnections" | "sentRequests" | "receivedRequests" | "findPeople";

const VALID_TABS: Tab[] = ["myConnections", "sentRequests", "receivedRequests", "findPeople"];

function isTab(value: string | null): value is Tab {
  return value !== null && (VALID_TABS as string[]).includes(value);
}

// Wrapped in Suspense below because useSearchParams() requires it — same
// pattern as messages/page.tsx and posts/page.tsx, needed here so a
// notification link like /dashboard/connections?tab=receivedRequests lands
// on the right tab instead of always defaulting to myConnections.
export default function ConnectionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-foreground/50">Loading…</p>}>
      <ConnectionsPageContent />
    </Suspense>
  );
}

function ConnectionsPageContent() {
  const t = useTranslations("connections");
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "myConnections");

  // The useState above only seeds the tab on this component's FIRST mount.
  // That's enough when a notification link lands here fresh, but if the
  // person is already sitting on this page (on any tab) — including with
  // the notification bell open, which renders on every dashboard page —
  // and clicks a "?tab=receivedRequests" link, Next.js does a client-side
  // navigation without unmounting/remounting this component, so the seeded
  // useState value never gets a chance to re-run and the tab silently stays
  // wherever it was. This effect re-syncs `tab` whenever the URL's `tab`
  // param actually changes, so the same click works whether it's the first
  // page load or a same-page navigation.
  useEffect(() => {
    const paramTab = searchParams.get("tab");
    if (isTab(paramTab)) {
      setTab((current) => (current === paramTab ? current : paramTab));
    }
  }, [searchParams]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
          </div>
        </div>
        {/* Shortcut into the existing /dashboard/invite flow, right on the
            Connections page itself — someone here is already in a "find
            people" mindset, and the people they're looking for often
            aren't on the platform yet, so inviting them shouldn't require
            hunting for a separate nav item. */}
        <Link
          href="/dashboard/invite"
          className="inline-flex flex-none items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-emerald-300 hover:text-foreground"
        >
          <UserPlus size={14} />
          <span className="hidden sm:inline">{t("inviteFriends")}</span>
        </Link>
      </div>

      {/* Horizontally scrollable, not wrapping/shrinking — with the fuller
          "Sent Requests" / "Received Requests" labels (see removeConfirm/
          tabs rename), four tabs no longer fit on a phone-width screen in
          one non-scrolling row without squeezing each label onto two lines.
          Same pattern as DashboardShell's mobile bottom tab bar. */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {(["myConnections", "sentRequests", "receivedRequests", "findPeople"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-none whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-foreground/50 hover:text-foreground"
            }`}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "myConnections" && <MyConnectionsTab />}
        {tab === "sentRequests" && <SentRequestsTab />}
        {tab === "receivedRequests" && <ReceivedRequestsTab />}
        {tab === "findPeople" && <FindPeopleTab />}
      </div>
    </div>
  );
}

function MyConnectionsTab() {
  const t = useTranslations("connections");
  const [items, setItems] = useState<ConnectionListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cursorParam?: string | null) => {
    const params = new URLSearchParams();
    if (cursorParam) params.set("cursor", cursorParam);
    const res = await fetch(`/api/connections?${params.toString()}`);
    const data = await res.json();
    return { items: (data.items ?? []) as ConnectionListItem[], nextCursor: (data.nextCursor ?? null) as string | null };
  }, []);

  // Named separately from the mount effect so it can also serve as the
  // "refresh me" callback handed to PersonCard's onChanged — a remove
  // triggered from inside the profile detail modal (not this list's own
  // button) has no way to surgically patch `items` itself, so it just
  // re-fetches from the top like the initial load does.
  const refresh = useCallback(() => {
    setLoading(true);
    load().then(({ items: newItems, nextCursor }) => {
      setItems(newItems);
      setCursor(nextCursor);
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const { items: newItems, nextCursor } = await load(cursor);
    setItems((prev) => [...prev, ...newItems]);
    setCursor(nextCursor);
    setLoadingMore(false);
  }

  async function handleRemove(connectionId: string) {
    const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.connectionId !== connectionId));
  }

  if (loading) return <p className="text-sm text-foreground/50">{t("loading")}</p>;

  if (items.length === 0) {
    return <EmptyState icon={Users} title={t("noConnections")} description={t("noConnectionsHint")} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <PersonCard
          key={item.connectionId}
          person={{ ...item.person, connectionStatus: "connected" }}
          connectionId={item.connectionId}
          onRemove={handleRemove}
          onChanged={refresh}
        />
      ))}
      {cursor && (
        <div className="pt-2 text-center">
          <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

// People who asked to connect with me — the actionable list (accept/decline).
function ReceivedRequestsTab() {
  const t = useTranslations("connections");
  const [items, setItems] = useState<ConnectionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetch("/api/connections/requests")
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAccept(connectionId: string) {
    const res = await fetch(`/api/connections/${connectionId}/accept`, { method: "POST" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.connectionId !== connectionId));
  }

  async function handleDecline(connectionId: string) {
    const res = await fetch(`/api/connections/${connectionId}/decline`, { method: "POST" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.connectionId !== connectionId));
  }

  if (loading) return <p className="text-sm text-foreground/50">{t("loading")}</p>;

  if (items.length === 0) {
    return <EmptyState icon={Inbox} title={t("noRequests")} description={t("noRequestsHint")} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <PersonCard
          key={item.connectionId}
          person={{ ...item.person, connectionStatus: "pending_received" }}
          connectionId={item.connectionId}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

// Requests I sent that are still awaiting the other person's response —
// the outbound counterpart to ReceivedRequestsTab above, reading from the
// new GET /api/connections/requests/sent. Only action available is
// withdrawing the request (DELETE /api/connections/[id], same endpoint
// MyConnectionsTab uses to remove an accepted connection — the route
// already supports removing a still-pending row too).
function SentRequestsTab() {
  const t = useTranslations("connections");
  const [items, setItems] = useState<ConnectionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetch("/api/connections/requests/sent")
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCancel(connectionId: string) {
    const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.connectionId !== connectionId));
  }

  if (loading) return <p className="text-sm text-foreground/50">{t("loading")}</p>;

  if (items.length === 0) {
    return <EmptyState icon={Send} title={t("noSentRequests")} description={t("noSentRequestsHint")} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <PersonCard
          key={item.connectionId}
          person={{ ...item.person, connectionStatus: "pending_sent" }}
          connectionId={item.connectionId}
          onCancel={handleCancel}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

function FindPeopleTab() {
  const t = useTranslations("connections");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/people/suggestions")
      .then((res) => res.json())
      .then((data) => {
        // GET /api/people/suggestions responds { items: [...] }, not a bare
        // array — this previously read `Array.isArray(data)` directly on
        // that object, which is always false, so suggestions silently
        // rendered empty regardless of what the API actually returned.
        if (!cancelled) setSuggestions(Array.isArray(data?.items) ? data.items : []);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/people/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        // Same { items: [...] } vs bare-array mismatch as the suggestions
        // fetch above — this is the actual cause of "Find People" (and
        // search) never returning results, regardless of what the backend
        // matched.
        .then((data) => setResults(Array.isArray(data?.items) ? data.items : []))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  function updateStatus(list: PersonResult[], personId: string): PersonResult[] {
    return list.map((p) => (p.id === personId ? { ...p, connectionStatus: "pending_sent" } : p));
  }

  async function handleConnect(personId: string) {
    const res = await fetch("/api/connections/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: personId }),
    });
    if (res.ok) {
      setResults((prev) => updateStatus(prev, personId));
      setSuggestions((prev) => updateStatus(prev, personId));
    }
  }

  // PersonDetailModal's actions (connect/cancel) don't know which array a
  // row came from, so unlike handleConnect above (a targeted status patch)
  // this just re-fetches both lists — simplest correct way to reflect
  // whatever changed inside the modal back onto the row behind it.
  function handleChanged() {
    fetch("/api/people/suggestions")
      .then((res) => res.json())
      .then((data) => setSuggestions(Array.isArray(data?.items) ? data.items : []));
    const q = query.trim();
    if (q) {
      fetch(`/api/people/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => setResults(Array.isArray(data?.items) ? data.items : []));
    }
  }

  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? results : suggestions;
  const isLoading = showingSearch ? searching : loadingSuggestions;

  return (
    <div>
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-2.5 ps-10 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {!showingSearch && (
        <div className="mt-4 flex items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("suggestionsTitle")}</p>
          {/* GET /api/people/suggestions caps its result at 10 (see LIMIT
              in that route) — flagging that here so "only 10 show up" reads
              as by-design, not as another missing-results bug. */}
          <p className="text-[11px] text-foreground/40">{t("suggestionsHint")}</p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-foreground/50">
            <Loader2 size={14} className="animate-spin" />
            {t("loading")}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            title={showingSearch ? t("noResults") : t("noSuggestions")}
            description={showingSearch ? t("noResultsHint") : undefined}
            action={
              showingSearch ? (
                <Link
                  href="/dashboard/invite"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <UserPlus size={14} />
                  {t("inviteFriends")}
                </Link>
              ) : undefined
            }
          />
        ) : (
          list.map((person) => (
            <PersonCard key={person.id} person={person} onConnect={handleConnect} onChanged={handleChanged} />
          ))
        )}
      </div>
    </div>
  );
}
