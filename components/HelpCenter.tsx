"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  Zap,
  FileText,
  Mail,
  KanbanSquare,
  CreditCard,
  Languages,
  Briefcase,
  MessageCircleMore,
  ListChecks,
  ChevronDown,
  Send,
} from "lucide-react";

type FaqItem = { id: string; q: string; a: string };
type FaqCategory = { name: string; items: FaqItem[] };
type QuickTopic = { id: string; question: string };

// Icons are fixed per topic id (not translated content) — matched to the
// same ids used in messages/{en,ar}.json's help.quickTopics so a locale
// swap never has to touch this file.
const QUICK_TOPIC_ICONS: Record<string, ReactNode> = {
  "jobs-no-matches": <Search size={20} />,
  "auto-apply-how": <Zap size={20} />,
  "resume-build": <FileText size={20} />,
  "cover-letter-not-generating": <Mail size={20} />,
  "applications-track": <KanbanSquare size={20} />,
  "billing-cancel": <CreditCard size={20} />,
  "account-language": <Languages size={20} />,
  "employer-post-job": <Briefcase size={20} />,
};

/**
 * The site's help center — a "what can we help with?" quick-topic grid
 * feeding into a full, searchable, categorized FAQ, plus a direct-contact
 * card for anything not covered. Modeled on standard SaaS help-center
 * layouts (quick topics up top, full FAQ below, "still stuck? email us" as
 * the backstop), but every answer here is grounded in what this app
 * actually does — see app/[locale]/help/page.tsx and messages/*.json's
 * `help` namespace for the content itself.
 *
 * Client component (search filtering + accordion expand/collapse need
 * interactivity), but all content comes from i18n via useTranslations —
 * nothing here is hardcoded English, so the Arabic version of this page
 * works identically.
 */
export default function HelpCenter() {
  const t = useTranslations("help");
  const [search, setSearch] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const quickTopics = t.raw("quickTopics") as QuickTopic[];
  const categories = t.raw("categories") as FaqCategory[];
  const contactEmail = t("contact.email");

  const query = search.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!query) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) => item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, query]);

  const totalMatches = filteredCategories.reduce((n, c) => n + c.items.length, 0);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAndScrollTo(id: string) {
    setSearch("");
    setOpenIds((prev) => new Set(prev).add(id));
    // Deferred so the (possibly just-re-shown) target element exists in the
    // DOM before we try to scroll to it — clearing an active search above
    // can re-render the FAQ list in the same tick.
    requestAnimationFrame(() => {
      document.getElementById(`faq-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mx-auto max-w-2xl">
        <Search
          size={18}
          className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-foreground/40"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-3.5 ps-11 pe-5 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-emerald-400"
        />
      </div>

      {/* Quick topics — hidden while actively searching so the filtered FAQ
          list below isn't competing for attention with a now-irrelevant
          static grid. */}
      {!query && (
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {quickTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => openAndScrollTo(topic.id)}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 text-start text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                {QUICK_TOPIC_ICONS[topic.id] ?? <ListChecks size={20} />}
              </span>
              {topic.question}
            </button>
          ))}

          <a
            href={`mailto:${contactEmail}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4 text-start text-sm font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
              <MessageCircleMore size={20} />
            </span>
            {t("somethingElseQuestion")}
          </a>

          <a
            href="#full-faq"
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4 text-start text-sm font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
              <ListChecks size={20} />
            </span>
            {t("viewFullFaq")}
          </a>
        </div>
      )}

      {/* Full FAQ */}
      <div id="full-faq" className="mt-16 scroll-mt-24">
        {query && totalMatches === 0 && (
          <p className="text-center text-sm text-foreground/50">{t("noResults")}</p>
        )}

        <div className="space-y-10">
          {filteredCategories.map((cat) => (
            <div key={cat.name}>
              <h3 className="text-lg font-bold text-foreground">{cat.name}</h3>
              <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
                {cat.items.map((item) => {
                  const isOpen = openIds.has(item.id);
                  return (
                    <div key={item.id} id={`faq-${item.id}`} className="scroll-mt-24">
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-sm font-semibold text-foreground"
                      >
                        <span>{item.q}</span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-foreground/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 text-sm leading-relaxed text-foreground/70">{item.a}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact fallback */}
      <div className="mt-16 rounded-2xl border border-gold-400/30 bg-gold-50 px-8 py-10 text-center">
        <h3 className="text-xl font-bold text-foreground">{t("contact.heading")}</h3>
        <p className="mt-2 text-sm text-foreground/60">{t("contact.body")}</p>
        <a
          href={`mailto:${contactEmail}`}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
        >
          <Send size={16} />
          {t("contact.emailCta")}
        </a>
      </div>
    </div>
  );
}
