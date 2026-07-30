"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { MessageCircleMore, X, Send, Bot } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export default function ChatWidget() {
  const t = useTranslations("dashboard.chat");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your JobCopilot assistant. Ask me about your resume, interview prep, or the job market — I'll use your profile to help.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
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
    <div className="fixed bottom-6 end-6 z-50">
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
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              aria-label={t("send")}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
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
