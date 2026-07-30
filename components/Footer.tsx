import { useTranslations } from "next-intl";
import Logo from "./Logo";

export default function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-10 text-center">
        <Logo />
        <p className="text-sm text-foreground/60">{t("tagline")}</p>
        <p className="text-xs text-foreground/40">
          © {year} JobCopilot. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
