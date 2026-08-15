"use client";

import { useCallback, useEffect, useRef, useState, Suspense, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Loader2, MessagesSquare, Send, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Avatar from "@/components/ui/Avatar";
import { useAuthUser } from "@/lib/useAuthUser";
import { formatRelativeTime } from "@/lib/socialFormat";
import type { ConversationItem, MessageItem } from "@/lib/social-types";

// Cross-conversation update polling only — see the thread view for how a
// single open thread stays fresh (refetch after send). No realtime channel
// for v1, per the feature brief; this is a deliberately simple setInterval.
const POLL_INTERVAL_MS = 20000;

function MessagesPageContent() {
  const t = useTranslations("messages");
  const locale = useLocale();
  const { user } = useAuthUser();
  const searchParams = useSearchParams();
  const initialConnectionId = searchParams.get("connectionId");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  // Only ever apply the ?connectionId= deep link once — otherwise a poll
  // refresh landing after the user has already navigated away from that
  // thread would yank them back into it.
  const appliedInitialRef = useRef(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      setConversations(Array.isArray(data.items) ? data.items : []);
    } catch {
      // Best effort — keep whatever list is already on screen.
    }
  }, []);

  useEffect(() => {
    setLoadingConversations(true);
    loadConversations().finally(() => setLoadingConversations(false));
  }, [loadConversations]);

  useEffect(() => {
    const handle = setInterval(loadConversations, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [loadConversations]);

  // Auto-open the conversation linked from PersonCard's "Message" button,
  // once conversations have loaded and only if it's actually one of them.
  useEffect(() => {
    if (appliedInitialRef.current || loadingConversations) return;
    appliedInitialRef.current = true;
    if (initialConnectionId && conversations.some((c) => c.connectionId === initialConnectionId)) {
      setActiveConnectionId(initialConnectionId);
    }
  }, [initialConnectionId, loadingConversations, conversations]);

  function handleSelect(connectionId: string) {
    setActiveConnectionId(connectionId);
    // Opening a thread marks the other party's messages as read server-side
    // (see GET /api/messages/[connectionId]) — reflect that locally right
    // away instead of waiting for the next poll tick.
    setConversations((prev) => prev.map((c) => (c.connectionId === connectionId ? { ...c, unreadCount: 0 } : c)));
  }

  function handleThreadUpdated(connectionId: string, lastMessage: ConversationItem["lastMessage"]) {
    setConversations((prev) => {
      const next = prev.map((c) => (c.connectionId === connectionId ? { ...c, lastMessage } : c));
      const idx = next.findIndex((c) => c.connectionId === connectionId);
      if (idx > 0) {
        const [item] = next.splice(idx, 1);
        next.unshift(item);
      }
      return next;
    });
  }

  const activeConversation = conversations.find((c) => c.connectionId === activeConnectionId) ?? null;
  const showEmptyState = !loadingConversations && conversations.length === 0;

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[26rem] max-w-5xl flex-col md:h-[calc(100vh-11rem)]">
      <div className="flex items-center gap-3 pb-4">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <MessagesSquare size={20} />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      </div>

      {loadingConversations ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-foreground/50">
          <Loader2 size={16} className="animate-spin" />
          {t("loading")}
        </div>
      ) : showEmptyState ? (
        <EmptyState
          icon={Users}
          title={t("noConversations")}
          description={t("noConversationsHint")}
          action={
            <Link
              href="/dashboard/connections"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("goToConnections")}
            </Link>
          }
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
          <div className={`min-h-0 overflow-y-auto ${activeConnectionId ? "hidden md:block" : "block"}`}>
            <div className="space-y-2 pb-2">
              {conversations.map((item) => (
                <button
                  key={item.connectionId}
                  type="button"
                  onClick={() => handleSelect(item.connectionId)}
                  className="block w-full text-start"
                >
                  <Card
                    padded={false}
                    className={`flex items-start gap-3 p-3.5 transition-colors hover:border-emerald-300 ${
                      activeConnectionId === item.connectionId ? "border-emerald-400 bg-emerald-50/40" : ""
                    }`}
                  >
                    <Avatar
                      avatarUrl={item.person.avatarUrl}
                      name={item.person.fullName}
                      isOnline={item.person.isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.person.fullName}</p>
                        {item.lastMessage && (
                          <span className="flex-none text-[11px] text-foreground/40">
                            {formatRelativeTime(item.lastMessage.createdAt, locale)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-xs ${
                            item.lastMessage ? "text-foreground/50" : "italic text-foreground/40"
                          }`}
                        >
                          {item.lastMessage ? item.lastMessage.body : t("sayHi")}
                        </p>
                        {item.unreadCount > 0 && (
                          <Badge tone="emerald">{item.unreadCount > 99 ? "99+" : item.unreadCount}</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </div>

          <div className={`min-h-0 ${activeConnectionId ? "block" : "hidden md:block"}`}>
            {activeConversation ? (
              <ThreadView
                key={activeConversation.connectionId}
                conversation={activeConversation}
                currentUserId={user?.id ?? null}
                locale={locale}
                onBack={() => setActiveConnectionId(null)}
                onThreadUpdated={handleThreadUpdated}
              />
            ) : (
              <div className="hidden h-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-foreground/40 md:flex">
                {t("selectConversation")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadView({
  conversation,
  currentUserId,
  locale,
  onBack,
  onThreadUpdated,
}: {
  conversation: ConversationItem;
  currentUserId: string | null;
  locale: string;
  onBack: () => void;
  onThreadUpdated: (connectionId: string, lastMessage: ConversationItem["lastMessage"]) => void;
}) {
  const t = useTranslations("messages");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    const res = await fetch(`/api/messages/${conversation.connectionId}`);
    const data = await res.json();
    setMessages(Array.isArray(data.items) ? data.items : []);
  }, [conversation.connectionId]);

  useEffect(() => {
    setLoading(true);
    loadThread().finally(() => setLoading(false));
  }, [loadThread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/messages/${conversation.connectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const created: MessageItem = await res.json();
        await loadThread();
        onThreadUpdated(conversation.connectionId, {
          body: created.body,
          createdAt: created.createdAt,
          senderId: created.senderId,
        });
      } else {
        setDraft(body);
      }
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const person = conversation.person;
  const statusLabel = person.isOnline
    ? t("online")
    : person.lastSeenAt
      ? t("lastSeen", { time: formatRelativeTime(person.lastSeenAt, locale) })
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-foreground/60 hover:bg-sand-100 md:hidden"
        >
          <ArrowLeft size={16} />
        </button>
        <Avatar avatarUrl={person.avatarUrl} name={person.fullName} isOnline={person.isOnline} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{person.fullName}</p>
          {statusLabel && <p className="truncate text-xs text-foreground/50">{statusLabel}</p>}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-foreground/50">
            <Loader2 size={14} className="animate-spin" />
            {t("loading")}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground/40">{t("sayHi")}</p>
        ) : (
          messages.map((m) => {
            const own = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                    own ? "bg-emerald-600 text-white" : "bg-sand-100 text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${own ? "text-white/70" : "text-foreground/40"}`}>
                    {formatRelativeTime(m.createdAt, locale)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-none items-end gap-2 border-t border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("composerPlaceholder")}
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <Button
          variant="primary"
          onClick={handleSend}
          loading={sending}
          disabled={!draft.trim()}
          aria-label={t("send")}
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      }
    >
      <MessagesPageContent />
    </Suspense>
  );
}
