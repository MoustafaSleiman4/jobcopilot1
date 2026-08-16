"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import PersonCard from "@/components/PersonCard";
import type { PersonResult } from "@/lib/social-types";

// LinkedIn's right rail shows a handful of suggestions, not the full list —
// GET /api/people/suggestions already caps at 10 (see LIMIT there); this
// trims further so the rail doesn't tower over the feed column next to it.
// "See all" links to the full Find People tab for the rest.
const SIDEBAR_LIMIT = 4;

/**
 * Right rail on the Posts page — "People you may know," reusing the exact
 * same PersonCard + GET /api/people/suggestions already built for the Find
 * People tab (app/[locale]/dashboard/connections/page.tsx) rather than a
 * second, narrower-styled row component. PersonCard's mobile-width layout
 * (stacked name/actions) already fits a narrow sidebar column fine — no
 * separate compact variant needed.
 */
export default function PostsSuggestionsSidebar() {
  const t = useTranslations("connections");
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    fetch("/api/people/suggestions")
      .then((res) => res.json())
      .then((data) => setSuggestions(Array.isArray(data?.items) ? data.items : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  function updateStatus(personId: string) {
    setSuggestions((prev) => prev.map((p) => (p.id === personId ? { ...p, connectionStatus: "pending_sent" } : p)));
  }

  async function handleConnect(personId: string) {
    const res = await fetch("/api/connections/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: personId }),
    });
    if (res.ok) updateStatus(personId);
  }

  if (loading || suggestions.length === 0) return null;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("suggestionsTitle")}</p>
      </div>
      <div className="space-y-2 p-4">
        {suggestions.slice(0, SIDEBAR_LIMIT).map((person) => (
          <PersonCard key={person.id} person={person} onConnect={handleConnect} onChanged={refresh} />
        ))}
      </div>
      <Link
        href={{ pathname: "/dashboard/connections", query: { tab: "findPeople" } }}
        className="block border-t border-border px-4 py-3 text-center text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        {t("findPeople")}
      </Link>
    </Card>
  );
}
