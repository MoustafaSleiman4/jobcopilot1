"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function PricingCards() {
  const t = useTranslations("pricing");
  const [yearly, setYearly] = useState(false);

  const freeFeatures = t.raw("free.features") as string[];
  const proFeatures = t.raw("pro.features") as string[];

  return (
    <div>
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-surface p-1">
        <button
          onClick={() => setYearly(false)}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
            !yearly ? "bg-emerald-600 text-white" : "text-foreground/60"
          }`}
        >
          {t("monthly")}
        </button>
        <button
          onClick={() => setYearly(true)}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
            yearly ? "bg-emerald-600 text-white" : "text-foreground/60"
          }`}
        >
          {t("yearly")}
          <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
            {t("yearlySave")}
          </span>
        </button>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-8 sm:grid-cols-2">
        {/* Free plan */}
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h3 className="text-xl font-bold text-foreground">{t("free.name")}</h3>
          <p className="mt-1 text-sm text-foreground/60">{t("free.desc")}</p>
          <p className="mt-6 text-4xl font-extrabold text-foreground">
            {t("free.price")}
            <span className="text-base font-medium text-foreground/50"> / {t("free.period")}</span>
          </p>
          <ul className="mt-8 space-y-3">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="mt-8 block rounded-full border border-border py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-sand-100"
          >
            {t("free.name")}
          </Link>
        </div>

        {/* Pro plan */}
        <div className="relative rounded-2xl border-2 border-gold-400 bg-surface p-8 shadow-lg shadow-gold-400/10">
          <span className="absolute -top-3 left-8 rounded-full bg-gold-400 px-3 py-1 text-xs font-bold text-emerald-900">
            {t("pro.badge")}
          </span>
          <h3 className="text-xl font-bold text-foreground">{t("pro.name")}</h3>
          <p className="mt-1 text-sm text-foreground/60">{t("pro.desc")}</p>
          <p className="mt-6 text-4xl font-extrabold text-foreground">
            {yearly ? t("pro.yearlyPrice") : t("pro.monthlyPrice")}
            <span className="text-base font-medium text-foreground/50">
              {" "}
              {yearly ? t("pro.yearlyPeriod") : t("pro.monthlyPeriod")}
            </span>
          </p>
          <ul className="mt-8 space-y-3">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href={`/signup?plan=${yearly ? "yearly" : "monthly"}`}
            className="mt-8 block rounded-full bg-emerald-600 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            {t("pro.cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
