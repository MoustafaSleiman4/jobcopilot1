"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { ProfileDetail } from "@/lib/social-types";

const MAX_HEADLINE_CHARS = 220;

/** Edits the viewer's own headline, "Open to work" flag, and profile-view privacy — see PATCH /api/profile/me. */
export default function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProfileDetail;
  onClose: () => void;
  onSaved: (patch: Partial<ProfileDetail>) => void;
}) {
  const t = useTranslations("connections");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [openToWork, setOpenToWork] = useState(profile.openToWork);
  const [privateProfileViews, setPrivateProfileViews] = useState(profile.privateProfileViews);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: headline.trim(), openToWork, privateProfileViews }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("detail.editError"));
      }
      onSaved({ headline: headline.trim() || null, openToWork, privateProfileViews });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("detail.editError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">{t("detail.editProfile")}</h2>
            <button type="button" onClick={onClose} aria-label={t("detail.close")} className="text-foreground/50 hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-foreground/60">{t("detail.headlineLabel")}</label>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value.slice(0, MAX_HEADLINE_CHARS))}
              placeholder={t("detail.headlinePlaceholder")}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-start focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <p className="mt-1 text-end text-[11px] text-foreground/40">{headline.length}/{MAX_HEADLINE_CHARS}</p>
          </div>

          <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-background p-3">
            <span className="text-sm font-medium text-foreground">{t("openToWork")}</span>
            <input type="checkbox" checked={openToWork} onChange={(e) => setOpenToWork(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          </label>

          <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-background p-3">
            <span className="text-sm font-medium text-foreground">{t("detail.privateProfileViews")}</span>
            <input
              type="checkbox"
              checked={privateProfileViews}
              onChange={(e) => setPrivateProfileViews(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
          </label>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {t("detail.save")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
