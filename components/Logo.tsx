export default function Logo({
  className = "",
  light = false,
  compact = false,
}: {
  className?: string;
  light?: boolean;
  // Icon-mark only, no "GulfJobCopilot" wordmark — for tight spaces like the
  // dashboard's mobile header, which already has to fit a notification
  // bell, locale switcher, and account menu next to it on a phone-width
  // screen. The full wordmark (~130px) was the single biggest contributor
  // to that header overflowing/overlapping on narrow devices (e.g. iPhone
  // 13 at 390px), since it doesn't shrink or truncate on its own.
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg shadow-sm ${
          light ? "bg-white/15 text-gold-200" : "bg-gradient-to-br from-emerald-500 to-emerald-700 text-gold-100"
        }`}
      >
        {/* Burj Khalifa silhouette — a few bold stepped tiers tapering to a
            thin spire, sized for legibility at 20px rather than a literal
            multi-terrace rendering (too many thin steps just blur together
            this small). */}
        <svg viewBox="0 0 24 24" fill="none" className="h-5.5 w-5.5">
          <path
            d="M7 22L7 17L8.8 17L8.8 13L10.2 13L10.2 9L11.4 9L11.4 5L12 2L12.6 5L12.6 9L13.8 9L13.8 13L15.2 13L15.2 17L17 17L17 22Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {/* `light` renders the wordmark for dark backgrounds (e.g. the
          employer auth panel) — the default emerald-600 "JobCopilot" reads
          as near-black on a dark emerald gradient otherwise. */}
      {!compact && (
        <span className={`text-lg ${light ? "text-white" : ""}`}>
          Gulf<span className={light ? "text-gold-200" : "text-emerald-600"}>JobCopilot</span>
        </span>
      )}
    </span>
  );
}
