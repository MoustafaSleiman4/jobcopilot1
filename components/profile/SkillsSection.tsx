"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Award, Plus, ThumbsUp, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { SkillItem } from "@/lib/social-types";

const MAX_SKILL_CHARS = 60;

/**
 * The profile page's skills list — each skill shows its endorsement count
 * and, for a visitor (not the profile owner, since RLS blocks self-
 * endorsement at the DB level), a one-click "+1" toggle wired to
 * POST/DELETE /api/profile/skills/[id]/endorse. The owner instead gets an
 * add/remove UI for the skills themselves (POST /api/profile/skills,
 * DELETE /api/profile/skills/[id]) — the two controls never show on the
 * same chip, since owning a skill and endorsing it are mutually exclusive
 * per-viewer states.
 */
export default function SkillsSection({
  items,
  isSelf,
  onChange,
}: {
  items: SkillItem[];
  isSelf: boolean;
  onChange: (items: SkillItem[]) => void;
}) {
  const t = useTranslations("connections");
  const [adding, setAdding] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endorseBusyId, setEndorseBusyId] = useState<string | null>(null);

  if (!isSelf && items.length === 0) return null;

  async function handleAdd() {
    const name = newSkill.trim();
    if (!name) return;
    if (name.length > MAX_SKILL_CHARS) {
      setError(t("detail.skillTooLong"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("detail.editError"));
      onChange([...items, data.item as SkillItem]);
      setNewSkill("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("detail.editError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/profile/skills/${id}`, { method: "DELETE" });
    if (res.ok) onChange(items.filter((i) => i.id !== id));
  }

  async function handleEndorseToggle(skill: SkillItem) {
    if (endorseBusyId) return;
    setEndorseBusyId(skill.id);
    const next = !skill.endorsedByViewer;
    onChange(
      items.map((i) =>
        i.id === skill.id ? { ...i, endorsedByViewer: next, endorsementCount: i.endorsementCount + (next ? 1 : -1) } : i
      )
    );
    try {
      const res = await fetch(`/api/profile/skills/${skill.id}/endorse`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("endorse failed");
    } catch {
      onChange(items.map((i) => (i.id === skill.id ? skill : i)));
    } finally {
      setEndorseBusyId(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Award size={15} className="text-foreground/50" />
          {t("detail.skillsTitle")}
        </h2>
        {isSelf && !adding && (
          <button
            type="button"
            onClick={() => {
              setNewSkill("");
              setError(null);
              setAdding(true);
            }}
            aria-label={t("detail.addSkill")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-background hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex items-start gap-2">
          <div className="flex-1">
            <input
              autoFocus
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value.slice(0, MAX_SKILL_CHARS))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder={t("detail.skillPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <Button variant="primary" onClick={handleAdd} loading={saving}>
            {t("detail.save")}
          </Button>
          <button type="button" onClick={() => setAdding(false)} aria-label={t("detail.close")} className="mt-2 text-foreground/40 hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      )}

      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((skill) => (
          <li
            key={skill.id}
            className="flex items-center gap-2 rounded-full border border-border bg-background py-1.5 ps-3.5 pe-2 text-sm"
          >
            <span className="font-medium text-foreground">{skill.name}</span>
            {skill.endorsementCount > 0 && <span className="text-xs text-foreground/40">{skill.endorsementCount}</span>}
            {isSelf ? (
              <button
                type="button"
                onClick={() => handleRemove(skill.id)}
                aria-label={t("detail.delete")}
                className="flex h-5 w-5 items-center justify-center rounded-full text-foreground/40 hover:bg-red-50 hover:text-red-600"
              >
                <X size={11} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleEndorseToggle(skill)}
                disabled={endorseBusyId === skill.id}
                aria-label={t("detail.endorse")}
                title={t("detail.endorse")}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                  skill.endorsedByViewer ? "bg-emerald-100 text-emerald-700" : "text-foreground/40 hover:bg-sand-100 hover:text-emerald-700"
                }`}
              >
                <ThumbsUp size={12} fill={skill.endorsedByViewer ? "currentColor" : "none"} />
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && isSelf && !adding && <p className="text-sm text-foreground/40">{t("detail.skillsEmpty")}</p>}
      </ul>
    </Card>
  );
}
