"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const MAX_ABOUT_CHARS = 2600;

/**
 * The profile page's "About" section — a free-text summary, self-editable
 * inline (no separate modal, unlike headline/openToWork in
 * EditProfileModal: this is a full paragraph, not a one-line field, so it
 * gets its own expand-to-edit textarea rather than fighting for room in
 * that smaller dialog). Renders nothing for a visitor viewing someone
 * else's profile when that profile has no About text set, same "don't
 * show an empty section" rule ExperienceSection/SkillsSection/etc. follow.
 */
export default function AboutSection({
  about,
  isSelf,
  onSaved,
}: {
  about: string | null;
  isSelf: boolean;
  onSaved: (about: string | null) => void;
}) {
  const t = useTranslations("connections");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(about ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSelf && !about) return null;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ about: value.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("detail.editError"));
      }
      onSaved(value.trim() || null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("detail.editError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">{t("detail.aboutTitle")}</h2>
        {isSelf && !editing && (
          <button
            type="button"
            onClick={() => {
              setValue(about ?? "");
              setError(null);
              setEditing(true);
            }}
            aria-label={t("detail.editProfile")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-background hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_ABOUT_CHARS))}
            rows={6}
            placeholder={t("detail.aboutPlaceholder")}
            className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-start focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="mt-1 text-end text-[11px] text-foreground/40">
            {value.length}/{MAX_ABOUT_CHARS}
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {t("detail.save")}
            </Button>
          </div>
        </div>
      ) : about ? (
        <p className="mt-2 whitespace-pre-wrap text-start text-sm text-foreground/80">{about}</p>
      ) : (
        isSelf && <p className="mt-2 text-sm text-foreground/40">{t("detail.aboutEmpty")}</p>
      )}
    </Card>
  );
}
