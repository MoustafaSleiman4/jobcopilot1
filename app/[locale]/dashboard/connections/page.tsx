"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Inbox, Search as SearchIcon, Loader2 } from "lucide-react";
import PersonCard from "@/components/PersonCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import type { ConnectionListItem, PersonResult } from "@/lib/social-types";

type Tab = "myConnections" | "requests" | "findPeople";

export default function ConnectionsPage() {
  const t = useTranslations("connections");
  const [tab, setTab] = useState<Tab>("myConnections");

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(["myConnections", "requests", "findPeople"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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
        {tab === "requests" && <RequestsTab />}
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

  useEffect(() => {
    setLoading(true);
    load().then(({ items: newItems, nextCursor }) => {
      setItems(newItems);
      setCursor(nextCursor);
      setLoading(false);
    });
  }, [load]);

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

function RequestsTab() {
  const t = useTranslations("connections");
  const [items, setItems] = useState<ConnectionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/requests")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
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
        .then((data) => setResults(Array.isArray(data) ? data : []))
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
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-gold-600">{t("suggestionsTitle")}</p>
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
          />
        ) : (
          list.map((person) => <PersonCard key={person.id} person={person} onConnect={handleConnect} />)
        )}
      </div>
    </div>
  );
}
