"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, Sparkles, Save } from "lucide-react";

export default function ResumeBuilderPage() {
  const t = useTranslations("dashboard.resume");
  const [summary, setSummary] = useState(
    "Marketing coordinator with 3 years of experience running paid social campaigns for retail brands across the UAE."
  );
  const [enhancing, setEnhancing] = useState(false);

  async function handleEnhance() {
    setEnhancing(true);
    try {
      const res = await fetch("/api/resume/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      const data = await res.json();
      setSummary(data.enhanced ?? summary);
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface p-8 text-center transition-colors hover:border-emerald-400">
          <Upload className="text-emerald-600" size={28} />
          <span className="text-sm font-medium text-foreground">{t("upload")}</span>
          <input type="file" accept=".pdf,.doc,.docx" className="hidden" />
        </label>
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-8 text-center text-sm text-foreground/60">
          {t("orBuild")}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Professional summary</h2>
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Sparkles size={14} />
            {enhancing ? t("enhancing") : t("enhance")}
          </button>
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={6}
          className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <button className="mt-4 flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          <Save size={15} />
          {t("save")}
        </button>
      </div>
    </div>
  );
}
