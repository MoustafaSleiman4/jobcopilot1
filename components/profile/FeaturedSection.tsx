"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Plus, Star, Trash2, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { FeaturedItem } from "@/lib/social-types";

const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 400;

type FormState = { title: string; url: string; description: string };
const EMPTY_FORM: FormState = { title: "", url: "", description: "" };

/**
 * The profile page's "Featured" section — a short list of links the
 * profile owner chooses to highlight (a project, an article, a
 * certificate — LinkedIn's own "Featured" shelf), wired to GET/POST
 * /api/profile/featured and DELETE /api/profile/featured/[id]. No PATCH
 * route exists for this one (see app/api/profile/featured/[id]/route.ts) —
 * editing an item is remove-and-re-add, which is an acceptable tradeoff
 * for a section that's usually just 1-3 occasional links, not worth a
 * second endpoint for.
 */
export default function FeaturedSection({
  items,
  isSelf,
  onChange,
}: {
  items: FeaturedItem[];
  isSelf: boolean;
  onChange: (items: FeaturedItem[]) => void;
}) {
  const t = useTranslations("connections");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSelf && items.length === 0) return null;

  async function handleAdd() {
    const title = form.title.trim();
    if (!title) {
      setError(t("detail.featuredTitleRequired"));
      return;
    }
    if (title.length > MAX_TITLE_CHARS) {
      setError(t("detail.featuredTitleTooLong"));
      return;
    }
    if (form.description.trim().length > MAX_DESCRIPTION_CHARS) {
      setError(t("detail.featuredDescriptionTooLong"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url: form.url.trim() || undefined, description: form.description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("detail.editError"));
      onChange([...items, data.item as FeaturedItem]);
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("detail.editError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/profile/featured/${id}`, { method: "DELETE" });
    if (res.ok) onChange(items.filter((i) => i.id !== id));
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Star size={15} className="text-foreground/50" />
          {t("detail.featuredTitle")}
        </h2>
        {isSelf && !adding && (
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setError(null);
              setAdding(true);
            }}
            aria-label={t("detail.addFeatured")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-background hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <div className="min-w-0 text-start">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-emerald-700"
                >
                  <span className="truncate">{item.title}</span>
                  <ExternalLink size={12} className="flex-none text-foreground/40" />
                </a>
              ) : (
                <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
              )}
              {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-foreground/60">{item.description}</p>}
            </div>
            {isSelf && (
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                aria-label={t("detail.delete")}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-foreground/50 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && isSelf && !adding && <p className="text-sm text-foreground/40">{t("detail.featuredEmpty")}</p>}
      </ul>

      {adding && (
        <div className="mt-3 rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground/70">{t("detail.addFeatured")}</p>
            <button type="button" onClick={() => setAdding(false)} aria-label={t("detail.close")} className="text-foreground/40 hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t("detail.featuredTitlePlaceholder")}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={t("detail.featuredUrlPlaceholder")}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder={t("detail.descriptionPlaceholder")}
            className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleAdd} loading={saving}>
              {t("detail.save")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
