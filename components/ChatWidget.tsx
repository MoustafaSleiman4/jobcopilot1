"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MessageCircleMore, X, Send, Bot, Lock } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const FREE_MESSAGE_LIMIT = 3;

export default function ChatWidget({ plan = "free" }: { plan?: "free" | "pro" }) {
  const t = useTranslations("dashboard.chat");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Previously hardcoded to only mention resume/interview/job-market help,
  // which is exactly why users didn't think to ask it about Connections/
  // Posts/Messages — the greeting itself was the first thing telling them
  // this bot didn't know about the social network. Now sourced from i18n
  // (see messages/en.json & ar.json's dashboard.chat.greeting) so it stays
  // in sync with the widget's other copy and gets a real Arabic translation
  // instead of a hardcoded English-only string.
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: t("greeting") }]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const limitReached = plan !== "pro" && userMessageCount >= FREE_MESSAGE_LIMIT;
  const messagesLeft = Math.max(0, FREE_MESSAGE_LIMIT - userMessageCount);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || limitReached) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, plan }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant just now." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    // Extra bottom offset below md so the floating button and panel clear
    // DashboardShell's mobile bottom tab bar instead of sitting on top of it.
    <div className="fixed bottom-24 end-4 z-50 sm:end-6 md:bottom-6">
      {open && (
        <div className="mb-4 flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:w-96">
          <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <span className="text-sm font-semibold">{t("title")}</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ms-auto bg-emerald-600 text-white"
                    : "bg-sand-100 text-foreground"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="max-w-[85%] rounded-xl bg-sand-100 px-3 py-2 text-sm text-foreground/50">
                ...
              </div>
            )}
            {plan !== "pro" && !limitReached && userMessageCount > 0 && (
              <p className="text-center text-xs text-foreground/40">
                {t("messagesLeft", { count: messagesLeft })}
              </p>
            )}
            {limitReached && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-gold-400/40 bg-gold-50 p-3 text-center">
                <Lock className="text-gold-600" size={16} />
                <p className="text-xs text-foreground/80">{t("limitReached")}</p>
                <Link
                  href="/pricing"
                  className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {t("upgradeCta")}
                </Link>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={limitReached ? t("placeholderLocked") : t("placeholder")}
              disabled={limitReached}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              aria-label={t("send")}
              disabled={limitReached}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform hover:scale-105"
        aria-label={t("title")}
      >
        <MessageCircleMore size={24} />
      </button>
    </div>
  );
}
