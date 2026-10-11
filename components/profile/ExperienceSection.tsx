"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Briefcase, Pencil, Plus, Trash2, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { ExperienceItem } from "@/lib/social-types";

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;

type FormState = {
  title: string;
  company: string;
  employmentType: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

const EMPTY_FORM: FormState = { title: "", company: "", employmentType: "", location: "", startDate: "", endDate: "", description: "" };

function formatMonthYear(value: string | null, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date);
}

/**
 * The profile page's work-history list — self-editable (add/edit/remove),
 * read-only for every other viewer, wired to GET/POST /api/profile/experience
 * and PATCH/DELETE /api/profile/experience/[id]. Mirrors
 * EditProfileModal's "fetch -> local optimistic state -> PATCH" shape, but
 * as an inline add/edit form rather than a modal — a work-history entry
 * has enough fields (title, company, type, location, two dates,
 * description) that a cramped popup would be worse than expanding right
 * in the page flow.
 */
export default function ExperienceSection({
  items,
  isSelf,
  onChange,
}: {
  items: ExperienceItem[];
  isSelf: boolean;
  onChange: (items: ExperienceItem[]) => void;
}) {
  const t = useTranslations("connections");
  const locale = useLocale();
  const [formOpen, setFormOpen] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSelf && items.length === 0) return null;

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen("new");
  }

  function openEdit(item: ExperienceItem) {
    setForm({
      title: item.title,
      company: item.company,
      employmentType: item.employmentType ?? "",
      location: item.location ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      description: item.description ?? "",
    });
    setError(null);
    setFormOpen(item.id);
  }

  async function handleSave() {
    const title = form.title.trim();
    const company = form.company.trim();
    if (!title || !company) {
      setError(t("detail.experienceRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title,
      company,
      employmentType: form.employmentType || null,
      location: form.location.trim() || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      description: form.description.trim() || null,
    };
    try {
      if (formOpen === "new") {
        const res = await fetch("/api/profile/experience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("detail.editError"));
        onChange([...items, data.item as ExperienceItem]);
      } else if (formOpen) {
        const res = await fetch(`/api/profile/experience/${formOpen}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("detail.editError"));
        onChange(items.map((i) => (i.id === formOpen ? { ...i, ...payload } : i)));
      }
      setFormOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("detail.editError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("detail.deleteConfirm"))) return;
    const res = await fetch(`/api/profile/experience/${id}`, { method: "DELETE" });
    if (res.ok) onChange(items.filter((i) => i.id !== id));
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Briefcase size={15} className="text-foreground/50" />
          {t("detail.experienceTitle")}
        </h2>
        {isSelf && formOpen === null && (
          <button
            type="button"
            onClick={openNew}
            aria-label={t("detail.addExperience")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-background hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-4">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start justify-between gap-3">
            <div className="min-w-0 text-start">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-xs text-foreground/60">
                {item.company}
                {item.employmentType && ` · ${t(`detail.employmentTypes.${item.employmentType}`)}`}
              </p>
              <p className="mt-0.5 text-[11px] text-foreground/40">
                {formatMonthYear(item.startDate, locale) || t("detail.datePresent")}
                {" — "}
                {item.endDate ? formatMonthYear(item.endDate, locale) : t("detail.datePresent")}
                {item.location && ` · ${item.location}`}
              </p>
              {item.description && <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/70">{item.description}</p>}
            </div>
            {isSelf && (
              <div className="flex flex-none items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  aria-label={t("detail.edit")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-background hover:text-foreground"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  aria-label={t("detail.delete")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </li>
        ))}
        {items.length === 0 && isSelf && formOpen === null && (
          <p className="text-sm text-foreground/40">{t("detail.experienceEmpty")}</p>
        )}
      </ul>

      {formOpen !== null && (
        <div className="mt-4 rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground/70">
              {formOpen === "new" ? t("detail.addExperience") : t("detail.editExperience")}
            </p>
            <button type="button" onClick={() => setFormOpen(null)} aria-label={t("detail.close")} className="text-foreground/40 hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("detail.titlePlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder={t("detail.companyPlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={form.employmentType}
              onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">{t("detail.employmentTypePlaceholder")}</option>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`detail.employmentTypes.${type}`)}
                </option>
              ))}
            </select>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder={t("detail.locationPlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <label className="flex flex-col gap-1 text-[11px] text-foreground/50">
              {t("detail.startDate")}
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-foreground/50">
              {t("detail.endDate")}
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t("detail.descriptionPlaceholder")}
            className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormOpen(null)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {t("detail.save")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
