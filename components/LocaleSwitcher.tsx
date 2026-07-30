"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1 text-sm">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            l === locale
              ? "bg-emerald-600 text-white"
              : "text-foreground/60 hover:text-foreground"
          }`}
          aria-current={l === locale}
        >
          {l === "en" ? "EN" : "AR"}
        </button>
      ))}
    </div>
  );
}
