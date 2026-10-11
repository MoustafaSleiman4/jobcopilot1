"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GraduationCap, Pencil, Plus, Trash2, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { EducationItem } from "@/lib/social-types";

type FormState = {
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  description: string;
};

const EMPTY_FORM: FormState = { school: "", degree: "", fieldOfStudy: "", startDate: "", endDate: "", description: "" };

function formatYear(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return String(date.getFullYear());
}

/**
 * The profile page's education list — same self-editable / read-only-for-
 * others shape as ExperienceSection, wired to GET/POST
 * /api/profile/education and PATCH/DELETE /api/profile/education/[id].
 * Kept as its own component rather than parameterizing ExperienceSection
 * since the two sections' fields genuinely differ (school/degree/field vs
 * title/company/employmentType/location) — sharing one generic form would
 * need as much branching as just writing two small components.
 */
export default function EducationSection({
  items,
  isSelf,
  onChange,
}: {
  items: EducationItem[];
  isSelf: boolean;
  onChange: (items: EducationItem[]) => void;
}) {
  const t = useTranslations("connections");
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

  function openEdit(item: EducationItem) {
    setForm({
      school: item.school,
      degree: item.degree ?? "",
      fieldOfStudy: item.fieldOfStudy ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      description: item.description ?? "",
    });
    setError(null);
    setFormOpen(item.id);
  }

  async function handleSave() {
    const school = form.school.trim();
    if (!school) {
      setError(t("detail.educationRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      school,
      degree: form.degree.trim() || null,
      fieldOfStudy: form.fieldOfStudy.trim() || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      description: form.description.trim() || null,
    };
    try {
      if (formOpen === "new") {
        const res = await fetch("/api/profile/education", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("detail.editError"));
        onChange([...items, data.item as EducationItem]);
      } else if (formOpen) {
        const res = await fetch(`/api/profile/education/${formOpen}`, {
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
    const res = await fetch(`/api/profile/education/${id}`, { method: "DELETE" });
    if (res.ok) onChange(items.filter((i) => i.id !== id));
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <GraduationCap size={15} className="text-foreground/50" />
          {t("detail.educationTitle")}
        </h2>
        {isSelf && formOpen === null && (
          <button
            type="button"
            onClick={openNew}
            aria-label={t("detail.addEducation")}
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
              <p className="text-sm font-semibold text-foreground">{item.school}</p>
              {(item.degree || item.fieldOfStudy) && (
                <p className="text-xs text-foreground/60">{[item.degree, item.fieldOfStudy].filter(Boolean).join(", ")}</p>
              )}
              {(item.startDate || item.endDate) && (
                <p className="mt-0.5 text-[11px] text-foreground/40">
                  {formatYear(item.startDate)}
                  {" — "}
                  {formatYear(item.endDate) || t("detail.datePresent")}
                </p>
              )}
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
          <p className="text-sm text-foreground/40">{t("detail.educationEmpty")}</p>
        )}
      </ul>

      {formOpen !== null && (
        <div className="mt-4 rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground/70">
              {formOpen === "new" ? t("detail.addEducation") : t("detail.editEducation")}
            </p>
            <button type="button" onClick={() => setFormOpen(null)} aria-label={t("detail.close")} className="text-foreground/40 hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={form.school}
              onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))}
              placeholder={t("detail.schoolPlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none sm:col-span-2"
            />
            <input
              value={form.degree}
              onChange={(e) => setForm((f) => ({ ...f, degree: e.target.value }))}
              placeholder={t("detail.degreePlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              value={form.fieldOfStudy}
              onChange={(e) => setForm((f) => ({ ...f, fieldOfStudy: e.target.value }))}
              placeholder={t("detail.fieldOfStudyPlaceholder")}
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
