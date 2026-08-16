import { useTranslations } from "next-intl";

// Exported (not just used internally) so the homepage's bigger "follow us"
// cards (see the social/community section in app/[locale]/page.tsx) reuse
// the exact same handles/icon paths instead of a second copy that could
// drift out of sync with the footer's.
export const SOCIAL_LINKS = [
  {
    key: "facebook",
    href: "https://www.facebook.com/people/GulfjobCopilot/61593025056482/",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.622-.017c-.577 0-1.036.089-1.436.427-.393.331-.611.87-.611 1.664v1.897h3.4l-.554 3.667h-2.846v7.98H9.101Z",
  },
  {
    key: "linkedin",
    href: "https://www.linkedin.com/company/gulf-job-copilot",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667h-3.554V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125ZM7.114 20.452H3.56V9h3.554v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z",
  },
  {
    key: "tiktok",
    href: "https://www.tiktok.com/@gulfjobcopilot",
    path: "M16.436.02c.083 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97a8.94 8.94 0 0 1-1.62-.93c-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71a11.4 11.4 0 0 1-.01-1.49c.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44a3.06 3.06 0 0 0-3.02.37 3.05 3.05 0 0 0-1.36 1.75c-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07 1.31-.02 2.61-.01 3.91-.02Z",
  },
] as const;

export default function SocialLinks({ className = "" }: { className?: string }) {
  const t = useTranslations("footer");

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {SOCIAL_LINKS.map(({ key, href, path }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(`${key}AriaLabel`)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/50 transition-colors hover:bg-emerald-600/10 hover:text-emerald-600"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
            <path d={path} fill="currentColor" />
          </svg>
        </a>
      ))}
    </div>
  );
}
