import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";

export default function Navbar() {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-foreground/70 md:flex">
          <Link href="/pricing" className="hover:text-foreground">
            {t("pricing")}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="hidden text-sm font-medium text-foreground/70 hover:text-foreground sm:block"
          >
            {t("login")}
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            {t("signup")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
