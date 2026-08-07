import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Logo from "./Logo";
import { Briefcase, Globe2, LayoutDashboard, ShieldCheck } from "lucide-react";

const BULLET_ICONS = [Briefcase, Globe2, LayoutDashboard, ShieldCheck];

/**
 * Shared split-screen chrome for the employer signup and login pages.
 * Previously both pages reused the bare consumer auth card centered on an
 * empty background — functional, but it gave a B2B hiring audience nothing
 * that said "this is a real place to hire," no different from the
 * job-seeker signup form. This adds a branded value-prop panel alongside
 * the form, the standard pattern for B2B SaaS signup/login (Indeed for
 * Employers, LinkedIn Jobs, etc.) — desktop only (`hidden lg:flex`), so
 * mobile — most of this app's actual traffic — is untouched and still gets
 * the same single centered card as before.
 *
 * `flex-row` (not `lg:flex-row-reverse` etc.) is deliberate: CSS flexbox's
 * row axis already follows the document's writing direction, so this panel
 * automatically lands on the correct side for Arabic (dir="rtl", set on
 * <html> in app/[locale]/layout.tsx) with zero extra logic here.
 */
export default function EmployerAuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("employer.authPanel");
  const tHome = useTranslations("home");
  const bullets = t.raw("bullets") as string[];
  const regions = tHome.raw("regions") as string[];

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-full max-w-md flex-none flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-800 p-10 lg:flex">
        <div className="pattern-motif pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
        <div
          className="orb orb-1 h-64 w-64 bg-gold-300/20"
          style={{ top: "-6%", insetInlineEnd: "-10%" }}
          aria-hidden="true"
        />
        <div
          className="orb orb-3 h-56 w-56 bg-emerald-300/20"
          style={{ bottom: "8%", insetInlineStart: "-12%" }}
          aria-hidden="true"
        />

        <Link href="/" className="relative z-10">
          <Logo light />
        </Link>

        <div className="relative z-10">
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold-200">
            {t("badge")}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white">{t("heading")}</h2>
          <p className="mt-3 text-sm text-emerald-50/80">{t("subtitle")}</p>

          <ul className="mt-8 space-y-4">
            {bullets.map((bullet, i) => {
              const Icon = BULLET_ICONS[i % BULLET_ICONS.length];
              return (
                <li key={bullet} className="flex items-start gap-3 text-sm text-white/90">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10 text-gold-200">
                    <Icon size={14} />
                  </span>
                  <span className="pt-1">{bullet}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
            {tHome("regionsLabel")}
          </p>
          <p className="mt-2 text-sm text-white/80">{regions.join(" · ")}</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-sand-100 px-6 py-16">{children}</div>
    </div>
  );
}
