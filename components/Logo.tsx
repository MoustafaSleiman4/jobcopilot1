export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-gold-100 shadow-sm">
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
      <span className="text-lg">
        Gulf<span className="text-emerald-600">JobCopilot</span>
      </span>
    </span>
  );
}
